import { Controller, Get, HttpCode, Inject, Injectable, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import crypto from "node:crypto";
import { USER_ROLE, idParamSchema } from "@hadirin/shared";
import { CurrentUser, Public, Roles, type AuthContext } from "../../common/auth.decorators";
import { ApiDoc } from "../../common/api-doc";
import { notFound } from "../../common/errors";
import { ZodValidationPipe } from "../../common/zod.pipe";
import type { FileStorage } from "../../infra/file-storage";
import type { JobQueue } from "../../infra/job-queue";
import { PrismaService } from "../../infra/prisma.service";
import { FILE_STORAGE, JOB_QUEUE } from "../../infra/tokens";
import { AccessPolicy } from "../access-policy/access-policy.service";
import {
  EXPORT_QUEUE,
  credentialCardsPayloadSchema,
  type CredentialCardsPayload,
} from "./credential-cards";
import { FileUrlService } from "./file-url.service";

export interface ExportStatusDto {
  exportId: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  /** URL bertanda tangan berumur 5 menit; hanya ada saat status DONE. */
  downloadUrl: string | null;
}

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
    private readonly urls: FileUrlService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /**
   * Meminta PDF kartu masuk satu kelas. Mengatur ulang kata sandi akun yang belum diganti, jadi
   * ini aksi POST (bukan GET) dan hanya untuk admin atau wali kelasnya.
   */
  async requestCredentialCards(actor: AuthContext, classId: string): Promise<{ exportId: string }> {
    const cls = await this.prisma.class.findFirst({
      where: { id: classId, deletedAt: null, academicYear: { schoolId: actor.schoolId } },
      select: { id: true },
    });
    if (!cls) throw notFound("Kelas tidak ditemukan.");
    await this.policy.assertCanManageClass(actor, classId);

    const exportId = crypto.randomUUID();
    const payload: CredentialCardsPayload = {
      type: "credential-cards",
      classId,
      requestedById: actor.userId,
      schoolId: actor.schoolId,
      fileKey: `exports/credential-cards/${exportId}.pdf`,
    };
    await this.queue.enqueue({
      queue: EXPORT_QUEUE,
      payload,
      dedupeKey: `export:${exportId}`,
      maxAttempts: 3,
    });
    return { exportId };
  }

  /** Dipakai juga oleh impor siswa untuk menyalakan kartu masuk per kelas. */
  async enqueueCredentialCards(
    schoolId: string,
    requestedById: string,
    classId: string,
  ): Promise<string> {
    const exportId = crypto.randomUUID();
    const payload: CredentialCardsPayload = {
      type: "credential-cards",
      classId,
      requestedById,
      schoolId,
      fileKey: `exports/credential-cards/${exportId}.pdf`,
    };
    await this.queue.enqueue({
      queue: EXPORT_QUEUE,
      payload,
      dedupeKey: `export:${exportId}`,
      maxAttempts: 3,
    });
    return exportId;
  }

  async status(actor: AuthContext, exportId: string): Promise<ExportStatusDto> {
    const job = await this.prisma.job.findUnique({ where: { dedupeKey: `export:${exportId}` } });
    const parsed = job ? credentialCardsPayloadSchema.safeParse(job.payload) : null;
    // Hanya pemohon atau admin sekolah yang sama yang boleh melihat; selain itu seolah tidak ada.
    if (!job || !parsed?.success || parsed.data.schoolId !== actor.schoolId)
      throw notFound("Ekspor tidak ditemukan.");
    if (parsed.data.requestedById !== actor.userId && !this.policy.isAdmin(actor))
      throw notFound("Ekspor tidak ditemukan.");

    const status =
      job.status === "DONE"
        ? "DONE"
        : job.status === "FAILED"
          ? "FAILED"
          : job.status === "RUNNING"
            ? "RUNNING"
            : "PENDING";
    const ready = status === "DONE" && (await this.storage.exists(parsed.data.fileKey));
    return {
      exportId,
      status,
      downloadUrl: ready
        ? `/api/files/${this.urls.sign(parsed.data.fileKey, `kartu-masuk-${exportId.slice(0, 8)}.pdf`)}`
        : null,
    };
  }

  async download(token: string): Promise<{ data: Buffer; name: string } | null> {
    const verified = this.urls.verify(token);
    if (!verified) return null;
    const data = await this.storage.get(verified.key);
    return data ? { data, name: verified.name } : null;
  }
}

@Controller()
export class ExportsController {
  constructor(private readonly svc: ExportsService) {}

  @ApiDoc({
    summary: "Minta PDF kartu masuk satu kelas (mengatur ulang kata sandi akun yang belum diganti)",
  })
  @Roles(USER_ROLE.ADMIN, USER_ROLE.TEACHER)
  @Post("classes/:id/credential-cards")
  @HttpCode(202)
  request(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader("Cache-Control", "no-store");
    return this.svc.requestCredentialCards(a, id);
  }

  @ApiDoc({ summary: "Status ekspor dan URL unduhan bertanda tangan (5 menit)" })
  @Roles(USER_ROLE.ADMIN, USER_ROLE.TEACHER)
  @Get("exports/:exportId")
  status(
    @CurrentUser() a: AuthContext,
    @Param("exportId", new ZodValidationPipe(idParamSchema)) exportId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader("Cache-Control", "no-store");
    return this.svc.status(a, exportId);
  }

  @ApiDoc({ summary: "Unduh berkas lewat URL bertanda tangan", produces: "application/pdf" })
  /** Tanpa cookie: keabsahan ditentukan tanda tangan dan umur token (5 menit). */
  @Public()
  @Get("files/:token")
  async download(@Param("token") token: string, @Res() res: Response): Promise<void> {
    const file = await this.svc.download(token);
    if (!file) {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Berkas tidak ditemukan atau tautannya sudah kedaluwarsa.",
        },
      });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(file.data);
  }
}
