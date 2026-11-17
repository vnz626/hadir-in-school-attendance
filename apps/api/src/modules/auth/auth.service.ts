import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "@hadirin/domain";
import {
  ERROR_CODE,
  USER_ROLE,
  type AuthUser,
  type ChangePasswordRequest,
  type LoginRequest,
  type UserRole,
} from "@hadirin/shared";
import type { AuthContext } from "../../common/auth.decorators";
import { AppError, notFound, unauthenticated, validationError } from "../../common/errors";
import { APP_CONFIG, type AppConfig } from "../../config/env";
import { CLOCK, MAILER, RATE_LIMITER } from "../../infra/tokens";
import type { Mailer } from "../../infra/mailer";
import { PrismaService } from "../../infra/prisma.service";
import type { RateLimiter } from "../../infra/rate-limiter";
import { AccessPolicy } from "../access-policy/access-policy.service";
import { AuditService } from "../audit/audit.service";
import { DevicesService } from "../devices/devices.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

export interface RequestMeta {
  ip: string;
  userAgent: string | null;
}

export interface Session {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

// Rancangan §12.6: login per akun 5 gagal -> jeda 15 menit; per IP 60/menit.
const LOGIN_FAIL_LIMIT = 5;
const LOGIN_FAIL_WINDOW_MS = 15 * 60_000;
const LOGIN_IP_LIMIT = 60;
const LOGIN_IP_WINDOW_MS = 60_000;
const RESET_LINK_TTL_MS = 30 * 60_000;
const FORGOT_IP_LIMIT = 10;
const FORGOT_EMAIL_LIMIT = 3;
const FORGOT_WINDOW_MS = 15 * 60_000;

interface UserRow {
  id: string;
  schoolId: string;
  role: UserRole;
  name: string;
  mustChangePassword: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly policy: AccessPolicy,
    private readonly devices: DevicesService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private rateLimited(key: string, windowMs: number): AppError {
    const seconds = Math.max(1, Math.ceil(this.limiter.retryAfterMs(key, windowMs) / 1000));
    return new AppError(
      ERROR_CODE.RATE_LIMITED,
      429,
      "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.",
      { retryAfterSeconds: seconds },
    );
  }

  private toAuthUser(u: UserRow): AuthUser {
    return { id: u.id, role: u.role, name: u.name, mustChangePassword: u.mustChangePassword };
  }

  private async issueSession(u: UserRow, meta: RequestMeta, familyId?: string): Promise<Session> {
    const now = this.clock.now();
    const refreshExpiresAt = new Date(now.getTime() + this.config.refreshTtlDays * 86_400_000);
    const opaque = this.tokens.newOpaqueToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: u.id,
        tokenHash: opaque.hash,
        familyId: familyId ?? crypto.randomUUID(),
        expiresAt: refreshExpiresAt,
        ip: meta.ip.slice(0, 45),
        userAgent: meta.userAgent,
      },
    });
    const accessToken = await this.tokens.signAccess({
      userId: u.id,
      role: u.role,
      schoolId: u.schoolId,
      mustChangePassword: u.mustChangePassword,
    });
    return { user: this.toAuthUser(u), accessToken, refreshToken: opaque.raw, refreshExpiresAt };
  }

  async login(input: LoginRequest, meta: RequestMeta): Promise<Session> {
    const ipKey = `login:ip:${meta.ip}`;
    const acctKey = `login:acct:${input.identifier.toLowerCase()}`;
    if (this.limiter.count(ipKey, LOGIN_IP_WINDOW_MS) >= LOGIN_IP_LIMIT) {
      throw this.rateLimited(ipKey, LOGIN_IP_WINDOW_MS);
    }
    this.limiter.hit(ipKey, LOGIN_IP_WINDOW_MS);
    if (this.limiter.count(acctKey, LOGIN_FAIL_WINDOW_MS) >= LOGIN_FAIL_LIMIT) {
      throw this.rateLimited(acctKey, LOGIN_FAIL_WINDOW_MS);
    }

    const isEmail = input.identifier.includes("@");
    const user = await this.prisma.user.findFirst({
      where: isEmail
        ? { email: input.identifier, role: { in: [USER_ROLE.ADMIN, USER_ROLE.TEACHER] } }
        : { loginId: input.identifier, role: USER_ROLE.STUDENT },
    });

    const usable = user && user.isActive && user.deletedAt === null && user.passwordHash !== null;
    const ok = usable ? await this.passwords.verify(user.passwordHash!, input.password) : false;
    if (!usable || !ok) {
      if (!usable) await this.passwords.verifyAgainstDummy(input.password);
      this.limiter.hit(acctKey, LOGIN_FAIL_WINDOW_MS);
      throw unauthenticated("Email/NIS atau kata sandi tidak cocok.");
    }

    this.limiter.reset(acctKey);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: this.clock.now() },
    });
    if (user.role === USER_ROLE.STUDENT && input.deviceId) {
      await this.devices.registerPassive(user.id, input.deviceId);
    }
    return this.issueSession(user, meta);
  }

  /** Revokasi seluruh keluarga token: dipakai saat pemakaian ulang terdeteksi dan saat logout. */
  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<Session> {
    if (!rawToken) throw unauthenticated();
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashOpaque(rawToken) },
      include: { user: true },
    });
    if (!existing) throw unauthenticated();

    const now = this.clock.now();
    const user = existing.user;

    // Pemakaian ulang token yang sudah dirotasi = kemungkinan dicuri: cabut seluruh keluarga (Rancangan §14.1).
    const reuse = async (): Promise<never> => {
      await this.revokeFamily(existing.familyId);
      await this.audit.log({
        schoolId: user.schoolId,
        actorId: user.id,
        action: "REFRESH_TOKEN_REUSE",
        entity: "refresh_tokens",
        entityId: existing.familyId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw unauthenticated();
    };

    if (existing.revokedAt !== null) return reuse();
    if (existing.expiresAt <= now) throw unauthenticated();
    if (!user.isActive || user.deletedAt !== null) {
      await this.revokeFamily(existing.familyId);
      throw unauthenticated();
    }

    // Klaim atomik: hanya satu permintaan yang boleh merotasi token ini.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (claimed.count === 0) return reuse();

    const session = await this.issueSession(user, meta, existing.familyId);
    const created = await this.prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: this.tokens.hashOpaque(session.refreshToken) },
    });
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { replacedBy: created.id },
    });
    return session;
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashOpaque(rawToken) },
    });
    if (existing) await this.revokeFamily(existing.familyId);
  }

  /**
   * Wali kelas atau admin mengatur ulang kata sandi siswa (Rancangan §14.1). Kata sandi sementara
   * dikembalikan SEKALI; yang tercatat di audit_logs hanya kejadiannya, tanpa nilainya.
   */
  async resetStudentPassword(
    actor: AuthContext,
    studentId: string,
    meta: RequestMeta,
  ): Promise<string> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null, user: { schoolId: actor.schoolId } },
      include: { user: true },
    });
    if (!student) throw notFound("Siswa tidak ditemukan.");
    await this.policy.assertCanManageStudent(actor, studentId);

    const temporaryPassword = this.passwords.generateTemporary();
    await this.prisma.user.update({
      where: { id: student.userId },
      data: {
        passwordHash: await this.passwords.hash(temporaryPassword),
        mustChangePassword: true,
      },
    });
    await this.revokeAllForUser(student.userId);
    await this.audit.log({
      schoolId: student.user.schoolId,
      actorId: actor.userId,
      action: "STUDENT_PASSWORD_RESET",
      entity: "students",
      entityId: studentId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return temporaryPassword;
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.deletedAt !== null) throw unauthenticated();
    return this.toAuthUser(user);
  }

  async changePassword(
    userId: string,
    input: ChangePasswordRequest,
    meta: RequestMeta,
  ): Promise<Session> {
    const key = `pwchange:${userId}`;
    if (this.limiter.count(key, LOGIN_FAIL_WINDOW_MS) >= LOGIN_FAIL_LIMIT) {
      throw this.rateLimited(key, LOGIN_FAIL_WINDOW_MS);
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.deletedAt !== null || !user.passwordHash)
      throw unauthenticated();

    if (!(await this.passwords.verify(user.passwordHash, input.currentPassword))) {
      this.limiter.hit(key, LOGIN_FAIL_WINDOW_MS);
      throw validationError("Kata sandi saat ini tidak cocok.", {
        issues: [{ path: "currentPassword", message: "Kata sandi saat ini tidak cocok." }],
      });
    }
    if (input.newPassword === input.currentPassword) {
      throw validationError("Kata sandi baru harus berbeda dari yang lama.", {
        issues: [{ path: "newPassword", message: "Kata sandi baru harus berbeda dari yang lama." }],
      });
    }
    this.limiter.reset(key);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.passwords.hash(input.newPassword),
        mustChangePassword: false,
      },
    });
    await this.revokeAllForUser(userId);
    await this.audit.log({
      schoolId: user.schoolId,
      actorId: user.id,
      action: "PASSWORD_CHANGED",
      entity: "users",
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.issueSession(updated, meta);
  }

  /** Selalu selesai tanpa galat dan tanpa menunjukkan apakah email terdaftar. */
  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    const ipKey = `forgot:ip:${meta.ip}`;
    const mailKey = `forgot:email:${email.toLowerCase()}`;
    const limited =
      this.limiter.count(ipKey, FORGOT_WINDOW_MS) >= FORGOT_IP_LIMIT ||
      this.limiter.count(mailKey, FORGOT_WINDOW_MS) >= FORGOT_EMAIL_LIMIT;
    this.limiter.hit(ipKey, FORGOT_WINDOW_MS);
    this.limiter.hit(mailKey, FORGOT_WINDOW_MS);
    if (limited) return;

    const user = await this.prisma.user.findFirst({
      where: {
        email,
        role: { in: [USER_ROLE.ADMIN, USER_ROLE.TEACHER] },
        isActive: true,
        deletedAt: null,
      },
    });
    if (!user?.email) return;

    const now = this.clock.now();
    await this.prisma.loginToken.updateMany({
      where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null },
      data: { usedAt: now },
    });
    const opaque = this.tokens.newOpaqueToken();
    await this.prisma.loginToken.create({
      data: {
        userId: user.id,
        purpose: "PASSWORD_RESET",
        tokenHash: opaque.hash,
        expiresAt: new Date(now.getTime() + RESET_LINK_TTL_MS),
      },
    });
    const origin = this.config.appOrigins[0] ?? "http://localhost:3000";
    await this.mailer.send({
      to: user.email,
      subject: "Atur ulang kata sandi hadir.in",
      body: `Buka tautan ini untuk membuat kata sandi baru (berlaku 30 menit, sekali pakai):\n${origin}/atur-ulang?token=${opaque.raw}`,
    });
  }

  async resetPassword(rawToken: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const invalid = () =>
      validationError(
        "Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru dari halaman masuk.",
      );
    const row = await this.prisma.loginToken.findUnique({
      where: { tokenHash: this.tokens.hashOpaque(rawToken) },
      include: { user: true },
    });
    const now = this.clock.now();
    if (!row || row.purpose !== "PASSWORD_RESET" || row.usedAt !== null || row.expiresAt <= now)
      throw invalid();
    if (!row.user.isActive || row.user.deletedAt !== null) throw invalid();

    // Sekali pakai, atomik.
    const claimed = await this.prisma.loginToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count === 0) throw invalid();

    await this.prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: await this.passwords.hash(newPassword), mustChangePassword: false },
    });
    await this.revokeAllForUser(row.userId);
    await this.audit.log({
      schoolId: row.user.schoolId,
      actorId: row.userId,
      action: "PASSWORD_RESET_BY_LINK",
      entity: "users",
      entityId: row.userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
