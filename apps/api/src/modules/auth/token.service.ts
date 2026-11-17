import { Inject, Injectable } from "@nestjs/common";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Clock } from "@hadirin/domain";
import { USER_ROLE, type UserRole } from "@hadirin/shared";
import { APP_CONFIG, type AppConfig } from "../../config/env";
import { CLOCK } from "../../infra/tokens";

export const ACCESS_TTL_SECONDS = 15 * 60;

export interface AccessClaims {
  userId: string;
  role: UserRole;
  /** Sekolah pemilik akun: semua kueri data dibatasi ke sekolah ini. */
  schoolId: string;
  /** Kata sandi awal belum diganti: hanya endpoint ganti kata sandi yang boleh dipakai. */
  mustChangePassword: boolean;
}

const ROLES = new Set<string>(Object.values(USER_ROLE));

@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.key = new TextEncoder().encode(config.jwtAccessSecret);
  }

  async signAccess(claims: AccessClaims): Promise<string> {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    return new SignJWT({ role: claims.role, sch: claims.schoolId, mcp: claims.mustChangePassword })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(claims.userId)
      .setIssuedAt(iat)
      .setExpirationTime(iat + ACCESS_TTL_SECONDS)
      .sign(this.key);
  }

  /** `null` bila tanda tangan salah, kedaluwarsa, atau isinya tidak lengkap. */
  async verifyAccess(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        currentDate: this.clock.now(),
      });
      const role = payload.role;
      if (typeof payload.sub !== "string" || typeof role !== "string" || !ROLES.has(role))
        return null;
      if (typeof payload.sch !== "string") return null;
      return {
        userId: payload.sub,
        role: role as UserRole,
        schoolId: payload.sch,
        mustChangePassword: payload.mcp === true,
      };
    } catch {
      return null;
    }
  }

  /** Token acak 256 bit. Hanya hash-nya yang disimpan di database. */
  newOpaqueToken(): { raw: string; hash: string } {
    const raw = crypto.randomBytes(32).toString("base64url");
    return { raw, hash: this.hashOpaque(raw) };
  }

  hashOpaque(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex");
  }
}
