import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public, JwtAuthGuard } from "../../common/guards/auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from "./auth.schema";

const COOKIE = () => AuthService.refreshCookieName();

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(COOKIE(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/auth",
      maxAge: Number(process.env.JWT_REFRESH_EXPIRES_DAYS ?? 30) * 24 * 3600 * 1000,
    });
  }

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body(new ZodValidationPipe(registerSchema)) dto: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto as never, req.ip, req.requestId);
    const refresh = await this.auth.issueRefreshToken(result.user.id, null, req.ip, req.headers["user-agent"]);
    this.setRefreshCookie(res, refresh);
    return result;
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body(new ZodValidationPipe(loginSchema)) dto: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto as never, req.ip, req.requestId);
    const refresh = await this.auth.issueRefreshToken(result.user.id, null, req.ip, req.headers["user-agent"]);
    this.setRefreshCookie(res, refresh);
    return result;
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const bodyToken = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    const raw = bodyToken ?? AuthService.extractRefreshToken(req);
    if (!raw) throw new UnauthorizedException("No refresh token provided");
    const result = await this.auth.rotateRefreshToken(raw, req.ip, req.headers["user-agent"], req.requestId);
    const { refreshToken, ...rest } = result as typeof result & { refreshToken?: string };
    if (refreshToken) this.setRefreshCookie(res, refreshToken);
    return rest;
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = AuthService.extractRefreshToken(req);
    if (raw) await this.auth.revokeRefreshToken(raw, undefined, req.ip, req.requestId);
    res.clearCookie(COOKIE(), { path: "/api/v1/auth" });
    return { success: true };
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) dto: { email: string }, @Req() req: Request) {
    // Constant response regardless of account existence (no enumeration).
    const token = await this.auth.createPasswordResetToken(dto.email);
    if (token && process.env.NODE_ENV !== "production") {
      // Development convenience only: the reset token is logged, never returned
      // by the API. Production delivery goes through the email worker.
      console.log(`[dev] password reset token for ${dto.email}: ${token}`);
    }
    return { success: true, message: "If the account exists, a reset link has been sent" };
  }

  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) dto: unknown, @Req() req: Request) {
    await this.auth.resetPassword(dto as never, req.ip, req.requestId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  async changePassword(@CurrentUser() user: { id: string }, @Body(new ZodValidationPipe(changePasswordSchema)) dto: unknown, @Req() req: Request) {
    await this.auth.changePassword(user.id, dto as never, req.ip, req.requestId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() user: { id: string }) {
    return this.auth.me(user.id);
  }
}
