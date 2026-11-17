import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma.service";

export interface AuditEntry {
  schoolId: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  /** Jangan isi kata sandi, token, atau nomor telepon utuh (Rancangan §14.3). */
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/** Jejak aksi sensitif non-kehadiran (Rancangan §10.2 `audit_logs`). Hanya tambah. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        schoolId: entry.schoolId,
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        meta: (entry.meta ?? {}) as object,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }
}
