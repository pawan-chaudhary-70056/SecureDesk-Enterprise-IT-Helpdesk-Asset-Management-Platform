import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import type { Request } from "express";
import { PrismaService } from "../../database/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { SecurityEventService } from "../../security/security-event.service";
import { generateOpaqueToken, sha256 } from "../../common/utils/hash";
import { ROLES, AUDIT_ACTIONS, SECURITY_EVENTS, type RoleName } from "../../common/constants";
import type { RegisterDto, LoginDto, ResetPasswordDto, ChangePasswordDto } from "./auth.schema";

const REFRESH_COOKIE = "securedesk_rt";
const ArgonOpts = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export interface AuthResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    permissions: string[];
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly securityEvents: SecurityEventService,
  ) {}

  // ── Registration ──────────────────────────────────────────────

  async register(dto: RegisterDto, ip?: string, requestId?: string): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      await this.securityEvents.record({ type: SECURITY_EVENTS.AUTH_REGISTER, email: dto.email, detail: "duplicate_email", ip, requestId });
      // Do not reveal which emails exist.
      throw new BadRequestException("Unable to register with the provided details");
    }
    const employeeRole = await this.prisma.role.findUnique({ where: { name: ROLES.EMPLOYEE } });
    if (!employeeRole) throw new Error("EMPLOYEE role missing — run the seed script");

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash: await argon2.hash(dto.password, ArgonOpts),
        roleId: employeeRole.id,
      },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    await this.audit.record({ actorId: user.id, action: AUDIT_ACTIONS.USER_CREATED, entityType: "User", entityId: user.id, ip, requestId });
    const result = await this.loginCore(user, dto.password, ip, requestId, /* expectPassword */ false);
    return result;
  }

  // ── Login ─────────────────────────────────────────────────────

  async login(dto: LoginDto, ip?: string, requestId?: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || !user.isActive) {
      await this.recordLoginFailure(dto.email, ip, requestId, user?.id);
      throw new UnauthorizedException("Invalid credentials");
    }
    return this.loginCore(user, dto.password, ip, requestId, true);
  }

  private async loginCore(
    user: { id: string; email: string; name: string; passwordHash: string; isActive: boolean; role: { name: string; permissions: Array<{ permission: { name: string } }> } },
    password: string,
    ip: string | undefined,
    requestId: string | undefined,
    expectPassword: boolean,
  ): Promise<AuthResult> {
    const valid = expectPassword ? await argon2.verify(user.passwordHash, password) : true;
    if (!valid) {
      await this.recordLoginFailure(user.email, ip, requestId, user.id);
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({ actorId: user.id, action: AUDIT_ACTIONS.LOGIN, entityType: "User", entityId: user.id, ip, requestId });

    const permissions = user.role.permissions.map((rp) => rp.permission.name);
    const accessToken = await this.signAccessToken(user.id, user.email);
    return { accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role.name as RoleName, permissions } };
  }

  private async recordLoginFailure(email: string, ip: string | undefined, requestId: string | undefined, userId?: string): Promise<void> {
    await this.securityEvents.record({
      type: SECURITY_EVENTS.AUTH_LOGIN_FAILED,
      userId: userId ?? null,
      email,
      detail: "invalid_credentials",
      ip,
      requestId,
    });
    await this.audit.record({ actorId: userId ?? null, action: AUDIT_ACTIONS.LOGIN_FAILURE, entityType: "User", ip, requestId });
  }

  // ── Refresh tokens (opaque, hashed at rest, rotated, family reuse detection) ──

  async issueRefreshToken(userId: string, family: string | null, ip?: string, userAgent?: string): Promise<string> {
    const token = generateOpaqueToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(token),
        family: family ?? crypto.randomUUID(),
        expiresAt: new Date(Date.now() + Number(process.env.JWT_REFRESH_EXPIRES_DAYS ?? 30) * 24 * 3600 * 1000),
        ip,
        userAgent,
      },
    });
    return token;
  }

  /**
   * Rotate a refresh token. If a previously-rotated (revoked) token is replayed,
   * the whole token family is revoked (theft detection) and a security event recorded.
   */
  async rotateRefreshToken(rawToken: string, ip?: string, userAgent?: string, requestId?: string): Promise<AuthResult> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!stored) throw new UnauthorizedException("Invalid refresh token");

    if (stored.revokedAt) {
      // Token reuse detected — revoke entire family.
      await this.prisma.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.securityEvents.record({
        type: SECURITY_EVENTS.TOKEN_REUSE,
        userId: stored.userId,
        detail: `family=${stored.family}`,
        ip,
        requestId,
      });
      await this.audit.record({ actorId: stored.userId, action: AUDIT_ACTIONS.TOKEN_REUSE_DETECTED, entityType: "RefreshToken", entityId: stored.id, ip, requestId });
      throw new UnauthorizedException("Refresh token reuse detected — all sessions revoked");
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Refresh token expired");
    }
    if (!stored.user.isActive) throw new UnauthorizedException("User is inactive");

    const nextToken = await this.issueRefreshToken(stored.userId, stored.family, ip, userAgent);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: sha256(nextToken) },
    });
    await this.audit.record({ actorId: stored.userId, action: AUDIT_ACTIONS.TOKEN_REFRESHED, entityType: "User", entityId: stored.userId, ip, requestId });

    const permissions = stored.user.role.permissions.map((rp) => rp.permission.name);
    const accessToken = await this.signAccessToken(stored.user.id, stored.user.email);
    return {
      accessToken,
      user: { id: stored.user.id, email: stored.user.email, name: stored.user.name, role: stored.user.role.name as RoleName, permissions },
      refreshToken: nextToken,
    } as AuthResult & { refreshToken: string };
  }

  async revokeRefreshToken(rawToken: string, actorId?: string, ip?: string, requestId?: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!stored || stored.revokedAt) return;
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    await this.audit.record({ actorId: actorId ?? stored.userId, action: AUDIT_ACTIONS.LOGOUT, entityType: "User", entityId: stored.userId, ip, requestId });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  // ── Password reset ────────────────────────────────────────────

  /** Always returns a token string or null; callers respond identically either way (no enumeration). */
  async createPasswordResetToken(email: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return null;
    const token = generateOpaqueToken();
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });
    return token;
  }

  async resetPassword(dto: ResetPasswordDto, ip?: string, requestId?: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(dto.token) } });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Invalid or expired reset token");
    }
    const passwordHash = await argon2.hash(dto.password, ArgonOpts);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    // Any stolen session dies with the password change.
    await this.revokeAllSessions(record.userId);
    await this.securityEvents.record({ type: SECURITY_EVENTS.PASSWORD_RESET_USED, userId: record.userId, ip, requestId });
    await this.audit.record({ actorId: record.userId, action: AUDIT_ACTIONS.PASSWORD_RESET, entityType: "User", entityId: record.userId, ip, requestId });
  }

  async changePassword(userId: string, dto: ChangePasswordDto, ip?: string, requestId?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!ok) throw new ForbiddenException("Current password is incorrect");
    const passwordHash = await argon2.hash(dto.newPassword, ArgonOpts);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.revokeAllSessions(userId);
    await this.audit.record({ actorId: userId, action: AUDIT_ACTIONS.PASSWORD_RESET, entityType: "User", entityId: userId, detail: "self_change", ip, requestId });
  }

  // ── Helpers ───────────────────────────────────────────────────

  private async signAccessToken(sub: string, email: string): Promise<string> {
    return this.jwt.signAsync(
      { sub, email },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_EXPIRES ?? "15m" },
    );
  }

  me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: { select: { name: true, permissions: { select: { permission: { select: { name: true } } } } } },
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }

  static refreshCookieName(): string {
    return REFRESH_COOKIE;
  }

  static extractRefreshToken(req: Request): string | undefined {
    return (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
  }
}
