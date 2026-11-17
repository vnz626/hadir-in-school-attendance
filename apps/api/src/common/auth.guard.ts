import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TokenService } from "../modules/auth/token.service";
import { ALLOW_PENDING_PASSWORD, IS_PUBLIC, ROLES, type AuthedRequest } from "./auth.decorators";
import { forbidden, unauthenticated } from "./errors";
import { ACCESS_COOKIE, parseCookies } from "./http";
import type { UserRole } from "@hadirin/shared";

/**
 * Guard global autentikasi. Setiap endpoint WAJIB login kecuali ditandai @Public(). Token akses ada
 * di cookie httpOnly. Selama kata sandi awal belum diganti, hanya endpoint @AllowPendingPassword
 * yang boleh dipanggil.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = parseCookies(req.headers.cookie)[ACCESS_COOKIE];
    if (!token) throw unauthenticated();
    const claims = await this.tokens.verifyAccess(token);
    if (!claims) throw unauthenticated();

    if (
      claims.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, targets)
    ) {
      throw forbidden("Ganti kata sandi awal dulu sebelum melanjutkan.", {
        reason: "PASSWORD_CHANGE_REQUIRED",
      });
    }
    req.auth = {
      userId: claims.userId,
      role: claims.role,
      schoolId: claims.schoolId,
      mustChangePassword: claims.mustChangePassword,
    };
    return true;
  }
}

/** Guard RBAC kasar berdasarkan @Roles(). Kepemilikan data dicek AccessPolicy di layanan. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) return true; // endpoint publik; AuthGuard sudah memutuskan
    if (!roles.includes(req.auth.role)) throw forbidden();
    return true;
  }
}
