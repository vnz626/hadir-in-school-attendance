import { describe, expect, it } from "vitest";
import { dbDateToCalendarDate, instantFromWallMinutes, schoolDateOf } from "@hadirin/domain";
import { D, makeSession, makeWorld, prisma } from "../helpers/db";

describe("waktu dan zona di database", () => {
  it("sesi koneksi memakai UTC dan sql_mode ketat, apa pun isi my.ini", async () => {
    const [row] = await prisma.$queryRaw<
      Array<{ tz: string; mode: string }>
    >`SELECT @@session.time_zone AS tz, @@session.sql_mode AS mode`;
    expect(row!.tz).toBe("+00:00");
    expect(row!.mode).toContain("STRICT_TRANS_TABLES");
  });

  it("DATETIME(3) menyimpan UTC lengkap dengan milidetik tanpa bergeser", async () => {
    const w = await makeWorld();
    const s = await makeSession(w, { sessionDate: "2026-10-05" });
    const back = await prisma.attendanceSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(back.startsAt.toISOString()).toBe("2026-10-05T00:30:00.000Z");
    const t = new Date("2026-10-05T01:02:03.456Z");
    const a = await prisma.attendanceSession.update({ where: { id: s.id }, data: { closedAt: t } });
    expect(a.closedAt?.toISOString()).toBe("2026-10-05T01:02:03.456Z");
  });

  it("kolom DATE kembali sebagai tanggal yang sama (tidak bergeser hari)", async () => {
    const w = await makeWorld();
    const s = await makeSession(w, { sessionDate: "2026-12-31" });
    const back = await prisma.attendanceSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(dbDateToCalendarDate(back.sessionDate)).toBe("2026-12-31");
  });

  it("sekolah di Asia/Jayapura: check-in 00:30 WIT jatuh pada session_date hari berikutnya menurut UTC", async () => {
    const w = await makeWorld("Asia/Jayapura");
    const school = await prisma.school.findUniqueOrThrow({ where: { id: w.schoolId } });
    // 2026-10-05 15:30 UTC = 2026-10-06 00:30 WIT
    const checkIn = new Date("2026-10-05T15:30:00.000Z");
    expect(schoolDateOf(checkIn, school.timezone)).toBe("2026-10-06");
    expect(schoolDateOf(checkIn, "UTC")).toBe("2026-10-05");

    const startsAt = instantFromWallMinutes("2026-10-06", 420, school.timezone); // 07:00 WIT
    expect(startsAt.toISOString()).toBe("2026-10-05T22:00:00.000Z");
    const s = await prisma.attendanceSession.create({
      data: {
        schoolId: w.schoolId,
        classId: w.classId,
        termId: w.termId,
        type: "DAILY",
        sessionDate: D("2026-10-06"),
        startsAt,
        lateAfterMinutes: 10,
        lateThresholdAt: new Date(startsAt.getTime() + 600_000),
        openedAt: new Date(startsAt.getTime() - 120_000),
        openedById: w.teacherUserId,
        closesAt: instantFromWallMinutes("2026-10-06", 540, school.timezone),
        qrSecretEnc: "uji",
        dailySlotKey: `${w.classId}|2026-10-06`,
      },
    });
    const back = await prisma.attendanceSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(dbDateToCalendarDate(back.sessionDate)).toBe(
      schoolDateOf(back.startsAt, school.timezone),
    );
    // Di UTC tanggal dari startsAt berbeda dengan session_date; session_date mengikuti zona sekolah.
    expect(schoolDateOf(back.startsAt, "UTC")).toBe("2026-10-05");
  });
});
