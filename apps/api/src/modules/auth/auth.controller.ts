import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import {
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
  type AuthUser,
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  type LoginRequest,
  type LoginResponse,
  type ResetPasswordRequest,
} from "@hadirin/shared";
import {
  AllowPendingPassword,
  CurrentUser,
  Public,
  type AuthContext,
} from "../../common/auth.decorators";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clientIp,
  parseCookies,
  userAgentOf,
} from "../../common/http";
import { ZodValidationPipe } from "../../common/zod.pipe";
import { APP_CONFIG, type AppConfig } from "../../config/env";
import { AuthService, type RequestMeta, type Session } from "./auth.service";
import { ACCESS_TTL_SECONDS } from "./token.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private meta(req: Request): RequestMeta {
    return { ip: clientIp(req), userAgent: userAgentOf(req) };
  }

  /** Cookie httpOnly satu origin; atribut Secure dari COOKIE_SECURE (Rancangan §9.3). */
  private setSessionCookies(res: Response, s: Session): void {
    const base = { httpOnly: true, sameSite: "lax" as const, secure: this.config.cookieSecure };
    res.cookie(ACCESS_COOKIE, s.accessToken, {
      ...base,
      path: "/",
      maxAge: ACCESS_TTL_SECONDS * 1000,
    });
    // Refresh token hanya dikirim ke endpoint auth, bukan ke setiap permintaan.
    res.cookie(REFRESH_COOKIE, s.refreshToken, {
      ...base,
      path: "/api/auth",
      expires: s.refreshExpiresAt,
    });
  }

  private clearSessionCookies(res: Response): void {
    const base = { httpOnly: true, sameSite: "lax" as const, secure: this.config.cookieSecure };
    res.clearCookie(ACCESS_COOKIE, { ...base, path: "/" });
    res.clearCookie(REFRESH_COOKIE, { ...base, path: "/api/auth" });
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const session = await this.auth.login(body, this.meta(req));
    this.setSessionCookies(res, session);
    return { user: session.user };
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    try {
      const session = await this.auth.refresh(
        parseCookies(req.headers.cookie)[REFRESH_COOKIE],
        this.meta(req),
      );
      this.setSessionCookies(res, session);
      return { user: session.user };
    } catch (e) {
      this.clearSessionCookies(res);
      throw e;
    }
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(parseCookies(req.headers.cookie)[REFRESH_COOKIE]);
    this.clearSessionCookies(res);
  }

  @AllowPendingPassword()
  @Get("me")
  async me(@CurrentUser() user: AuthContext): Promise<LoginResponse> {
    const profile: AuthUser = await this.auth.me(user.userId);
    return { user: profile };
  }

  @AllowPendingPassword()
  @Post("password/change")
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const session = await this.auth.changePassword(user.userId, body, this.meta(req));
    this.setSessionCookies(res, session);
    return { user: session.user };
  }

  @Public()
  @Post("password/forgot")
  @HttpCode(202)
  async forgot(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: ForgotPasswordRequest,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.forgotPassword(body.email, this.meta(req));
  }

  @Public()
  @Post("password/reset")
  @HttpCode(204)
  async reset(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.resetPassword(body.token, body.newPassword, this.meta(req));
  }
}
