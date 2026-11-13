import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_MODE,
  ATTENDANCE_STATUS as S,
  PERCENTAGE_RULE,
  SESSION_TYPE,
} from "@hadirin/shared";
import {
  FakeClock,
  SystemClock,
  addDays,
  calendarDateToDb,
  dbDateToCalendarDate,
  attendancePercentage,
  buildStudentRecap,
  compareDates,
  deriveDailyStatus,
  eachDate,
  emptyCounts,
  holidayApplies,
  instantFromWallMinutes,
  isValidCalendarDate,
  isoDayOfWeek,
  listSchoolDays,
  percentageRuleSentence,
  requiredDays,
  schoolDateOf,
  schoolDayRangeUtc,
  schoolMinuteOfDay,
  zoneOffsetMinutes,
  type ClosedSessionRow,
} from "./index";

describe("Clock", () => {
  it("FakeClock bisa diatur dan digeser, dan mengembalikan salinan", () => {
    const c = new FakeClock("2026-03-02T00:00:00.000Z");
    c.advanceMs(1500);
    expect(c.now().toISOString()).toBe("2026-03-02T00:00:01.500Z");
    c.set("2026-04-01T10:00:00.000Z");
    const t = c.now();
    t.setUTCFullYear(1999);
    expect(c.now().toISOString()).toBe("2026-04-01T10:00:00.000Z");
  });
  it("SystemClock mengembalikan waktu nyata", () => {
    expect(Math.abs(new SystemClock().now().getTime() - Date.now())).toBeLessThan(1000);
  });
});

describe("dates", () => {
  it("menolak tanggal yang tidak ada", () => {
    expect(isValidCalendarDate("2026-02-30")).toBe(false);
    expect(isValidCalendarDate("2026-2-3")).toBe(false);
    expect(isValidCalendarDate("2028-02-29")).toBe(true);
    expect(() => addDays("bukan-tanggal", 1)).toThrow();
  });
  it("addDays melewati batas bulan dan tahun", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("isoDayOfWeek: Senin = 1, Minggu = 7", () => {
    expect(isoDayOfWeek("2026-03-02")).toBe(1);
    expect(isoDayOfWeek("2026-03-08")).toBe(7);
  });
  it("eachDate inklusif dan kosong bila terbalik", () => {
    expect(eachDate("2026-03-01", "2026-03-03")).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
    expect(eachDate("2026-03-03", "2026-03-01")).toEqual([]);
  });
  it("compareDates", () => {
    expect(compareDates("2026-03-01", "2026-03-02")).toBe(-1);
    expect(compareDates("2026-03-02", "2026-03-01")).toBe(1);
    expect(compareDates("2026-03-01", "2026-03-01")).toBe(0);
  });
});

describe("timezone (zona selain WIB dan batas tengah malam)", () => {
  it("tanggal sekolah di Asia/Jayapura (UTC+9) maju lebih awal dari UTC", () => {
    const instant = new Date("2026-03-01T15:30:00.000Z"); // 00:30 WIT hari berikutnya
    expect(schoolDateOf(instant, "Asia/Jayapura")).toBe("2026-03-02");
    expect(schoolDateOf(instant, "Asia/Jakarta")).toBe("2026-03-01"); // 22:30 WIB
    expect(schoolMinuteOfDay(instant, "Asia/Jayapura")).toBe(30);
  });
  it("tepat tengah malam sekolah masuk ke tanggal baru", () => {
    expect(schoolDateOf(new Date("2026-03-01T16:59:59.999Z"), "Asia/Jayapura")).toBe("2026-03-02");
    expect(schoolDateOf(new Date("2026-03-01T14:59:59.999Z"), "Asia/Jayapura")).toBe("2026-03-01");
    expect(schoolDateOf(new Date("2026-02-28T16:59:59.999Z"), "Asia/Jakarta")).toBe("2026-02-28");
    expect(schoolDateOf(new Date("2026-02-28T17:00:00.000Z"), "Asia/Jakarta")).toBe("2026-03-01");
  });
  it("offset zona", () => {
    const t = new Date("2026-03-01T00:00:00.000Z");
    expect(zoneOffsetMinutes(t, "Asia/Jakarta")).toBe(420);
    expect(zoneOffsetMinutes(t, "Asia/Makassar")).toBe(480);
    expect(zoneOffsetMinutes(t, "Asia/Jayapura")).toBe(540);
    expect(zoneOffsetMinutes(new Date("2026-03-01T00:00:00.400Z"), "Asia/Jayapura")).toBe(540);
  });
  it("jam dinding menjadi titik waktu UTC (07:00 WIB = 00:00 UTC; 07:00 WIT = 22:00 UTC hari sebelumnya)", () => {
    expect(instantFromWallMinutes("2026-03-02", 420, "Asia/Jakarta").toISOString()).toBe(
      "2026-03-02T00:00:00.000Z",
    );
    expect(instantFromWallMinutes("2026-03-02", 420, "Asia/Jayapura").toISOString()).toBe(
      "2026-03-01T22:00:00.000Z",
    );
    expect(instantFromWallMinutes("2026-03-02", 0, "Asia/Jayapura").toISOString()).toBe(
      "2026-03-01T15:00:00.000Z",
    );
  });
  it("jam dinding terakhir 23:59 tetap di tanggal yang sama", () => {
    const i = instantFromWallMinutes("2026-03-02", 1439, "Asia/Jayapura");
    expect(schoolDateOf(i, "Asia/Jayapura")).toBe("2026-03-02");
    expect(schoolMinuteOfDay(i, "Asia/Jayapura")).toBe(1439);
  });
  it("menolak menit di luar 0..1439", () => {
    expect(() => instantFromWallMinutes("2026-03-02", 1440, "Asia/Jakarta")).toThrow();
    expect(() => instantFromWallMinutes("2026-03-02", -1, "Asia/Jakarta")).toThrow();
    expect(() => instantFromWallMinutes("2026-03-02", 1.5, "Asia/Jakarta")).toThrow();
  });
  it("rentang satu hari sekolah", () => {
    const r = schoolDayRangeUtc("2026-03-02", "Asia/Jayapura");
    expect(r.start.toISOString()).toBe("2026-03-01T15:00:00.000Z");
    expect(r.endExclusive.toISOString()).toBe("2026-03-02T15:00:00.000Z");
  });
  it("zona dengan DST tetap benar (uji ketahanan helper)", () => {
    // 2026-03-08 02:30 tidak ada di New York; hasilnya harus tetap titik waktu yang valid.
    const i = instantFromWallMinutes("2026-03-15", 9 * 60, "America/New_York");
    expect(i.toISOString()).toBe("2026-03-15T13:00:00.000Z"); // EDT = UTC-4
    const w = instantFromWallMinutes("2026-01-15", 9 * 60, "America/New_York");
    expect(w.toISOString()).toBe("2026-01-15T14:00:00.000Z"); // EST = UTC-5
  });
});

describe("kalender", () => {
  const cls = { id: "kelas-7a", grade: 7 };
  const weekdays = [1, 2, 3, 4, 5];

  it("melewati akhir pekan", () => {
    const days = listSchoolDays("2026-03-02", "2026-03-08", {
      schoolWeekdays: weekdays,
      holidays: [],
      cls,
    });
    expect(days).toEqual(["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"]);
  });
  it("libur ALL, GRADE, dan CLASS berlaku sesuai scope", () => {
    const holidays = [
      { dateFrom: "2026-03-03", dateTo: "2026-03-03", scope: "ALL" as const },
      { dateFrom: "2026-03-04", dateTo: "2026-03-04", scope: "GRADE" as const, grade: 7 },
      {
        dateFrom: "2026-03-05",
        dateTo: "2026-03-05",
        scope: "CLASS" as const,
        classId: "kelas-7a",
      },
      { dateFrom: "2026-03-06", dateTo: "2026-03-06", scope: "GRADE" as const, grade: 8 },
      {
        dateFrom: "2026-03-02",
        dateTo: "2026-03-02",
        scope: "CLASS" as const,
        classId: "kelas-7b",
      },
    ];
    const days = listSchoolDays("2026-03-02", "2026-03-06", {
      schoolWeekdays: weekdays,
      holidays,
      cls,
    });
    expect(days).toEqual(["2026-03-02", "2026-03-06"]);
  });
  it("libur rentang berlaku di tanggal tengah, bukan di luar rentang", () => {
    const h = { dateFrom: "2026-03-10", dateTo: "2026-03-12", scope: "ALL" as const };
    expect(holidayApplies(h, "2026-03-11", cls)).toBe(true);
    expect(holidayApplies(h, "2026-03-09", cls)).toBe(false);
    expect(holidayApplies(h, "2026-03-13", cls)).toBe(false);
  });
  it("hari wajib mengikuti rentang pendaftaran, termasuk siswa pindah kelas", () => {
    const school = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"];
    expect(requiredDays(school, [{ startDate: "2026-03-04", endDate: null }])).toEqual([
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
    ]);
    expect(requiredDays(school, [{ startDate: "2026-03-01", endDate: "2026-03-03" }])).toEqual([
      "2026-03-02",
      "2026-03-03",
    ]);
    expect(requiredDays(school, [{ startDate: "2026-03-10", endDate: null }])).toEqual([]);
  });
});

describe("persentase kehadiran (Rancangan §12.8)", () => {
  const counts = { present: 80, late: 5, dispensed: 5, excused: 4, sick: 4, absent: 2 };

  it("EXCLUDE_EXCUSED: izin dan sakit keluar dari pembilang dan penyebut", () => {
    expect(attendancePercentage(counts, PERCENTAGE_RULE.EXCLUDE_EXCUSED)).toBeCloseTo(90 / 92, 10);
  });
  it("INCLUDE_EXCUSED: izin dan sakit masuk penyebut", () => {
    expect(attendancePercentage(counts, PERCENTAGE_RULE.INCLUDE_EXCUSED)).toBeCloseTo(90 / 100, 10);
  });
  it("penyebut 0 menghasilkan null, bukan 0 atau 1", () => {
    expect(attendancePercentage(emptyCounts(), PERCENTAGE_RULE.EXCLUDE_EXCUSED)).toBeNull();
    expect(attendancePercentage(emptyCounts(), PERCENTAGE_RULE.INCLUDE_EXCUSED)).toBeNull();
    // Siswa hanya sakit: EXCLUDE tidak punya penyebut, INCLUDE punya.
    const onlySick = { ...emptyCounts(), sick: 3 };
    expect(attendancePercentage(onlySick, PERCENTAGE_RULE.EXCLUDE_EXCUSED)).toBeNull();
    expect(attendancePercentage(onlySick, PERCENTAGE_RULE.INCLUDE_EXCUSED)).toBe(0);
  });
  it("hari tanpa status = Tidak tercatat, bukan alpa dan tidak masuk persentase", () => {
    const statuses = new Map([
      ["2026-03-02", S.PRESENT],
      ["2026-03-03", S.ABSENT],
      ["2026-03-04", S.SICK],
      ["2026-03-05", S.LATE],
    ]);
    const days = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"];
    const recap = buildStudentRecap(days, statuses, PERCENTAGE_RULE.EXCLUDE_EXCUSED);
    expect(recap.untrackedDays).toEqual(["2026-03-06"]);
    expect(recap.counts).toEqual({
      present: 1,
      late: 1,
      dispensed: 0,
      excused: 0,
      sick: 1,
      absent: 1,
    });
    expect(recap.percentage).toBeCloseTo(2 / 3, 10);
  });
  it("kalimat aturan sesuai aturan yang berlaku", () => {
    expect(percentageRuleSentence(PERCENTAGE_RULE.EXCLUDE_EXCUSED)).toContain(
      "Izin dan sakit tidak dihitung",
    );
    expect(percentageRuleSentence(PERCENTAGE_RULE.INCLUDE_EXCUSED)).toContain(
      "Izin + Sakit + Alpa",
    );
  });
});

describe("status harian (Rancangan §12.9)", () => {
  const t = (h: number) => new Date(Date.UTC(2026, 2, 2, h));
  const daily = (status: ClosedSessionRow["status"]): ClosedSessionRow => ({
    sessionType: SESSION_TYPE.DAILY,
    sessionStartsAt: t(0),
    status,
  });
  const subj = (h: number, status: ClosedSessionRow["status"]): ClosedSessionRow => ({
    sessionType: SESSION_TYPE.SUBJECT,
    sessionStartsAt: t(h),
    status,
  });

  it("DAILY_ONLY memakai sesi harian dan mengabaikan sesi mapel", () => {
    expect(
      deriveDailyStatus(ATTENDANCE_MODE.DAILY_ONLY, [daily(S.LATE), subj(1, S.ABSENT)]),
    ).toEqual({
      status: S.LATE,
      source: "DAILY_SESSION",
      partialAbsence: false,
    });
  });
  it("tanpa sesi yang relevan = null (Tidak tercatat)", () => {
    expect(deriveDailyStatus(ATTENDANCE_MODE.DAILY_ONLY, [subj(1, S.PRESENT)])).toBeNull();
    expect(deriveDailyStatus(ATTENDANCE_MODE.BOTH, [])).toBeNull();
    expect(deriveDailyStatus(ATTENDANCE_MODE.SUBJECT_ONLY, [daily(S.PRESENT)])).toBeNull();
  });
  it("BOTH: hadir harian tetapi alpa di mapel = bolos sebagian", () => {
    expect(
      deriveDailyStatus(ATTENDANCE_MODE.BOTH, [daily(S.PRESENT), subj(1, S.ABSENT)])
        ?.partialAbsence,
    ).toBe(true);
    expect(
      deriveDailyStatus(ATTENDANCE_MODE.BOTH, [daily(S.ABSENT), subj(1, S.ABSENT)])?.partialAbsence,
    ).toBe(false);
    expect(
      deriveDailyStatus(ATTENDANCE_MODE.BOTH, [daily(S.LATE), subj(1, S.PRESENT)])?.partialAbsence,
    ).toBe(false);
  });
  it("SUBJECT_ONLY: semua alpa = alpa", () => {
    expect(
      deriveDailyStatus(ATTENDANCE_MODE.SUBJECT_ONLY, [subj(1, S.ABSENT), subj(2, S.ABSENT)]),
    ).toEqual({
      status: S.ABSENT,
      source: "DERIVED",
      partialAbsence: false,
    });
  });
  it("SUBJECT_ONLY: semua berizin = status terbanyak, seri S lalu I lalu D", () => {
    const r1 = deriveDailyStatus(ATTENDANCE_MODE.SUBJECT_ONLY, [
      subj(1, S.EXCUSED),
      subj(2, S.EXCUSED),
      subj(3, S.SICK),
    ]);
    expect(r1?.status).toBe(S.EXCUSED);
    expect(
      deriveDailyStatus(ATTENDANCE_MODE.SUBJECT_ONLY, [subj(1, S.EXCUSED), subj(2, S.SICK)])
        ?.status,
    ).toBe(S.SICK);
    expect(
      deriveDailyStatus(ATTENDANCE_MODE.SUBJECT_ONLY, [subj(1, S.DISPENSED), subj(2, S.EXCUSED)])
        ?.status,
    ).toBe(S.EXCUSED);
    expect(deriveDailyStatus(ATTENDANCE_MODE.SUBJECT_ONLY, [subj(1, S.DISPENSED)])?.status).toBe(
      S.DISPENSED,
    );
  });
  it("SUBJECT_ONLY: ada yang hadir = status sesi pertama yang dihadiri, urut menurut waktu mulai", () => {
    const r = deriveDailyStatus(ATTENDANCE_MODE.SUBJECT_ONLY, [
      subj(3, S.PRESENT),
      subj(1, S.ABSENT),
      subj(2, S.LATE),
    ]);
    expect(r).toEqual({ status: S.LATE, source: "DERIVED", partialAbsence: false });
  });
  it("SUBJECT_ONLY: alpa setelah sesi pertama yang dihadiri = bolos sebagian", () => {
    const r = deriveDailyStatus(ATTENDANCE_MODE.SUBJECT_ONLY, [
      subj(1, S.PRESENT),
      subj(2, S.ABSENT),
    ]);
    expect(r).toEqual({ status: S.PRESENT, source: "DERIVED", partialAbsence: true });
  });
  it("SUBJECT_ONLY: campuran alpa dan izin tanpa kehadiran memakai default yang dicatat", () => {
    const r = deriveDailyStatus(ATTENDANCE_MODE.SUBJECT_ONLY, [subj(1, S.SICK), subj(2, S.ABSENT)]);
    expect(r).toEqual({ status: S.SICK, source: "DERIVED", partialAbsence: true });
  });
});

describe("kolom DATE", () => {
  it("bolak-balik tanpa bergeser hari, apa pun zona proses", () => {
    const d = calendarDateToDb("2026-03-02");
    expect(d.toISOString()).toBe("2026-03-02T00:00:00.000Z");
    expect(dbDateToCalendarDate(d)).toBe("2026-03-02");
    expect(dbDateToCalendarDate(new Date("2026-12-31T00:00:00.000Z"))).toBe("2026-12-31");
  });
});
