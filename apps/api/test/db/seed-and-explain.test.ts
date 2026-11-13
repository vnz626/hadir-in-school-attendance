import { beforeAll, describe, expect, it } from "vitest";
import { ATTENDANCE_MODE, PERCENTAGE_RULE, type AttendanceStatus } from "@hadirin/shared";
import {
  SystemClock,
  buildStudentRecap,
  dbDateToCalendarDate,
  listSchoolDays,
  requiredDays,
  schoolDateOf,
  type EnrollmentRange,
} from "@hadirin/domain";
import { STANDARD_PROFILE, runSeed } from "../../prisma/seed/run";
import { prisma } from "../helpers/db";

// Seed realistis (Rancangan §17) dipakai untuk menguji rekap dan EXPLAIN (rencana 1.8).
const LIMIT_MS = 100;

let schoolId = "";
let timezone = "";

beforeAll(async () => {
  const result = await runSeed(prisma, {
    ...STANDARD_PROFILE,
    timezone: process.env.SCHOOL_TIMEZONE ?? "Asia/Jakarta",
    passwords: { admin: "uji-admin-1", teacher: "uji-guru-1", student: "uji-siswa-1" },
    clock: new SystemClock(),
  });
  expect(result.skipped).toBe(false);
  const school = await prisma.school.findFirstOrThrow({ where: { npsn: "SEED-HADIRIN" } });
  schoolId = school.id;
  timezone = school.timezone;
});

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: performance.now() - start };
}

interface ExplainRow {
  table: string | null;
  type: string | null;
  key: string | null;
  rows: bigint | number | null;
}

describe("seed realistis", () => {
  it("memenuhi jumlah di Rancangan §17: 6 kelas, 200 siswa, 12 guru, 3 siswa pindah, 2 pasang kakak-adik", async () => {
    const year = await prisma.academicYear.findFirstOrThrow({ where: { schoolId } });
    expect(await prisma.class.count({ where: { academicYearId: year.id } })).toBe(6);
    expect(await prisma.student.count({ where: { user: { schoolId } } })).toBe(200);
    expect(await prisma.teacher.count({ where: { user: { schoolId } } })).toBe(12);
    expect(await prisma.term.count({ where: { academicYearId: year.id } })).toBe(2);
    expect(
      await prisma.classEnrollment.count({
        where: { academicYearId: year.id, endReason: "MOVED_CLASS" },
      }),
    ).toBe(3);
    const sharedParents = await prisma.studentParent.groupBy({
      by: ["parentId"],
      _count: { _all: true },
      having: { parentId: { _count: { gt: 1 } } },
    });
    expect(sharedParents).toHaveLength(2);
    expect(await prisma.staffPositionAssignment.count({ where: { academicYearId: year.id } })).toBe(
      3,
    );
  });

  it("seed idempoten: menjalankan ulang tidak mengubah apa pun", async () => {
    const before = await prisma.attendance.count();
    const again = await runSeed(prisma, {
      ...STANDARD_PROFILE,
      timezone,
      passwords: { admin: "x", teacher: "x", student: "x" },
      clock: new SystemClock(),
    });
    expect(again.skipped).toBe(true);
    expect(await prisma.attendance.count()).toBe(before);
  });

  it("tidak ada kata sandi bersama: hanya akun demo yang punya hash, semuanya berbeda dari teks asli", async () => {
    const withPassword = await prisma.user.findMany({
      where: { schoolId, passwordHash: { not: null } },
      select: { passwordHash: true, role: true },
    });
    expect(withPassword).toHaveLength(3);
    expect(new Set(withPassword.map((u) => u.passwordHash)).size).toBe(3);
    for (const u of withPassword) expect(u.passwordHash).toMatch(/^\$argon2id\$/);
    const parents = await prisma.user.count({
      where: { schoolId, role: "PARENT", passwordHash: { not: null } },
    });
    expect(parents).toBe(0);
  });

  it("riwayat memuat pola realistis: status beragam, ada hari tanpa sesi, ada jejak audit sistem", async () => {
    const groups = await prisma.dailyStatus.groupBy({ by: ["status"], _count: { _all: true } });
    const byStatus = Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
    for (const s of ["PRESENT", "LATE", "EXCUSED", "SICK", "ABSENT"])
      expect(byStatus[s] ?? 0).toBeGreaterThan(0);
    expect(byStatus.PRESENT!).toBeGreaterThan(byStatus.ABSENT! * 5);
    expect(
      await prisma.attendanceAudit.count({
        where: { actorType: "SYSTEM", source: "LEAVE_APPROVAL" },
      }),
    ).toBeGreaterThan(0);
    expect(await prisma.attendanceSession.count({ where: { schoolId, status: "OPEN" } })).toBe(0);
  });
});

describe("rekap dari seed memakai fungsi domain", () => {
  it("rekap satu siswa selaras dengan daily_statuses dan hari 'Tidak tercatat' tidak dihitung alpa", async () => {
    const today = schoolDateOf(new Date(), timezone);
    const enrollment = await prisma.classEnrollment.findFirstOrThrow({
      where: { endDate: null, student: { user: { schoolId } } },
      include: { class: true },
    });
    const settings = await prisma.schoolSetting.findUniqueOrThrow({ where: { schoolId } });
    expect(settings.attendanceMode).toBe(ATTENDANCE_MODE.BOTH);
    const holidays = await prisma.holiday.findMany({ where: { schoolId } });
    const windowFrom = "2000-01-01";
    const days = listSchoolDays(
      dbDateToCalendarDate(enrollment.startDate) > windowFrom
        ? dbDateToCalendarDate(enrollment.startDate)
        : windowFrom,
      today,
      {
        schoolWeekdays: settings.schoolDays as number[],
        holidays: holidays.map((h) => ({
          dateFrom: dbDateToCalendarDate(h.dateFrom),
          dateTo: dbDateToCalendarDate(h.dateTo),
          scope: h.scope,
          grade: h.grade,
          classId: h.classId,
        })),
        cls: { id: enrollment.classId, grade: enrollment.class.grade },
      },
    );
    const ranges: EnrollmentRange[] = [
      { startDate: dbDateToCalendarDate(enrollment.startDate), endDate: null },
    ];
    const required = requiredDays(days, ranges);
    const rows = await prisma.dailyStatus.findMany({ where: { studentId: enrollment.studentId } });
    const map = new Map<string, AttendanceStatus>(
      rows.map((r) => [dbDateToCalendarDate(r.date), r.status]),
    );
    const recap = buildStudentRecap(required, map, PERCENTAGE_RULE.EXCLUDE_EXCUSED);
    const counted = Object.values(recap.counts).reduce((a, b) => a + b, 0);
    expect(counted + recap.untrackedDays.length).toBe(required.length);
    expect(recap.percentage === null || (recap.percentage >= 0 && recap.percentage <= 1)).toBe(
      true,
    );
  });
});

describe("EXPLAIN dan waktu kueri rekap (target < 100 ms pada seed)", () => {
  async function explain(sql: string, ...params: unknown[]): Promise<ExplainRow[]> {
    return prisma.$queryRawUnsafe<ExplainRow[]>(`EXPLAIN ${sql}`, ...params);
  }

  async function rekapKelas(from: string, to: string) {
    const cls = await prisma.class.findFirstOrThrow({
      where: { name: "7A", academicYear: { schoolId } },
    });
    const sql =
      "SELECT student_id, status, COUNT(*) AS n FROM daily_statuses WHERE class_id = ? AND `date` BETWEEN ? AND ? GROUP BY student_id, status";
    const params = [cls.id, from, to];
    const plan = await explain(sql, ...params);
    // Jalankan dua kali: yang pertama menghangatkan koneksi, yang kedua diukur.
    await prisma.$queryRawUnsafe(sql, ...params);
    const { result, ms } = await timed(() => prisma.$queryRawUnsafe<unknown[]>(sql, ...params));
    return { plan, ms, rows: result.length };
  }

  it("rekap harian satu kelas, 30 hari, memakai indeks (class_id, date)", async () => {
    const today = schoolDateOf(new Date(), timezone);
    const from = new Date(`${today}T00:00:00.000Z`);
    from.setUTCDate(from.getUTCDate() - 30);
    const { plan, ms, rows } = await rekapKelas(from.toISOString().slice(0, 10), today);
    expect(rows).toBeGreaterThan(0);
    expect(plan[0]!.key).toMatch(/daily_statuses_class_id_date_idx/);
    expect(plan[0]!.type).not.toBe("ALL");
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it("rekap harian satu kelas, satu semester, memakai indeks dan di bawah batas waktu", async () => {
    const term = await prisma.term.findFirstOrThrow({
      where: { semester: 1, academicYear: { schoolId } },
    });
    const { plan, ms } = await rekapKelas(
      dbDateToCalendarDate(term.startDate),
      dbDateToCalendarDate(term.endDate),
    );
    expect(plan[0]!.key).toMatch(/daily_statuses_class_id_date_idx/);
    expect(plan[0]!.type).not.toBe("ALL");
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it("rekap per mapel dari attendances satu kelas, satu semester, memakai indeks (class_id, session_date)", async () => {
    const cls = await prisma.class.findFirstOrThrow({
      where: { name: "8A", academicYear: { schoolId } },
    });
    const term = await prisma.term.findFirstOrThrow({
      where: { semester: 1, academicYear: { schoolId } },
    });
    const sql =
      "SELECT student_id, status, COUNT(*) AS n FROM attendances WHERE class_id = ? AND session_type = 'SUBJECT' AND session_date BETWEEN ? AND ? GROUP BY student_id, status";
    const params = [
      cls.id,
      dbDateToCalendarDate(term.startDate),
      dbDateToCalendarDate(term.endDate),
    ];
    const plan = await explain(sql, ...params);
    await prisma.$queryRawUnsafe(sql, ...params);
    const { ms } = await timed(() => prisma.$queryRawUnsafe(sql, ...params));
    expect(plan[0]!.key).toMatch(/attendances_class_id_session_date_idx/);
    expect(plan[0]!.type).not.toBe("ALL");
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it("riwayat satu siswa memakai indeks (student_id, session_date)", async () => {
    const stu = await prisma.student.findFirstOrThrow({ where: { user: { schoolId } } });
    const sql =
      "SELECT status, COUNT(*) FROM attendances WHERE student_id = ? AND session_date BETWEEN ? AND ? GROUP BY status";
    const plan = await explain(sql, stu.id, "2026-07-13", "2026-12-19");
    expect(plan[0]!.key).toMatch(/attendances_student_id_session_date_idx/);
  });

  it("pemindai penutupan cadangan memakai indeks (status, closes_at)", async () => {
    const plan = await explain(
      "SELECT id FROM attendance_sessions WHERE status = 'OPEN' AND closes_at < ?",
      "2030-01-01 00:00:00.000",
    );
    expect(plan[0]!.key).toMatch(/attendance_sessions_status_closes_at_idx/);
  });

  it("antrean worker memakai indeks (status, run_at)", async () => {
    const plan = await explain(
      "SELECT id FROM jobs WHERE status = 'PENDING' AND run_at <= ? ORDER BY run_at LIMIT 10",
      "2030-01-01 00:00:00.000",
    );
    expect(plan[0]!.key).toMatch(/jobs_status_run_at_idx|jobs_queue_status_run_at_idx/);
  });
});
