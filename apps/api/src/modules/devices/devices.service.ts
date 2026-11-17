import { Inject, Injectable } from "@nestjs/common";
import crypto from "node:crypto";
import type { Clock } from "@hadirin/domain";
import { APP_CONFIG, type AppConfig } from "../../config/env";
import { activeStudentKey } from "../../infra/db/keys";
import { PrismaService } from "../../infra/prisma.service";
import { CLOCK } from "../../infra/tokens";

/**
 * Registrasi perangkat PASIF (Fase 2): perangkat pertama siswa dicatat ACTIVE, tidak ada
 * penolakan. Pengikatan aktif (DEVICE_MISMATCH, ikat ulang) baru di Fase 6 (Rancangan §12.3).
 */
@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Server hanya menyimpan SHA-256(deviceId + pepper), bukan deviceId asli. */
  hashDeviceId(deviceId: string): string {
    return crypto
      .createHash("sha256")
      .update(deviceId + this.config.devicePepper)
      .digest("hex");
  }

  async registerPassive(studentUserId: string, deviceId: string): Promise<void> {
    const student = await this.prisma.student.findUnique({ where: { userId: studentUserId } });
    if (!student) return;
    const active = await this.prisma.device.findFirst({
      where: { studentId: student.id, status: "ACTIVE" },
    });
    if (active) return;

    try {
      await this.prisma.device.create({
        data: {
          studentId: student.id,
          deviceHash: this.hashDeviceId(deviceId),
          status: "ACTIVE",
          bindMethod: "FIRST_LOGIN",
          boundAt: this.clock.now(),
          activeStudentKey: activeStudentKey({ studentId: student.id, status: "ACTIVE" }),
        },
      });
    } catch (e) {
      // Dua login serentak untuk siswa yang sama: UNIQUE active_student_key menjaga satu perangkat aktif.
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
}
