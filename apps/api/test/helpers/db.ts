import { expect } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { calendarDateToDb } from "@hadirin/domain";
import { dbTarget } from "../../scripts/lib/env";
import { createPrismaClient } from "../../src/infra/db/prisma";
import {
  activeStudentKey,
  dailySlotKey,
  openEnrollmentKey,
  scheduleSlotKey,
} from "../../src/infra/db/keys";

export const prisma = createPrismaClient(dbTarget("test"));

export const D = calendarDateToDb;

/** Database harus menolak: tes gagal bila operasi berhasil atau galatnya bukan yang diharapkan. */
export async function expectDbRejects(
  op: Promise<unknown> | (() => Promise<unknown>),
  pattern: RegExp,
): Promise<void> {
  let error: unknown;
  try {
    await (typeof op === "function" ? op() : op);
  } catch (e) {
    error = e;
  }
  expect(error, "database seharusnya menolak operasi ini").toBeDefined();
  const text =
    error instanceof Error
      ? `${error.message}\n${String((error as { cause?: unknown }).cause ?? "")}`
      : String(error);
  expect(text).toMatch(pattern);
}

export interface World {
  schoolId: string;
  timezone: string;
  yearId: string;
  termId: string;
  teacherId: string;
  teacherUserId: string;
  subjectId: string;
  classId: string;
  studentId: string;
  studentUserId: string;
  scheduleId: string;
}

let counter = 0;
const uniq = () =>
  `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Satu sekolah lengkap dengan satu kelas, satu siswa, dan satu jadwal. */
export async function makeWorld(timezone = "Asia/Jakarta"): Promise<World> {
  const school = await prisma.school.create({ data: { name: `Sekolah ${uniq()}`, timezone } });
  const year = await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      name: uniq().slice(0, 18),
      startDate: D("2026-07-13"),
      endDate: D("2027-06-30"),
    },
  });
  const term = await prisma.term.create({
    data: {
      academicYearId: year.id,
      semester: 1,
      startDate: D("2026-07-13"),
      endDate: D("2026-12-19"),
    },
  });
  const teacherUser = await prisma.user.create({
    data: { schoolId: school.id, role: "TEACHER", name: "Guru Uji", email: `${uniq()}@test.local` },
  });
  const teacher = await prisma.teacher.create({ data: { userId: teacherUser.id } });
  const subject = await prisma.subject.create({
    data: { schoolId: school.id, code: uniq().slice(0, 18), name: "Mapel Uji" },
  });
  const cls = await prisma.class.create({
    data: {
      academicYearId: year.id,
      name: uniq().slice(0, 40),
      grade: 7,
      homeroomTeacherId: teacher.id,
    },
  });
  const studentUser = await prisma.user.create({
    data: { schoolId: school.id, role: "STUDENT", name: "Siswa Uji", loginId: uniq().slice(0, 40) },
  });
  const student = await prisma.student.create({
    data: { userId: studentUser.id, nis: uniq().slice(0, 28) },
  });
  await prisma.classEnrollment.create({
    data: {
      studentId: student.id,
      classId: cls.id,
      academicYearId: year.id,
      startDate: D("2026-07-13"),
      openEnrollmentKey: openEnrollmentKey({
        studentId: student.id,
        academicYearId: year.id,
        endDate: null,
      }),
    },
  });
  const schedule = await prisma.schedule.create({
    data: {
      termId: term.id,
      classId: cls.id,
      subjectId: subject.id,
      teacherId: teacher.id,
      dayOfWeek: 1,
      startTime: 450,
      endTime: 495,
    },
  });
  return {
    schoolId: school.id,
    timezone,
    yearId: year.id,
    termId: term.id,
    teacherId: teacher.id,
    teacherUserId: teacherUser.id,
    subjectId: subject.id,
    classId: cls.id,
    studentId: student.id,
    studentUserId: studentUser.id,
    scheduleId: schedule.id,
  };
}

export async function makeStudent(w: World): Promise<string> {
  const u = await prisma.user.create({
    data: {
      schoolId: w.schoolId,
      role: "STUDENT",
      name: "Siswa Tambahan",
      loginId: uniq().slice(0, 40),
    },
  });
  const s = await prisma.student.create({ data: { userId: u.id, nis: uniq().slice(0, 28) } });
  return s.id;
}

export interface SessionOverrides {
  type?: "DAILY" | "SUBJECT";
  scheduleId?: string | null;
  subjectId?: string | null;
  sessionDate?: string;
  status?: "OPEN" | "CLOSED" | "CANCELLED";
  openedAt?: Date;
  closesAt?: Date;
  lateAfterMinutes?: number;
}

/** Sesi dengan kolom kunci diisi lewat fungsi resmi (keys.ts), seperti yang dilakukan aplikasi. */
export async function makeSession(w: World, o: SessionOverrides = {}) {
  const type = o.type ?? "SUBJECT";
  const sessionDate = o.sessionDate ?? "2026-10-05";
  const status = o.status ?? "OPEN";
  const scheduleId =
    o.scheduleId === undefined ? (type === "SUBJECT" ? w.scheduleId : null) : o.scheduleId;
  const openedAt = o.openedAt ?? new Date("2026-10-05T00:28:00.000Z");
  return prisma.attendanceSession.create({
    data: {
      schoolId: w.schoolId,
      classId: w.classId,
      termId: w.termId,
      scheduleId,
      subjectId:
        o.subjectId === undefined ? (type === "SUBJECT" ? w.subjectId : null) : o.subjectId,
      type,
      sessionDate: D(sessionDate),
      startsAt: new Date("2026-10-05T00:30:00.000Z"),
      lateAfterMinutes: o.lateAfterMinutes ?? 10,
      lateThresholdAt: new Date("2026-10-05T00:40:00.000Z"),
      openedAt,
      openedById: w.teacherUserId,
      closesAt: o.closesAt ?? new Date("2026-10-05T01:15:00.000Z"),
      status,
      qrSecretEnc: "uji",
      scheduleSlotKey: scheduleSlotKey({ scheduleId, sessionDate, status }),
      dailySlotKey: dailySlotKey({ type, classId: w.classId, sessionDate, status }),
    },
  });
}

export async function makeAttendance(
  w: World,
  sessionId: string,
  studentId: string,
  o: {
    status?: "PRESENT" | "LATE" | "ABSENT" | "SICK";
    method?: "QR" | "AUTO" | "MANUAL";
    checkedInAt?: Date | null;
    lateMinutes?: number;
  } = {},
) {
  const status = o.status ?? "PRESENT";
  return prisma.attendance.create({
    data: {
      sessionId,
      studentId,
      classId: w.classId,
      sessionDate: D("2026-10-05"),
      sessionType: "SUBJECT",
      status,
      method: o.method ?? "QR",
      checkedInAt:
        o.checkedInAt === undefined
          ? status === "PRESENT" || status === "LATE"
            ? new Date("2026-10-05T00:31:00.000Z")
            : null
          : o.checkedInAt,
      lateMinutes: o.lateMinutes ?? (status === "LATE" ? 5 : 0),
    },
  });
}

export async function makeDevice(
  studentId: string,
  status: "ACTIVE" | "PENDING" | "REVOKED",
  keyOverride?: string | null,
) {
  return prisma.device.create({
    data: {
      studentId,
      deviceHash: `h-${uniq()}`,
      status,
      bindMethod: "FIRST_LOGIN",
      boundAt: new Date("2026-10-05T00:00:00.000Z"),
      activeStudentKey:
        keyOverride === undefined ? activeStudentKey({ studentId, status }) : keyOverride,
    },
  });
}

export const newId = uuidv7;
export const unique = uniq;
