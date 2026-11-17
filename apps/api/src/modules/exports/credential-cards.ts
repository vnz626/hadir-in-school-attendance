import { Inject, Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { z } from "zod";
import { APP_CONFIG, type AppConfig } from "../../config/env";
import { FILE_STORAGE } from "../../infra/tokens";
import type { FileStorage } from "../../infra/file-storage";
import { PrismaService } from "../../infra/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PasswordService } from "../auth/password.service";
import type { JobHandler } from "../jobs/job-runner";

export const EXPORT_QUEUE = "EXPORT";

/** Penggambar PDF disuntik supaya tes bisa menangkap kartu yang dicetak (kata sandi harus cocok dengan hash). */
export const CARD_RENDERER = Symbol("CARD_RENDERER");
export type CardRenderer = (data: CardData) => Promise<Buffer>;

export const credentialCardsPayloadSchema = z.object({
  type: z.literal("credential-cards"),
  classId: z.string().uuid(),
  requestedById: z.string().uuid(),
  schoolId: z.string().uuid(),
  fileKey: z.string(),
});
export type CredentialCardsPayload = z.infer<typeof credentialCardsPayloadSchema>;

export interface CardData {
  schoolName: string;
  className: string;
  students: Array<{ name: string; nis: string; password: string }>;
  appUrl: string;
}

const CARDS_PER_PAGE = 8;

/** PDF kartu masuk: 2 kolom × 4 baris per halaman A4, siap dipotong dan dibagikan wali kelas. */
export async function renderCredentialCardsPdf(data: CardData): Promise<Buffer> {
  const qr = await QRCode.toBuffer(data.appUrl, { margin: 1, width: 120 });
  const doc = new PDFDocument({
    size: "A4",
    margin: 28,
    info: { Title: `Kartu masuk ${data.className}` },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageW = doc.page.width - 56;
  const pageH = doc.page.height - 56;
  const cardW = pageW / 2;
  const cardH = pageH / 4;

  if (data.students.length === 0) {
    doc.fontSize(14).text(`Tidak ada akun yang perlu kartu masuk di ${data.className}.`, 28, 28);
  }

  data.students.forEach((s, i) => {
    if (i > 0 && i % CARDS_PER_PAGE === 0) doc.addPage();
    const slot = i % CARDS_PER_PAGE;
    const x = 28 + (slot % 2) * cardW;
    const y = 28 + Math.floor(slot / 2) * cardH;
    doc
      .rect(x + 4, y + 4, cardW - 8, cardH - 8)
      .dash(3, { space: 3 })
      .stroke("#8A93A8")
      .undash();
    doc
      .fillColor("#16203A")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("hadir.in", x + 16, y + 14);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#4A5470")
      .text(data.schoolName, x + 16, y + 28, { width: cardW - 150 });
    doc
      .fillColor("#16203A")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(s.name, x + 16, y + 48, { width: cardW - 150 });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#4A5470")
      .text(`Kelas ${data.className}`, x + 16, y + 64);
    doc
      .fillColor("#16203A")
      .fontSize(9)
      .text("NIS", x + 16, y + 84);
    doc
      .font("Courier-Bold")
      .fontSize(12)
      .text(s.nis, x + 70, y + 82);
    doc
      .font("Helvetica")
      .fontSize(9)
      .text("Kata sandi awal", x + 16, y + 104);
    doc
      .font("Courier-Bold")
      .fontSize(13)
      .text(s.password, x + 16, y + 118);
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#4A5470")
      .text("Wajib diganti saat masuk pertama. Jangan dibagikan.", x + 16, y + cardH - 34, {
        width: cardW - 130,
      });
    doc.image(qr, x + cardW - 96, y + 16, { width: 72 });
    doc
      .font("Helvetica")
      .fontSize(6)
      .fillColor("#4A5470")
      .text("Buka aplikasi", x + cardW - 96, y + 90, { width: 72, align: "center" });
  });

  doc.end();
  return done;
}

/**
 * Job EXPORT `credential-cards`: membuat kata sandi awal acak untuk akun siswa di satu kelas yang
 * belum pernah mengganti kata sandi, menyimpan hash-nya, lalu menulis PDF kartu masuk.
 * Tidak ada kata sandi teks yang disimpan di database. IDEMPOTEN: bila PDF-nya sudah ada, tidak
 * ada yang diulang (kata sandi tidak dibuat dua kali); bila worker mati sebelum PDF ditulis,
 * ulangan membuat kata sandi baru dan PDF baru yang konsisten.
 */
@Injectable()
export class CredentialCardsHandler implements JobHandler {
  readonly queue = EXPORT_QUEUE;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CARD_RENDERER) private readonly render: CardRenderer,
  ) {}

  async handle(raw: unknown): Promise<void> {
    const payload = credentialCardsPayloadSchema.parse(raw);
    if (await this.storage.exists(payload.fileKey)) return;

    const cls = await this.prisma.class.findFirst({
      where: { id: payload.classId, academicYear: { schoolId: payload.schoolId } },
      include: { academicYear: { include: { school: true } } },
    });
    if (!cls) throw new Error("Kelas tidak ditemukan");

    const students = await this.prisma.student.findMany({
      where: {
        deletedAt: null,
        enrollments: { some: { classId: cls.id, endDate: null } },
        user: { mustChangePassword: true, isActive: true, deletedAt: null },
      },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    });

    const cards: CardData["students"] = [];
    for (const s of students) {
      const password = this.passwords.generateTemporary();
      await this.prisma.user.update({
        where: { id: s.userId },
        data: { passwordHash: await this.passwords.hash(password), mustChangePassword: true },
      });
      cards.push({ name: s.user.name, nis: s.nis, password });
    }
    // Sesi lama akun yang kata sandinya baru diganti tidak boleh bertahan.
    if (students.length > 0) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: { in: students.map((s) => s.userId) }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const pdf = await this.render({
      schoolName: cls.academicYear.school.name,
      className: cls.name,
      students: cards,
      appUrl: this.config.appOrigins[0] ?? "http://localhost:3000",
    });
    await this.storage.put(payload.fileKey, pdf);

    // Ekspor data pribadi dicatat (Rancangan §14.3): jumlahnya saja, tanpa kata sandi.
    await this.audit.log({
      schoolId: payload.schoolId,
      actorId: payload.requestedById,
      action: "CREDENTIAL_CARDS_EXPORT",
      entity: "classes",
      entityId: cls.id,
      meta: { count: cards.length },
    });
  }
}
