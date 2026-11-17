import { Body, Controller, Get, Injectable, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import type { z } from "zod";
import {
  USER_ROLE,
  schoolSettingsSchema,
  settingsUpdateSchema,
  type SchoolSettings,
  type SettingsDto,
} from "@hadirin/shared";
import { CurrentUser, Roles, type AuthContext } from "../../common/auth.decorators";
import { clientIp, userAgentOf } from "../../common/http";
import { notFound, validationError } from "../../common/errors";
import { ZodValidationPipe } from "../../common/zod.pipe";
import { PrismaService } from "../../infra/prisma.service";
import { AccessPolicy } from "../access-policy/access-policy.service";
import { AuditService } from "../audit/audit.service";

const DEFAULT_SETTINGS: SchoolSettings = {
  checkinModes: ["QR", "QUICK"],
  attendanceMode: "DAILY_ONLY",
  schoolDays: [1, 2, 3, 4, 5],
  dailyStartTime: 420,
  dailyCloseTime: 540,
  defaultLateAfterMinutes: 10,
  lateAfterOpenGraceMinutes: 5,
  adhocSessionMinutes: 60,
  geofenceEnabled: false,
  locationAccuracyMaxM: 100,
  deviceBindingEnabled: false,
  deviceSelfRebindDays: 60,
  percentageRule: "EXCLUDE_EXCUSED",
  notifyQuietStart: 360,
  notifyQuietEnd: 1200,
  subjectDigestTime: 900,
  backfillDays: 7,
  retentionYears: 3,
};

function toSettings(row: Record<string, unknown>): SchoolSettings {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) out[key] = row[key];
  return out as unknown as SchoolSettings;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
    private readonly audit: AuditService,
  ) {}

  /** Pengaturan tersimpan; dibuat dengan nilai bawaan Rancangan §20.3 bila sekolah belum punya. */
  private async loadOrCreate(schoolId: string) {
    const existing = await this.prisma.schoolSetting.findUnique({ where: { schoolId } });
    if (existing) return existing;
    return this.prisma.schoolSetting.create({ data: { schoolId, ...DEFAULT_SETTINGS } });
  }

  async get(actor: AuthContext): Promise<SettingsDto> {
    await this.policy.assertCanReadSchoolSettings(actor);
    const school = await this.prisma.school.findUnique({ where: { id: actor.schoolId } });
    if (!school) throw notFound("Sekolah tidak ditemukan.");
    const row = await this.loadOrCreate(actor.schoolId);
    return {
      school: {
        name: school.name,
        npsn: school.npsn,
        address: school.address,
        timezone: school.timezone,
      },
      settings: toSettings(row as unknown as Record<string, unknown>),
      readOnly: !this.policy.isAdmin(actor),
    };
  }

  async update(
    actor: AuthContext,
    input: z.infer<typeof settingsUpdateSchema>,
    meta: { ip: string; userAgent: string | null },
  ): Promise<SettingsDto> {
    this.policy.assertAdmin(actor);
    const current = await this.get(actor);

    // Validasi lintas-bidang pada gabungan nilai tersimpan dan perubahan.
    const merged = schoolSettingsSchema.safeParse({
      ...current.settings,
      ...(input.settings ?? {}),
    });
    if (!merged.success) {
      throw validationError("Pengaturan tidak valid. Periksa isian lalu coba lagi.", {
        issues: merged.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    if (input.school?.timezone) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: input.school.timezone });
      } catch {
        throw validationError("Zona waktu tidak dikenal. Gunakan nama zona seperti Asia/Jakarta.", {
          issues: [{ path: "school.timezone", message: "Zona waktu tidak dikenal." }],
        });
      }
    }

    await this.prisma.$transaction([
      this.prisma.school.update({ where: { id: actor.schoolId }, data: input.school ?? {} }),
      this.prisma.schoolSetting.update({ where: { schoolId: actor.schoolId }, data: merged.data }),
    ]);

    // Perubahan pengaturan tercatat (Rancangan §14.1): hanya nama bidang yang berubah, bukan nilainya.
    await this.audit.log({
      schoolId: actor.schoolId,
      actorId: actor.userId,
      action: "SETTINGS_UPDATED",
      entity: "school_settings",
      entityId: actor.schoolId,
      meta: {
        changed: [
          ...Object.keys(input.settings ?? {}),
          ...Object.keys(input.school ?? {}).map((k) => `school.${k}`),
        ],
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.get(actor);
  }
}

@Controller("settings")
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  // Guru mapel mendapat 403 dari AccessPolicy; BK dan kepala sekolah boleh membaca saja.
  @Roles(USER_ROLE.ADMIN, USER_ROLE.TEACHER)
  @Get("school")
  get(@CurrentUser() a: AuthContext) {
    return this.svc.get(a);
  }

  @Roles(USER_ROLE.ADMIN)
  @Put("school")
  update(
    @CurrentUser() a: AuthContext,
    @Body(new ZodValidationPipe(settingsUpdateSchema)) b: z.infer<typeof settingsUpdateSchema>,
    @Req() req: Request,
  ) {
    return this.svc.update(a, b, { ip: clientIp(req), userAgent: userAgentOf(req) });
  }
}
