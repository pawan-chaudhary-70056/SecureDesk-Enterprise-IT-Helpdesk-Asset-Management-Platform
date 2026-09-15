import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../database/prisma.service";
import { PERMISSIONS, type PermissionName } from "../constants";
import type { Request, Response } from "express";

export interface RequestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: PermissionName[];
}

declare module "express" {
  interface Request {
    user?: RequestUser;
    requestId?: string;
  }
}

export const PERMISSIONS_KEY = "requiredPermissions";
/** Decorator listing permissions required by a route (any-of). */
export const RequirePermissions = (...perms: PermissionName[]) => SetMetadata(PERMISSIONS_KEY, perms);

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    let payload: { sub: string; email: string };
    try {
      payload = this.jwt.verify(header.slice(7), { secret: process.env.JWT_ACCESS_SECRET });
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("User is inactive or no longer exists");
    }
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      permissions: user.role.permissions.map((rp) => rp.permission.name as PermissionName),
    };
    return true;
  }
}

/**
 * RBAC guard: requires the listed permissions (any-of) on the route.
 * Object-level authorization is additionally enforced in services/policies.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionName[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) throw new UnauthorizedException();
    const owned = new Set(req.user.permissions);
    const ok = required.some((p) => owned.has(p));
    if (!ok) {
      throw new ForbiddenException("Insufficient permissions");
    }
    return true;
  }
}

/** Helper for services to assert a permission (defense in depth). */
export function assertPermission(user: RequestUser | undefined, perm: PermissionName): void {
  if (!user) throw new UnauthorizedException();
  if (user.role === "ADMIN") return;
  if (!user.permissions.includes(perm)) {
    throw new ForbiddenException("Insufficient permissions");
  }
}

export type { Request as ExpressRequest, Response as ExpressResponse };
export { PERMISSIONS };
