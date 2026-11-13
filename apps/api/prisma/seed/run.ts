import argon2 from "argon2";
import crypto from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import {
  ATTENDANCE_METHOD,
  ATTENDANCE_MODE,
  ATTENDANCE_STATUS as S,
  HOLIDAY_SCOPE,
  SESSION_STATUS,
  SESSION_TYPE,
  type AttendanceStatus,
  type CalendarDate,
} from "@hadirin/shared";
import {
  addDays,
  calendarDateToDb,
  deriveDailyStatus,
  eachDate,
  holidayApplies,
  instantFromWallMinutes,
  isoDayOfWeek,
  schoolDateOf,
  type Clock,
  type ClosedSessionRow,
  type HolidayInput,
} from "@hadirin/domain";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { dailySlotKey, openEnrollmentKey, scheduleSlotKey } from "../../src/infra/db/keys";
import { FIRST_NAMES, LAST_NAMES, SUBJECTS } from "./names";
import { Prng } from "./prng";

export const SEED_NPSN = "SEED-HADIRIN";

export interface SeedOptions {
  schoolName: string;
  timezone: string;
  students: number;
  gradeLetters: readonly string[];
  teachers: number;
  historyDays: number;
  seed: number;
  passwords: { admin: string; teacher: string; student: string };
  clock: Clock;
}

export const STANDARD_PROFILE = {
  schoolName: "SMP Demo Hadir.in",
  students: 200,
  gradeLetters: ["A", "B"],
  teachers: 12,
  historyDays: 60,
  seed: 20260101,
} as const;

// Seed uji beban (Rencana fase 1.7): 1.000 siswa, 30 kelas, riwayat lebih pendek.
export const LOAD_PROFILE = {
  schoolName: "SMP Uji Beban Hadir.in",
  students: 1000,
  gradeLetters: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
  teachers: 40,
  historyDays: 30,
  seed: 20260202,
} as const;

const GRADES = [7, 8, 9] as const;
const SLOT_STARTS = [450, 495, 560, 605]; // 07:30, 08:15, 09:20, 10:05
const SLOT_MINUTES = 45;
const SCHOOL_WEEKDAYS = [1, 2, 3, 4, 5];
const LATE_AFTER_MINUTES = 10;
const DAILY_START = 420;
const DAILY_CLOSE = 540;
const CHUNK = 1000;

interface Totals {
  skipped: boolean;
  students: number;
  sessions: number;
  attendances: number;
  audits: number;
  dailyStatuses: number;
}

async function chunked<T>(
  rows: readonly T[],
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

const dbDate = calendarDateToDb;
const pad = (n: number, w: number) => String(n).padStart(w, "0");

/** Tahun ajaran Juli–Juni yang memuat `today`. */
function academicYearOf(today: CalendarDate): { startYear: number } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return { startYear: m >= 7 ? y : y - 1 };
}

export async function runSeed(prisma: PrismaClient, o: SeedOptions): Promise<Totals> {
  const existing = await prisma.school.findUnique({ where: { npsn: SEED_NPSN } });
  if (existing) {
    // Idempoten: seed hanya mengisi database yang belum pernah di-seed. Pakai `pnpm db:reset` dulu
    // bila ingin membangun ulang.
    return { skipped: true, students: 0, sessions: 0, attendances: 0, audits: 0, dailyStatuses: 0 };
  }

  const rng = new Prng(o.seed);
  const tz = o.timezone;
  const now = o.clock.now();
  const today = schoolDateOf(now, tz);
  const { startYear } = academicYearOf(today);
  const yearStart = `${startYear}-07-13`;
  const yearEnd = `${startYear + 1}-06-30`;
  const term1 = { start: yearStart, end: `${startYear}-12-19` };
  const term2 = { start: `${startYear + 1}-01-04`, end: `${startYear + 1}-06-26` };

  // ---------- sekolah, pengaturan, tahun ajaran ----------
  const school = await prisma.school.create({
    // npsn (penanda "sudah di-seed") baru diisi di akhir: seed yang terputus tidak dianggap selesai.
    data: { name: o.schoolName, address: "Alamat contoh (data demo)", timezone: tz },
  });
  await prisma.schoolSetting.create({
    data: {
      schoolId: school.id,
      checkinModes: ["QR", "QUICK"],
      attendanceMode: ATTENDANCE_MODE.BOTH,
      schoolDays: SCHOOL_WEEKDAYS,
      dailyStartTime: DAILY_START,
      dailyCloseTime: DAILY_CLOSE,
      defaultLateAfterMinutes: LATE_AFTER_MINUTES,
    },
  });
  await prisma.geofence.create({
    // Koordinat contoh untuk demo, bukan lokasi sekolah nyata.
    data: {
      schoolId: school.id,
      name: "Gerbang utama (contoh)",
      lat: "-6.1754000",
      lng: "106.8272000",
      radiusM: 150,
    },
  });
  const year = await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      name: `${startYear}/${startYear + 1}`,
      startDate: dbDate(yearStart),
      endDate: dbDate(yearEnd),
      isActive: true,
    },
  });
  const t1 = await prisma.term.create({
    data: {
      academicYearId: year.id,
      semester: 1,
      startDate: dbDate(term1.start),
      endDate: dbDate(term1.end),
      isActive: today <= term1.end,
    },
  });
  const t2 = await prisma.term.create({
    data: {
      academicYearId: year.id,
      semester: 2,
      startDate: dbDate(term2.start),
      endDate: dbDate(term2.end),
      isActive: today > term1.end,
    },
  });
  const termFor = (date: CalendarDate) => (date <= term1.end ? t1 : t2);

  const subjects = await Promise.all(
    SUBJECTS.map((s) =>
      prisma.subject.create({ data: { schoolId: school.id, code: s.code, name: s.name } }),
    ),
  );

  // ---------- guru, jabatan ----------
  const teacherPasswordHash = await argon2.hash(o.passwords.teacher);
  const adminPasswordHash = await argon2.hash(o.passwords.admin);
  const studentPasswordHash = await argon2.hash(o.passwords.student);

  const adminUser = await prisma.user.create({
    data: {
      schoolId: school.id,
      role: "ADMIN",
      name: "Admin Demo",
      email: "admin@hadirin.test",
      passwordHash: adminPasswordHash,
    },
  });
  void adminUser;

  const teachers: Array<{ id: string; userId: string; name: string }> = [];
  for (let i = 0; i < o.teachers; i++) {
    const name = `${FIRST_NAMES[(i * 3) % FIRST_NAMES.length]} ${LAST_NAMES[(i * 5) % LAST_NAMES.length]}, S.Pd.`;
    const u = await prisma.user.create({
      data: {
        schoolId: school.id,
        role: "TEACHER",
        name,
        email: `guru${i + 1}@hadirin.test`,
        // Hanya guru demo (guru1) yang punya kata sandi dari .env. Sisanya diaktifkan lewat
        // alur reset kata sandi (Fase 2): tidak ada kata sandi bersama untuk banyak akun.
        passwordHash: i === 0 ? teacherPasswordHash : null,
        mustChangePassword: i !== 0,
      },
    });
    const t = await prisma.teacher.create({
      data: { userId: u.id, nip: `19800101${pad(i + 1, 10)}` },
    });
    teachers.push({ id: t.id, userId: u.id, name });
  }

  // ---------- kelas ----------
  const classes: Array<{ id: string; grade: number; name: string; homeroomIdx: number }> = [];
  for (const grade of GRADES) {
    for (const letter of o.gradeLetters) {
      const idx = classes.length;
      const homeroomIdx = idx % teachers.length;
      const c = await prisma.class.create({
        data: {
          academicYearId: year.id,
          name: `${grade}${letter}`,
          grade,
          homeroomTeacherId: teachers[homeroomIdx]!.id,
        },
      });
      classes.push({ id: c.id, grade, name: c.name, homeroomIdx });
    }
  }
  // Jabatan: piket, BK, kepala sekolah (guru yang sudah punya jadwal mengajar).
  const positionRows = (
    [
      ["PICKET", Math.min(6, teachers.length - 1)],
      ["COUNSELOR", Math.min(7, teachers.length - 1)],
      ["PRINCIPAL", Math.min(8, teachers.length - 1)],
    ] as const
  ).map(([position, ti]) => ({
    teacherId: teachers[ti]!.id,
    position,
    academicYearId: year.id,
    startsOn: dbDate(yearStart),
  }));
  await prisma.staffPositionAssignment.createMany({ data: positionRows });

  // ---------- jadwal ----------
  const scheduleIds = new Map<
    string,
    { id: string; teacherIdx: number; subjectId: string; slot: number }
  >();
  const scheduleRows: Array<Record<string, unknown>> = [];
  for (const [ci, c] of classes.entries()) {
    for (const term of [t1, t2]) {
      for (let dow = 1; dow <= 5; dow++) {
        for (let slot = 0; slot < SLOT_STARTS.length; slot++) {
          const teacherIdx = (ci + slot * 2 + dow) % teachers.length;
          const subject = subjects[(ci + slot + dow) % subjects.length]!;
          const id = uuidv7();
          scheduleIds.set(`${term.id}|${c.id}|${dow}|${slot}`, {
            id,
            teacherIdx,
            subjectId: subject.id,
            slot,
          });
          scheduleRows.push({
            id,
            termId: term.id,
            classId: c.id,
            subjectId: subject.id,
            teacherId: teachers[teacherIdx]!.id,
            dayOfWeek: dow,
            startTime: SLOT_STARTS[slot]!,
            endTime: SLOT_STARTS[slot]! + SLOT_MINUTES,
          });
        }
      }
    }
  }
  await chunked(scheduleRows, (data) => prisma.schedule.createMany({ data: data as never }));

  // ---------- libur ----------
  const windowStart = addDays(addDays(today, -1), -(o.historyDays - 1));
  const windowEnd = addDays(today, -1);
  const weekdayAfter = (d: CalendarDate): CalendarDate => {
    let x = d;
    while (!SCHOOL_WEEKDAYS.includes(isoDayOfWeek(x))) x = addDays(x, 1);
    return x;
  };
  const holidayAll = weekdayAfter(addDays(today, -Math.floor(o.historyDays * 0.75)));
  const holidayGrade = weekdayAfter(addDays(today, -Math.floor(o.historyDays / 3)));
  const holidayClass = weekdayAfter(addDays(today, -Math.floor(o.historyDays / 6)));
  const classOfHoliday = classes[Math.min(2, classes.length - 1)]!;
  const holidays: HolidayInput[] = [
    { dateFrom: holidayAll, dateTo: holidayAll, scope: HOLIDAY_SCOPE.ALL },
    {
      dateFrom: holidayGrade,
      dateTo: addDays(holidayGrade, 2),
      scope: HOLIDAY_SCOPE.GRADE,
      grade: 9,
    },
    {
      dateFrom: holidayClass,
      dateTo: holidayClass,
      scope: HOLIDAY_SCOPE.CLASS,
      classId: classOfHoliday.id,
    },
  ];
  await prisma.holiday.createMany({
    data: [
      {
        schoolId: school.id,
        name: "Libur nasional (contoh)",
        dateFrom: dbDate(holidays[0]!.dateFrom),
        dateTo: dbDate(holidays[0]!.dateTo),
        scope: "ALL",
      },
      {
        schoolId: school.id,
        name: "Ujian kelas 9 (contoh)",
        dateFrom: dbDate(holidays[1]!.dateFrom),
        dateTo: dbDate(holidays[1]!.dateTo),
        scope: "GRADE",
        grade: 9,
      },
      {
        schoolId: school.id,
        name: "Kegiatan kelas (contoh)",
        dateFrom: dbDate(holidays[2]!.dateFrom),
        dateTo: dbDate(holidays[2]!.dateTo),
        scope: "CLASS",
        classId: classOfHoliday.id,
      },
    ],
  });

  // ---------- siswa, orang tua, pendaftaran ----------
  const perClass = o.students / classes.length;
  interface StudentRec {
    id: string;
    userId: string;
    classIdx: number;
    atRisk: boolean;
    parentUserId: string;
  }
  const students: StudentRec[] = [];
  const enrollments: Array<{
    studentIdx: number;
    classIdx: number;
    start: CalendarDate;
    end: CalendarDate | null;
    reason: string | null;
  }> = [];
  const studentUsers: Array<Record<string, unknown>> = [];
  const studentRows: Array<Record<string, unknown>> = [];
  const parentUsers: Array<Record<string, unknown>> = [];
  const parentRows: Array<Record<string, unknown>> = [];
  const studentParentRows: Array<Record<string, unknown>> = [];

  const moveDay = weekdayAfter(addDays(today, -Math.floor(o.historyDays / 2)));
  // 3 siswa pindah kelas di tengah periode: A -> B pada tingkat 7, 8, 9.
  const movers = new Set<number>();
  const siblingPairs: Array<[number, number]> = [];

  for (let i = 0; i < o.students; i++) {
    const classIdx = Math.min(classes.length - 1, Math.floor(i / perClass));
    const userId = uuidv7();
    const studentId = uuidv7();
    const nis = `${startYear}${pad(i + 1, 6)}`;
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7) % LAST_NAMES.length]}`;
    const isDemo = i === 0;
    studentUsers.push({
      id: userId,
      schoolId: school.id,
      role: "STUDENT",
      name,
      loginId: nis,
      // Hanya siswa demo pertama yang punya kata sandi (dari .env).
      passwordHash: isDemo ? studentPasswordHash : null,
      mustChangePassword: !isDemo,
    });
    studentRows.push({ id: studentId, userId, nis, nisn: `00${pad(i + 1, 8)}` });
    students.push({ id: studentId, userId, classIdx, atRisk: false, parentUserId: "" });
  }

  // Siswa berisiko: alpa berkelompok pada siswa tertentu (Rancangan §17).
  const riskCount = Math.max(4, Math.round(o.students * 0.04));
  for (let k = 0; k < riskCount; k++) students[(k * 23 + 5) % students.length]!.atRisk = true;

  // Kakak-adik: dua pasang berbagi satu akun orang tua.
  const firstGrade9 = students.findIndex((s) => classes[s.classIdx]!.grade === 9);
  const firstGrade7 = students.findIndex((s) => classes[s.classIdx]!.grade === 7);
  siblingPairs.push([firstGrade9 + 1, firstGrade7 + 1], [firstGrade9 + 3, firstGrade7 + 3]);
  // Kakak (indeks lebih besar, tingkat 9) memakai akun orang tua adiknya (tingkat 7, diproses lebih dulu).
  const siblingOf = new Map<number, number>();
  for (const [older, younger] of siblingPairs) siblingOf.set(older, younger);

  const parentOfStudent = new Map<number, { userId: string; parentId: string }>();
  let parentSeq = 0;
  for (let i = 0; i < students.length; i++) {
    const elder = siblingOf.get(i);
    const stu = students[i]!;
    let rec: { userId: string; parentId: string };
    if (elder !== undefined) {
      rec = parentOfStudent.get(elder)!;
    } else {
      parentSeq++;
      const userId = uuidv7();
      const parentId = uuidv7();
      rec = { userId, parentId };
      parentUsers.push({
        id: userId,
        schoolId: school.id,
        role: "PARENT",
        name: `Orang tua ${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7) % LAST_NAMES.length]}`,
        // Orang tua masuk lewat tautan/OTP, tanpa kata sandi (Rancangan §10.2).
        passwordHash: null,
      });
      const optIn = i % 10 < 7;
      parentRows.push({
        id: parentId,
        userId,
        // Nomor sintetis berawalan 800 (tidak dipakai sebagai nomor seluler nyata).
        phoneWa: `+62800${pad(parentSeq, 7)}`,
        waOptIn: optIn,
        waOptInAt: optIn ? now : null,
        waOptSource: optIn ? "PORTAL" : null,
      });
    }
    parentOfStudent.set(i, rec);
    stu.parentUserId = rec.userId;
    studentParentRows.push({
      studentId: stu.id,
      parentId: rec.parentId,
      relation: "Orang tua",
      isPrimary: true,
      receivesNotifications: true,
    });
  }

  // Pendaftaran kelas, termasuk 3 siswa yang pindah.
  for (const grade of GRADES) {
    const fromIdx = classes.findIndex((c) => c.grade === grade);
    const toIdx = fromIdx + 1;
    const mover = students.findIndex((s) => s.classIdx === fromIdx);
    if (mover >= 0 && toIdx < classes.length) movers.add(mover);
  }
  for (const [i, s] of students.entries()) {
    if (movers.has(i)) {
      const toIdx = s.classIdx + 1;
      enrollments.push({
        studentIdx: i,
        classIdx: s.classIdx,
        start: yearStart,
        end: addDays(moveDay, -1),
        reason: "MOVED_CLASS",
      });
      enrollments.push({ studentIdx: i, classIdx: toIdx, start: moveDay, end: null, reason: null });
    } else {
      enrollments.push({
        studentIdx: i,
        classIdx: s.classIdx,
        start: yearStart,
        end: null,
        reason: null,
      });
    }
  }

  await chunked(studentUsers, (data) => prisma.user.createMany({ data: data as never }));
  await chunked(studentRows, (data) => prisma.student.createMany({ data: data as never }));
  await chunked(parentUsers, (data) => prisma.user.createMany({ data: data as never }));
  await chunked(parentRows, (data) => prisma.parent.createMany({ data: data as never }));
  await chunked(studentParentRows, (data) =>
    prisma.studentParent.createMany({ data: data as never }),
  );
  await chunked(
    enrollments.map((e) => ({
      studentId: students[e.studentIdx]!.id,
      classId: classes[e.classIdx]!.id,
      academicYearId: year.id,
      startDate: dbDate(e.start),
      endDate: e.end ? dbDate(e.end) : null,
      endReason: e.reason,
      openEnrollmentKey: openEnrollmentKey({
        studentId: students[e.studentIdx]!.id,
        academicYearId: year.id,
        endDate: e.end,
      }),
    })),
    (data) => prisma.classEnrollment.createMany({ data: data as never }),
  );

  // ---------- templat notifikasi ----------
  const templates: Array<[string, string]> = [
    [
      "ABSENT",
      "Halo, {{nama_anak}} tercatat tidak hadir pada {{tanggal}}. Bila ada keterangan, ajukan lewat portal.",
    ],
    ["LATE", "Halo, {{nama_anak}} tercatat terlambat {{menit}} menit pada {{tanggal}}."],
    ["DAILY_DIGEST", "Ringkasan kehadiran {{nama_anak}} pada {{tanggal}}: {{ringkasan}}."],
    [
      "CORRECTION",
      "Status kehadiran {{nama_anak}} pada {{tanggal}} diperbarui menjadi {{status}}.",
    ],
    ["LEAVE_APPROVED", "Pengajuan {{jenis}} untuk {{nama_anak}} pada {{tanggal}} disetujui."],
    [
      "LEAVE_REJECTED",
      "Pengajuan {{jenis}} untuk {{nama_anak}} pada {{tanggal}} ditolak. Alasan: {{alasan}}.",
    ],
    ["OTP", "Kode masuk hadir.in: {{kode}}. Berlaku 5 menit. Jangan bagikan kode ini."],
    ["MAGIC_LINK", "Masuk ke hadir.in lewat tautan ini (sekali pakai): {{tautan}}"],
  ];
  await prisma.notificationTemplate.createMany({
    data: templates.map(([key, body]) => ({
      schoolId: school.id,
      key: key as never,
      channel: "WHATSAPP" as const,
      body,
      isEditable: key !== "OTP" && key !== "MAGIC_LINK",
    })),
  });

  // ---------- riwayat kehadiran ----------
  const days = eachDate(windowStart, windowEnd).filter((d) =>
    SCHOOL_WEEKDAYS.includes(isoDayOfWeek(d)),
  );
  const enrollmentsByClass = new Map<number, typeof enrollments>();
  for (const e of enrollments) {
    const list = enrollmentsByClass.get(e.classIdx) ?? [];
    list.push(e);
    enrollmentsByClass.set(e.classIdx, list);
  }

  // Tiga hari kelas tanpa sesi harian: muncul sebagai "Tidak tercatat".
  const skippedDaily = new Set<string>();
  for (let k = 0; k < 3; k++)
    skippedDaily.add(`${rng.int(0, classes.length - 1)}|${days[rng.int(0, days.length - 1)]}`);

  const sessionRows: Array<Record<string, unknown>> = [];
  const attendanceRows: Array<Record<string, unknown>> = [];
  const auditRows: Array<Record<string, unknown>> = [];
  const leaveRows: Array<Record<string, unknown>> = [];
  const dailyRowsByStudentDay = new Map<string, { classId: string; rows: ClosedSessionRow[] }>();
  const previousDayStatus = new Map<number, AttendanceStatus>();
  let approvedLateLeaves = 0;

  const drawDayStatus = (s: StudentRec, studentIdx: number, dow: number): AttendanceStatus => {
    const prev = previousDayStatus.get(studentIdx);
    if (s.atRisk) {
      // Alpa berkelompok: hari alpa cenderung berlanjut.
      if (prev === S.ABSENT && rng.chance(0.6)) return S.ABSENT;
      if (rng.chance(0.14)) return S.ABSENT;
    }
    const edge = dow === 1 || dow === 5 ? 0.018 : 0;
    const r = rng.next();
    if (r < 0.025 + edge) return S.ABSENT;
    if (r < 0.025 + edge + 0.02) return S.SICK;
    if (r < 0.025 + edge + 0.02 + 0.012) return S.EXCUSED;
    if (r < 0.025 + edge + 0.02 + 0.012 + 0.003) return S.DISPENSED;
    if (r < 0.025 + edge + 0.02 + 0.012 + 0.003 + 0.04) return S.LATE;
    return S.PRESENT;
  };

  const checkInMethod = () => {
    const r = rng.next();
    return r < 0.7
      ? ATTENDANCE_METHOD.QR
      : r < 0.8
        ? ATTENDANCE_METHOD.CODE
        : ATTENDANCE_METHOD.MANUAL;
  };

  const sessionTotal = { n: 0 };

  for (const date of days) {
    const dow = isoDayOfWeek(date);
    const term = termFor(date);
    for (const [ci, c] of classes.entries()) {
      const cls = { id: c.id, grade: c.grade };
      if (holidays.some((h) => holidayApplies(h, date, cls))) continue;
      const members = (enrollmentsByClass.get(ci) ?? []).filter(
        (e) => e.start <= date && (e.end === null || e.end >= date),
      );
      if (members.length === 0) continue;

      // Status harian tiap siswa pada hari ini (diundi sekali, dipakai semua sesi hari itu).
      const dayStatus = new Map<number, AttendanceStatus>();
      for (const m of members)
        dayStatus.set(m.studentIdx, drawDayStatus(students[m.studentIdx]!, m.studentIdx, dow));

      const homeroom = teachers[c.homeroomIdx]!;
      const sessionSpecs: Array<{
        type: "DAILY" | "SUBJECT";
        slot: number;
        startMin: number;
        closeMin: number;
        schedule?: { id: string; teacherIdx: number; subjectId: string };
      }> = [];
      if (!skippedDaily.has(`${ci}|${date}`)) {
        sessionSpecs.push({
          type: SESSION_TYPE.DAILY,
          slot: -1,
          startMin: DAILY_START,
          closeMin: DAILY_CLOSE,
        });
      }
      for (let slot = 0; slot < SLOT_STARTS.length; slot++) {
        const sch = scheduleIds.get(`${term.id}|${c.id}|${dow}|${slot}`)!;
        // Sekitar 3% jadwal tidak dibuka sesinya (guru lupa).
        if (rng.chance(0.03)) continue;
        sessionSpecs.push({
          type: SESSION_TYPE.SUBJECT,
          slot,
          startMin: SLOT_STARTS[slot]!,
          closeMin: SLOT_STARTS[slot]! + SLOT_MINUTES,
          schedule: sch,
        });
      }

      const sessionRecords = sessionSpecs.map((spec) => {
        const startsAt = instantFromWallMinutes(date, spec.startMin, tz);
        const lateThresholdAt = new Date(startsAt.getTime() + LATE_AFTER_MINUTES * 60_000);
        const closesAt = instantFromWallMinutes(date, spec.closeMin, tz);
        const opener = spec.schedule ? teachers[spec.schedule.teacherIdx]! : homeroom;
        const id = uuidv7();
        const status = SESSION_STATUS.CLOSED;
        sessionRows.push({
          id,
          schoolId: school.id,
          classId: c.id,
          termId: term.id,
          scheduleId: spec.schedule?.id ?? null,
          subjectId: spec.schedule?.subjectId ?? null,
          type: spec.type,
          sessionDate: dbDate(date),
          startsAt,
          lateAfterMinutes: LATE_AFTER_MINUTES,
          lateThresholdAt,
          openedAt: new Date(startsAt.getTime() - 2 * 60_000),
          openedById: opener.userId,
          closesAt,
          closedAt: closesAt,
          closedById: null,
          status,
          // Data demo: bukan rahasia sungguhan. Enkripsi qr_secret dibangun di Fase 3.
          qrSecretEnc: `seed-placeholder:${crypto.randomBytes(24).toString("base64")}`,
          isBackfill: false,
          scheduleSlotKey: scheduleSlotKey({
            scheduleId: spec.schedule?.id ?? null,
            sessionDate: date,
            status,
          }),
          dailySlotKey: dailySlotKey({ type: spec.type, classId: c.id, sessionDate: date, status }),
        });
        sessionTotal.n++;
        return { id, spec, startsAt, lateThresholdAt, closesAt, opener };
      });

      for (const m of members) {
        const stu = students[m.studentIdx]!;
        const day = dayStatus.get(m.studentIdx)!;
        const parentUserId = stu.parentUserId;
        let leaveRequestId: string | null = null;
        // Hari berizin: separuhnya sudah diajukan lewat portal dan disetujui sebelum hari itu.
        const viaLeave = (day === S.SICK || day === S.EXCUSED) && rng.chance(0.5);
        // Alpa yang izinnya disetujui terlambat: sistem mengubah ABSENT menjadi izin lewat audit.
        const lateApproval = day === S.ABSENT && !stu.atRisk && rng.chance(0.08);
        let finalDay: AttendanceStatus = day;
        let lateApprovalStatus: AttendanceStatus | null = null;
        if (lateApproval) {
          lateApprovalStatus = rng.chance(0.5) ? S.SICK : S.EXCUSED;
          approvedLateLeaves++;
        }
        if (viaLeave || lateApproval) {
          leaveRequestId = uuidv7();
          const leaveType = (lateApprovalStatus ?? day) as "SICK" | "EXCUSED";
          const reviewedAt = lateApproval
            ? new Date(instantFromWallMinutes(addDays(date, 1), 15 * 60, tz))
            : new Date(instantFromWallMinutes(addDays(date, -1), 16 * 60, tz));
          leaveRows.push({
            id: leaveRequestId,
            studentId: stu.id,
            requestedById: parentUserId,
            requesterRole: "PARENT",
            type: leaveType,
            dateFrom: dbDate(date),
            dateTo: dbDate(date),
            reason: leaveType === "SICK" ? "Sakit (contoh)" : "Keperluan keluarga (contoh)",
            status: "APPROVED",
            reviewedById: homeroom.userId,
            reviewedAt,
          });
          if (lateApproval) finalDay = lateApprovalStatus!;
        }

        const rowsForDaily: ClosedSessionRow[] = [];
        for (const sr of sessionRecords) {
          // Status per sesi mengikuti status harian, dengan sedikit variasi per mapel.
          let status: AttendanceStatus = finalDay;
          if (sr.spec.type === SESSION_TYPE.SUBJECT) {
            if (finalDay === S.PRESENT && rng.chance(0.012))
              status = S.ABSENT; // bolos sebagian
            else if (finalDay === S.LATE)
              status = sr.spec.slot === 0 && rng.chance(0.6) ? S.LATE : S.PRESENT;
          }

          const attendanceId = uuidv7();
          let method: string = ATTENDANCE_METHOD.AUTO;
          let checkedInAt: Date | null = null;
          let lateMinutes = 0;
          let createdById: string | null = null;

          if (status === S.PRESENT) {
            method = checkInMethod();
            checkedInAt = new Date(
              sr.startsAt.getTime() + rng.int(-2, LATE_AFTER_MINUTES - 1) * 60_000,
            );
          } else if (status === S.LATE) {
            method = checkInMethod();
            lateMinutes = rng.int(1, 25);
            checkedInAt = new Date(sr.lateThresholdAt.getTime() + lateMinutes * 60_000);
          } else if (status === S.ABSENT) {
            method = ATTENDANCE_METHOD.AUTO;
          } else if (viaLeave || lateApproval) {
            method = ATTENDANCE_METHOD.LEAVE;
          } else {
            method = ATTENDANCE_METHOD.MANUAL;
            createdById = sr.opener.userId;
          }
          if (method === ATTENDANCE_METHOD.MANUAL && (status === S.PRESENT || status === S.LATE)) {
            createdById = sr.opener.userId;
          }

          attendanceRows.push({
            id: attendanceId,
            sessionId: sr.id,
            studentId: stu.id,
            classId: c.id,
            sessionDate: dbDate(date),
            sessionType: sr.spec.type,
            status,
            method,
            checkedInAt,
            lateMinutes,
            leaveRequestId: viaLeave || lateApproval ? leaveRequestId : null,
            createdById,
          });

          if (lateApproval && status !== S.PRESENT && status !== S.LATE) {
            // Jejak perubahan oleh sistem saat izin disetujui terlambat (Rancangan §12.5, §12.7).
            auditRows.push({
              attendanceId,
              actorType: "SYSTEM",
              changedById: null,
              oldStatus: S.ABSENT,
              newStatus: status,
              oldMethod: ATTENDANCE_METHOD.AUTO,
              newMethod: ATTENDANCE_METHOD.LEAVE,
              reason: null,
              source: "LEAVE_APPROVAL",
              leaveRequestId,
              changedAt: new Date(instantFromWallMinutes(addDays(date, 1), 15 * 60, tz)),
            });
          }
          rowsForDaily.push({ sessionType: sr.spec.type, sessionStartsAt: sr.startsAt, status });
        }
        const key = `${m.studentIdx}|${date}`;
        dailyRowsByStudentDay.set(key, { classId: c.id, rows: rowsForDaily });
        previousDayStatus.set(m.studentIdx, finalDay);
      }
    }
  }

  // ---------- simpan ----------
  await chunked(sessionRows, (data) =>
    prisma.attendanceSession.createMany({ data: data as never }),
  );
  await chunked(leaveRows, (data) => prisma.leaveRequest.createMany({ data: data as never }));
  await chunked(attendanceRows, (data) => prisma.attendance.createMany({ data: data as never }));
  await chunked(auditRows, (data) => prisma.attendanceAudit.createMany({ data: data as never }));

  // Status harian turunan dihitung oleh fungsi domain yang sama dengan aplikasi (Rancangan §12.9).
  const dailyRows: Array<Record<string, unknown>> = [];
  for (const [key, v] of dailyRowsByStudentDay) {
    const [studentIdxRaw, date] = key.split("|") as [string, CalendarDate];
    const derived = deriveDailyStatus(ATTENDANCE_MODE.BOTH, v.rows);
    if (!derived) continue; // sesi harian tidak dibuka: Tidak tercatat
    dailyRows.push({
      studentId: students[Number(studentIdxRaw)]!.id,
      classId: v.classId,
      date: dbDate(date),
      status: derived.status,
      source: derived.source,
      partialAbsence: derived.partialAbsence,
      computedAt: instantFromWallMinutes(date, DAILY_CLOSE, tz),
    });
  }
  await chunked(dailyRows, (data) => prisma.dailyStatus.createMany({ data: data as never }));

  await prisma.school.update({ where: { id: school.id }, data: { npsn: SEED_NPSN } });
  void approvedLateLeaves;
  return {
    skipped: false,
    students: students.length,
    sessions: sessionTotal.n,
    attendances: attendanceRows.length,
    audits: auditRows.length,
    dailyStatuses: dailyRows.length,
  };
}
