import { Inject, Injectable, Logger } from "@nestjs/common";
import ExcelJS from "exceljs";
import { calendarDateToDb, schoolDateOf, type Clock } from "@hadirin/domain";
import { USER_ROLE } from "@hadirin/shared";
import type { AuthContext } from "../../common/auth.decorators";
import { conflict, notFound, validationError } from "../../common/errors";
import type { Prisma } from "../../generated/prisma/client";
import { openEnrollmentKey } from "../../infra/db/keys";
import type { FileStorage } from "../../infra/file-storage";
import { PrismaService } from "../../infra/prisma.service";
import { CLOCK, FILE_STORAGE } from "../../infra/tokens";
import { AccessPolicy } from "../access-policy/access-policy.service";
import { AuditService } from "../audit/audit.service";
import { ExportsService } from "../exports/exports.controller";
import { parseSpreadsheet } from "./spreadsheet";
import {
  COLUMNS,
  canonicalizeRows,
  validateParentRows,
  validateStudentRows,
  validateTeacherRows,
  type ImportKindKey,
  type ParentRowData,
  type RowIssue,
  type RowResult,
  type StudentRowData,
  type TeacherRowData,
} from "./validators";

type RowData = StudentRowData | TeacherRowData | ParentRowData;

interface ReportRow {
  row: number;
  status: "VALID" | "ERROR";
  errors: RowIssue[];
  data: RowData | null;
  result?: "CREATED" | "FAILED" | "SKIPPED";
  message?: string;
}

interface ImportReport {
  rows: ReportRow[];
  /** Ekspor kartu masuk yang dijalankan setelah impor siswa. */
  exportIds?: string[];
}

export interface ImportPreviewDto {
  id: string;
  kind: ImportKindKey;
  totalRows: number;
  validRows: number;
  errorRows: number;
  /** Semua baris bermasalah beserta penjelasannya (maksimal 500). */
  errors: Array<{ row: number; field: string; message: string }>;
  sample: RowData[];
}

export interface ImportResultDto {
  id: string;
  created: number;
  /** Baris yang dilewati karena sudah bermasalah sejak pratinjau. */
  skipped: number;
  /** Baris valid yang gagal saat disimpan. */
  failed: Array<{ row: number; message: string }>;
  exportIds: string[];
  /** Sama dengan exportIds tetapi dengan nama kelasnya, untuk ditampilkan. */
  exports: Array<{ exportId: string; className: string }>;
}

const MAX_ERRORS_SHOWN = 500;

const TEMPLATES: Record<
  ImportKindKey,
  { headers: string[]; samples: string[][]; notes: string[] }
> = {
  STUDENTS: {
    headers: ["nis", "nama", "nisn", "kelas", "tanggal_masuk"],
    samples: [
      ["2026001", "Contoh Siswa Satu", "0012345678", "7A", "2026-07-13"],
      ["2026002", "Contoh Siswa Dua", "", "7A", ""],
    ],
    notes: [
      "nis dan nama wajib. nisn, kelas, tanggal_masuk boleh dikosongkan.",
      "kelas harus sama dengan nama kelas di tahun ajaran aktif (contoh 7A).",
      "tanggal_masuk berformat YYYY-MM-DD atau DD/MM/YYYY; kosong = hari ini.",
      "Akun siswa dibuat dengan kata sandi awal acak yang tercetak di PDF kartu masuk per kelas.",
      "Format kolom nis sebagai Teks di Excel agar angka nol di depan tidak hilang.",
    ],
  },
  TEACHERS: {
    headers: ["nama", "email", "nip"],
    samples: [["Contoh Guru Satu, S.Pd.", "guru.satu@sekolah.sch.id", "198001012005011001"]],
    notes: [
      "nama dan email wajib. nip boleh dikosongkan.",
      "Guru mengatur kata sandi sendiri lewat 'Lupa kata sandi?' di halaman masuk.",
    ],
  },
  PARENTS: {
    headers: ["nama", "no_wa", "nis_anak", "hubungan"],
    samples: [["Contoh Orang Tua", "081234567890", "2026001, 2026002", "Ibu"]],
    notes: [
      "nama dan no_wa wajib. no_wa boleh 0812..., 62812..., atau +62812....",
      "nis_anak boleh lebih dari satu, dipisah koma; NIS harus sudah ada di sistem.",
      "Orang tua masuk lewat tautan/OTP tanpa kata sandi. Persetujuan WhatsApp diatur terpisah.",
    ],
  },
};

@Injectable()
export class ImportsService {
  private readonly logger = new Logger("Imports");

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
    private readonly audit: AuditService,
    private readonly exportsSvc: ExportsService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  // ---------- templat ----------

  async template(
    actor: AuthContext,
    kind: ImportKindKey,
    format: "xlsx" | "csv",
  ): Promise<{ data: Buffer; contentType: string; filename: string }> {
    this.policy.assertAdmin(actor);
    const spec = TEMPLATES[kind];
    const name = `templat-${kind.toLowerCase()}`;
    if (format === "csv") {
      const lines = [
        spec.headers.join(","),
        ...spec.samples.map((s) =>
          s.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","),
        ),
      ];
      return {
        data: Buffer.from(`${String.fromCharCode(0xfeff)}${lines.join("\r\n")}\r\n`, "utf8"),
        contentType: "text/csv; charset=utf-8",
        filename: `${name}.csv`,
      };
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Data");
    ws.addRow(spec.headers).font = { bold: true };
    // Semua kolom Teks: NIS/NISN/nomor telepon tidak boleh kehilangan angka nol di depan.
    ws.columns = spec.headers.map((h) => ({
      header: h,
      key: h,
      width: Math.max(14, h.length + 4),
      style: { numFmt: "@" },
    }));
    for (const s of spec.samples) ws.addRow(s);
    const help = wb.addWorksheet("Petunjuk");
    spec.notes.forEach((n) => help.addRow([n]));
    help.getColumn(1).width = 110;
    return {
      data: Buffer.from(await wb.xlsx.writeBuffer()),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${name}.xlsx`,
    };
  }

  // ---------- pratinjau ----------

  async preview(actor: AuthContext, kind: ImportKindKey, buf: Buffer): Promise<ImportPreviewDto> {
    this.policy.assertAdmin(actor);
    const sheet = await parseSpreadsheet(buf);
    const { rows, missing } = canonicalizeRows(kind, sheet.headers, sheet.rows);
    if (missing.length > 0) {
      throw validationError(
        `Kolom wajib tidak ditemukan: ${missing.join(", ")}. Pakai templat dari halaman impor.`,
        { missingColumns: missing },
      );
    }

    const results = await this.validate(actor, kind, rows);
    const valid = results.filter((r) => r.errors.length === 0).length;
    const report: ImportReport = {
      rows: results.map((r) => ({
        row: r.row,
        status: r.errors.length ? "ERROR" : "VALID",
        errors: r.errors,
        data: r.data,
      })),
    };

    const fileKey = `imports/${crypto.randomUUID()}.${sheet.format}`;
    await this.storage.put(fileKey, buf);
    const row = await this.prisma.import.create({
      data: {
        schoolId: actor.schoolId,
        kind,
        status: "PREVIEW",
        fileKey,
        totalRows: results.length,
        validRows: valid,
        errorRows: results.length - valid,
        report: report as unknown as Prisma.InputJsonValue,
        createdById: actor.userId,
      },
    });

    return {
      id: row.id,
      kind,
      totalRows: results.length,
      validRows: valid,
      errorRows: results.length - valid,
      errors: results
        .flatMap((r) => r.errors.map((e) => ({ row: r.row, ...e })))
        .slice(0, MAX_ERRORS_SHOWN),
      sample: results
        .filter((r) => r.data)
        .slice(0, 10)
        .map((r) => r.data as RowData),
    };
  }

  private async validate(
    actor: AuthContext,
    kind: ImportKindKey,
    rows: ReturnType<typeof canonicalizeRows>["rows"],
  ): Promise<RowResult<RowData>[]> {
    const schoolId = actor.schoolId;
    if (kind === "STUDENTS") {
      const [existing, year] = await Promise.all([
        this.prisma.student.findMany({ where: { user: { schoolId } }, select: { nis: true } }),
        this.prisma.academicYear.findFirst({ where: { schoolId, isActive: true } }),
      ]);
      const classes = year
        ? await this.prisma.class.findMany({
            where: { academicYearId: year.id, deletedAt: null },
            select: { id: true, name: true },
          })
        : [];
      return validateStudentRows(rows, {
        existingNis: new Set(existing.map((s) => s.nis)),
        classesByName: new Map(classes.map((c) => [c.name.toLowerCase(), c])),
        hasActiveYear: year !== null,
      });
    }
    if (kind === "TEACHERS") {
      const [users, teachers] = await Promise.all([
        this.prisma.user.findMany({
          where: { schoolId, email: { not: null } },
          select: { email: true },
        }),
        this.prisma.teacher.findMany({
          where: { user: { schoolId }, nip: { not: null } },
          select: { nip: true },
        }),
      ]);
      return validateTeacherRows(rows, {
        existingEmails: new Set(users.map((u) => u.email!.toLowerCase())),
        existingNips: new Set(teachers.map((t) => t.nip!)),
      });
    }
    const [phones, students] = await Promise.all([
      this.prisma.parent.findMany({ where: { user: { schoolId } }, select: { phoneWa: true } }),
      this.prisma.student.findMany({
        where: { user: { schoolId }, deletedAt: null },
        select: { nis: true },
      }),
    ]);
    return validateParentRows(rows, {
      existingPhones: new Set(phones.map((p) => p.phoneWa)),
      knownNis: new Set(students.map((s) => s.nis)),
    });
  }

  // ---------- commit ----------

  private async ownImport(actor: AuthContext, id: string) {
    const imp = await this.prisma.import.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!imp) throw notFound("Impor tidak ditemukan.");
    return imp;
  }

  async commit(actor: AuthContext, id: string, validRowsOnly: boolean): Promise<ImportResultDto> {
    this.policy.assertAdmin(actor);
    const imp = await this.ownImport(actor, id);
    if (imp.status !== "PREVIEW")
      throw conflict("Impor ini sudah dijalankan. Unggah berkas lagi bila perlu mengimpor ulang.");
    if (imp.errorRows > 0 && !validRowsOnly) {
      throw conflict(
        `Ada ${imp.errorRows} baris bermasalah. Perbaiki berkasnya, atau pilih "Impor baris yang valid saja".`,
        { errorRows: imp.errorRows },
      );
    }

    // Klaim atomik: dua permintaan commit serentak tidak membuat data ganda.
    const claimed = await this.prisma.import.updateMany({
      where: { id, status: "PREVIEW", committedAt: null },
      data: { committedAt: this.clock.now() },
    });
    if (claimed.count === 0) throw conflict("Impor ini sedang atau sudah dijalankan.");

    const report = imp.report as unknown as ImportReport;
    const kind = imp.kind as ImportKindKey;
    const failed: Array<{ row: number; message: string }> = [];
    const touchedClasses = new Set<string>();
    let created = 0;
    let skipped = 0;

    const today = await this.schoolToday(actor.schoolId);
    const classYear = await this.classYears(actor.schoolId);

    for (const r of report.rows) {
      if (r.status === "ERROR" || !r.data) {
        r.result = "SKIPPED";
        skipped++;
        continue;
      }
      try {
        if (kind === "STUDENTS") {
          const classId = await this.createStudent(
            actor.schoolId,
            r.data as StudentRowData,
            today,
            classYear,
          );
          if (classId) touchedClasses.add(classId);
        } else if (kind === "TEACHERS")
          await this.createTeacher(actor.schoolId, r.data as TeacherRowData);
        else await this.createParent(actor.schoolId, r.data as ParentRowData);
        r.result = "CREATED";
        created++;
      } catch (e) {
        const message =
          (e as { code?: string }).code === "P2002"
            ? "Data ini sudah ada (kemungkinan baru ditambahkan orang lain)."
            : "Baris ini gagal disimpan.";
        if ((e as { code?: string }).code !== "P2002")
          this.logger.error(
            `Impor ${id} baris ${r.row}: ${e instanceof Error ? e.message : String(e)}`,
          );
        r.result = "FAILED";
        r.message = message;
        failed.push({ row: r.row, message });
      }
    }

    // Kartu masuk per kelas yang tersentuh (worker menjalankannya; kata sandi tidak lewat API).
    const exportIds: string[] = [];
    const exportsInfo: ImportResultDto["exports"] = [];
    if (kind === "STUDENTS") {
      const names = new Map(
        (
          await this.prisma.class.findMany({
            where: { id: { in: [...touchedClasses] } },
            select: { id: true, name: true },
          })
        ).map((c) => [c.id, c.name]),
      );
      for (const classId of touchedClasses) {
        const exportId = await this.exportsSvc.enqueueCredentialCards(
          actor.schoolId,
          actor.userId,
          classId,
        );
        exportIds.push(exportId);
        exportsInfo.push({ exportId, className: names.get(classId) ?? "" });
      }
    }
    report.exportIds = exportIds;

    await this.prisma.import.update({
      where: { id },
      data: { status: "COMMITTED", report: report as unknown as Prisma.InputJsonValue },
    });
    await this.audit.log({
      schoolId: actor.schoolId,
      actorId: actor.userId,
      action: "IMPORT_COMMITTED",
      entity: "imports",
      entityId: id,
      meta: { kind, created, skipped, failed: failed.length },
    });
    return { id, created, skipped, failed, exportIds, exports: exportsInfo };
  }

  private async schoolToday(schoolId: string): Promise<string> {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    return schoolDateOf(this.clock.now(), school.timezone);
  }

  private async classYears(schoolId: string): Promise<Map<string, string>> {
    const classes = await this.prisma.class.findMany({
      where: { academicYear: { schoolId } },
      select: { id: true, academicYearId: true },
    });
    return new Map(classes.map((c) => [c.id, c.academicYearId]));
  }

  private async createStudent(
    schoolId: string,
    d: StudentRowData,
    today: string,
    classYear: Map<string, string>,
  ): Promise<string | null> {
    await this.prisma.$transaction(async (tx) => {
      // Tanpa kata sandi: dibuat acak oleh job kartu masuk dan hanya hash-nya yang disimpan.
      const user = await tx.user.create({
        data: {
          schoolId,
          role: USER_ROLE.STUDENT,
          name: d.name,
          loginId: d.nis,
          mustChangePassword: true,
        },
      });
      const student = await tx.student.create({
        data: { userId: user.id, nis: d.nis, nisn: d.nisn },
      });
      if (d.classId) {
        const academicYearId = classYear.get(d.classId)!;
        await tx.classEnrollment.create({
          data: {
            studentId: student.id,
            classId: d.classId,
            academicYearId,
            startDate: calendarDateToDb(d.startDate ?? today),
            openEnrollmentKey: openEnrollmentKey({
              studentId: student.id,
              academicYearId,
              endDate: null,
            }),
          },
        });
      }
    });
    return d.classId;
  }

  private async createTeacher(schoolId: string, d: TeacherRowData): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          schoolId,
          role: USER_ROLE.TEACHER,
          name: d.name,
          email: d.email,
          mustChangePassword: true,
        },
      });
      await tx.teacher.create({ data: { userId: user.id, nip: d.nip } });
    });
  }

  private async createParent(schoolId: string, d: ParentRowData): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { schoolId, role: USER_ROLE.PARENT, name: d.name },
      });
      const parent = await tx.parent.create({ data: { userId: user.id, phoneWa: d.phoneWa } });
      for (const nis of d.childNis) {
        const student = await tx.student.findFirst({
          where: { nis, user: { schoolId } },
          select: { id: true },
        });
        if (student)
          await tx.studentParent.create({
            data: { studentId: student.id, parentId: parent.id, relation: d.relation },
          });
      }
    });
  }

  // ---------- laporan ----------

  async report(actor: AuthContext, id: string) {
    this.policy.assertAdmin(actor);
    const imp = await this.ownImport(actor, id);
    const report = imp.report as unknown as ImportReport;
    return {
      id: imp.id,
      kind: imp.kind,
      status: imp.status,
      totalRows: imp.totalRows,
      validRows: imp.validRows,
      errorRows: imp.errorRows,
      committedAt: imp.committedAt,
      exportIds: report.exportIds ?? [],
      rows: report.rows.map((r) => ({
        row: r.row,
        status: r.status,
        result: r.result ?? null,
        errors: r.errors,
        message: r.message ?? null,
      })),
    };
  }
}

export { COLUMNS };
