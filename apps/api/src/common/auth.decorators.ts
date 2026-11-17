import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { UserRole } from "@hadirin/shared";

export const IS_PUBLIC = "isPublic";
export const ROLES = "roles";
export const ALLOW_PENDING_PASSWORD = "allowPendingPassword";

/** Endpoint tanpa autentikasi (login, refresh, lupa kata sandi). Default setiap endpoint WAJIB login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Batasi ke peran tertentu (RBAC kasar). Kepemilikan data tetap dicek AccessPolicy. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

/** Boleh dipanggil walau pengguna belum mengganti kata sandi awal (ganti sandi, keluar, profil). */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

export interface AuthContext {
  userId: string;
  role: UserRole;
  schoolId: string;
  mustChangePassword: boolean;
}

export type AuthedRequest = Request & { auth?: AuthContext };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) throw new Error("CurrentUser dipakai pada endpoint tanpa autentikasi");
    return req.auth;
  },
);
