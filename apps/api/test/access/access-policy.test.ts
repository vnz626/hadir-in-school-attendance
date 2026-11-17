import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@hadirin/domain";
import { AccessPolicy } from "../../src/modules/access-policy/access-policy.service";
import { createTestApp, type TestApp } from "../helpers/app";
import { D, prisma } from "../helpers/db";
import { makeSchoolWorld, type SchoolWorld } from "../helpers/school";

let t: TestApp;
let policy: AccessPolicy;
let w: SchoolWorld;

beforeAll(async () => {
  t = await createTestApp();
  policy = t.app.get(AccessPolicy);
  w = await makeSchoolWorld();
});

afterAll(async () => {
  await t.close();
});

/** Satu baris tabel = satu subjek dengan harapan akses pada setiap sumber data. */
interface Row {
  who: string;
  actor: () => SchoolWorld["admin"]["ctx"];
  readStudentA: boolean;
  readStudentB: boolean;
  manageStudentA: boolean;
  manageStudentB: boolean;
  readClassA: boolean;
  readClassB: boolean;
  settings: boolean;
}

const rows: Row[] = [
  {
    who: "admin",
    actor: () => w.admin.ctx,
    readStudentA: true,
    readStudentB: true,
    manageStudentA: true,
    manageStudentB: true,
    readClassA: true,
    readClassB: true,
    settings: true,
  },
  {
    who: "wali kelas A",
    actor: () => w.homeroomA.ctx,
    readStudentA: true,
    readStudentB: false,
    manageStudentA: true,
    manageStudentB: false,
    readClassA: true,
    readClassB: false,
    settings: false,
  },
  {
    who: "wali kelas B",
    actor: () => w.homeroomB.ctx,
    readStudentA: false,
    readStudentB: true,
    manageStudentA: false,
    manageStudentB: true,
    readClassA: false,
    readClassB: true,
    settings: false,
  },
  {
    who: "guru mapel kelas A",
    actor: () => w.subjectTeacherA.ctx,
    readStudentA: false,
    readStudentB: false,
    manageStudentA: false,
    manageStudentB: false,
    readClassA: true,
    readClassB: false,
    settings: false,
  },
  {
    who: "guru mapel kelas B",
    actor: () => w.subjectTeacherB.ctx,
    readStudentA: false,
    readStudentB: false,
    manageStudentA: false,
    manageStudentB: false,
    readClassA: false,
    readClassB: true,
    settings: false,
  },
  {
    who: "guru pengganti kelas A (hari ini)",
    actor: () => w.substituteA.ctx,
    readStudentA: false,
    readStudentB: false,
    manageStudentA: false,
    manageStudentB: false,
    readClassA: true,
    readClassB: false,
    settings: false,
  },
  {
    who: "guru piket",
    actor: () => w.picket.ctx,
    readStudentA: false,
    readStudentB: false,
    manageStudentA: false,
    manageStudentB: false,
    readClassA: false,
    readClassB: false,
    settings: false,
  },
  {
    who: "BK",
    actor: () => w.counselor.ctx,
    readStudentA: true,
    readStudentB: true,
    manageStudentA: false,
    manageStudentB: false,
    readClassA: true,
    readClassB: true,
    settings: true,
  },
  {
    who: "kepala sekolah",
    actor: () => w.principal.ctx,
    readStudentA: true,
    readStudentB: true,
    manageStudentA: false,
    manageStudentB: false,
    readClassA: true,
    readClassB: true,
    settings: true,
  },
  {
    who: "guru tanpa kaitan",
    actor: () => w.outsider.ctx,
    readStudentA: false,
    readStudentB: false,
    manageStudentA: false,
    manageStudentB: false,
    readClassA: false,
    readClassB: false,
    settings: false,
  },
  {
    who: "siswa A",
    actor: () => w.studentA.ctx,
    readStudentA: true,
    readStudentB: false,
    manageStudentA: false,
    manageStudentB: false,
    readClassA: false,
    readClassB: false,
    settings: false,
  },
  {
    who: "siswa B",
    actor: () => w.studentB.ctx,
    readStudentA: false,
    readStudentB: true,
    manageStudentA: false,
    manageStudentB: false,
    readClassA: false,
    readClassB: false,
    settings: false,
  },
  {
    who: "orang tua A",
    actor: () => w.parentA.ctx,
    readStudentA: true,
    readStudentB: false,
    manageStudentA: false,
    manageStudentB: false,
    readClassA: false,
    readClassB: false,
    settings: false,
  },
  {
    who: "orang tua B",
    actor: () => w.parentB.ctx,
    readStudentA: false,
    readStudentB: true,
    manageStudentA: false,
    manageStudentB: false,
    readClassA: false,
    readClassB: false,
    settings: false,
  },
];

describe("AccessPolicy: matriks peran × sumber data (Rancangan §14.1)", () => {
  it.each(rows.map((r) => [r.who, r] as const))("%s", async (_who, r) => {
    const a = r.actor();
    expect({
      readStudentA: await policy.canReadStudent(a, w.studentA.studentId),
      readStudentB: await policy.canReadStudent(a, w.studentB.studentId),
      manageStudentA: await policy.canManageStudent(a, w.studentA.studentId),
      manageStudentB: await policy.canManageStudent(a, w.studentB.studentId),
      readClassA: await policy.canReadClass(a, w.classA.id),
      readClassB: await policy.canReadClass(a, w.classB.id),
      settings: await policy.canReadSchoolSettings(a),
    }).toEqual({
      readStudentA: r.readStudentA,
      readStudentB: r.readStudentB,
      manageStudentA: r.manageStudentA,
      manageStudentB: r.manageStudentB,
      readClassA: r.readClassA,
      readClassB: r.readClassB,
      settings: r.settings,
    });
  });

  it("hanya admin yang lolos assertAdmin; semua peran lain mendapat 403", () => {
    expect(() => policy.assertAdmin(w.admin.ctx)).not.toThrow();
    for (const r of rows.filter((x) => x.who !== "admin")) {
      expect(() => policy.assertAdmin(r.actor()), r.who).toThrowError(/akses/);
    }
  });

  it("assert* melempar 403 FORBIDDEN dengan format galat seragam", async () => {
    await expect(
      policy.assertCanReadStudent(w.studentB.ctx, w.studentA.studentId),
    ).rejects.toMatchObject({
      status: 403,
      response: { error: { code: "FORBIDDEN" } },
    });
  });

  it("siswa yang pindah kelas: wali kelas lama kehilangan akses, wali kelas baru mendapatkannya", async () => {
    await prisma.classEnrollment.updateMany({
      where: { studentId: w.studentA.studentId, endDate: null },
      data: { endDate: D(addDays(w.today, -1)), endReason: "MOVED_CLASS", openEnrollmentKey: null },
    });
    await prisma.classEnrollment.create({
      data: {
        studentId: w.studentA.studentId,
        classId: w.classB.id,
        academicYearId: w.yearId,
        startDate: D(w.today),
        openEnrollmentKey: `${w.studentA.studentId}|${w.yearId}`,
      },
    });
    expect(await policy.canManageStudent(w.homeroomA.ctx, w.studentA.studentId)).toBe(false);
    expect(await policy.canManageStudent(w.homeroomB.ctx, w.studentA.studentId)).toBe(true);
    // pulihkan agar tes lain tetap sah
    await prisma.classEnrollment.deleteMany({
      where: { studentId: w.studentA.studentId, classId: w.classB.id },
    });
    await prisma.classEnrollment.updateMany({
      where: { studentId: w.studentA.studentId, endReason: "MOVED_CLASS" },
      data: {
        endDate: null,
        endReason: null,
        openEnrollmentKey: `${w.studentA.studentId}|${w.yearId}`,
      },
    });
    expect(await policy.canManageStudent(w.homeroomA.ctx, w.studentA.studentId)).toBe(true);
  });

  it("kelas yang diarsipkan tidak lagi memberi akses wali kelas", async () => {
    const cls = await prisma.class.create({
      data: {
        academicYearId: w.yearId,
        name: `Arsip-${Date.now()}`.slice(0, 40),
        grade: 8,
        homeroomTeacherId: w.homeroomA.teacherId,
        deletedAt: new Date(),
      },
    });
    expect(await policy.canReadClass(w.homeroomA.ctx, cls.id)).toBe(false);
  });
});

describe("AccessPolicy: guru pengganti dan guru piket berlaku per tanggal", () => {
  it("pengganti hanya punya akses pada tanggal penugasan: besok tidak, hari ini ya", async () => {
    const today = w.today;
    expect(await policy.canReadClass(w.substituteA.ctx, w.classA.id)).toBe(true);
    // Geser penugasan ke besok: hari ini tidak lagi berlaku.
    await prisma.scheduleSubstitution.updateMany({
      where: { scheduleId: w.scheduleA.id },
      data: { date: D(addDays(today, 1)) },
    });
    expect(await policy.canReadClass(w.substituteA.ctx, w.classA.id)).toBe(false);
    await prisma.scheduleSubstitution.updateMany({
      where: { scheduleId: w.scheduleA.id },
      data: { date: D(today) },
    });
    expect(await policy.canReadClass(w.substituteA.ctx, w.classA.id)).toBe(true);
  });

  const session = (over: Partial<Parameters<AccessPolicy["canOperateSession"]>[1]> = {}) => ({
    classId: w.classA.id,
    scheduleId: w.scheduleA.id,
    type: "SUBJECT" as const,
    sessionDate: w.today,
    openedById: w.subjectTeacherA.userId,
    ...over,
  });

  it("sesi mapel: pembuka, pengganti pada tanggalnya, wali kelas, dan admin; guru lain tidak", async () => {
    expect(await policy.canOperateSession(w.subjectTeacherA.ctx, session())).toBe(true);
    expect(await policy.canOperateSession(w.substituteA.ctx, session())).toBe(true);
    expect(await policy.canOperateSession(w.homeroomA.ctx, session())).toBe(true);
    expect(await policy.canOperateSession(w.admin.ctx, session())).toBe(true);
    expect(await policy.canOperateSession(w.homeroomB.ctx, session())).toBe(false);
    expect(await policy.canOperateSession(w.subjectTeacherB.ctx, session())).toBe(false);
    expect(await policy.canOperateSession(w.picket.ctx, session())).toBe(false);
    expect(await policy.canOperateSession(w.counselor.ctx, session())).toBe(false);
    expect(await policy.canOperateSession(w.studentA.ctx, session())).toBe(false);
    expect(await policy.canOperateSession(w.parentA.ctx, session())).toBe(false);
  });

  it("pengganti tidak boleh mengoperasikan sesi mapel pada tanggal lain", async () => {
    expect(
      await policy.canOperateSession(
        w.substituteA.ctx,
        session({ sessionDate: addDays(w.today, 1) }),
      ),
    ).toBe(false);
    expect(
      await policy.canOperateSession(
        w.substituteA.ctx,
        session({ sessionDate: addDays(w.today, -1) }),
      ),
    ).toBe(false);
  });

  it("guru piket hanya untuk sesi DAILY semua kelas, tidak untuk sesi mapel", async () => {
    const daily = (classId: string) =>
      session({ classId, scheduleId: null, type: "DAILY", openedById: w.homeroomA.userId });
    expect(await policy.canOperateSession(w.picket.ctx, daily(w.classA.id))).toBe(true);
    expect(await policy.canOperateSession(w.picket.ctx, daily(w.classB.id))).toBe(true);
    expect(await policy.canOperateSession(w.outsider.ctx, daily(w.classA.id))).toBe(false);
    expect(await policy.canOperateSession(w.picket.ctx, session())).toBe(false);
    // Sebelum jabatan piket mulai berlaku (10 hari lalu): tidak ada akses.
    expect(
      await policy.canOperateSession(w.picket.ctx, {
        ...daily(w.classA.id),
        sessionDate: addDays(w.today, -30),
      }),
    ).toBe(false);
  });

  it("jabatan yang sudah berakhir tidak memberi akses BK/kepala sekolah lagi", async () => {
    await prisma.staffPositionAssignment.updateMany({
      where: { teacherId: w.counselor.teacherId },
      data: { endsOn: D(addDays(w.today, -1)) },
    });
    expect(await policy.canReadStudent(w.counselor.ctx, w.studentB.studentId)).toBe(false);
    expect(await policy.canReadSchoolSettings(w.counselor.ctx)).toBe(false);
    await prisma.staffPositionAssignment.updateMany({
      where: { teacherId: w.counselor.teacherId },
      data: { endsOn: null },
    });
    expect(await policy.canReadStudent(w.counselor.ctx, w.studentB.studentId)).toBe(true);
  });
});

describe("AccessPolicy: filter daftar (scope) tidak membocorkan baris orang lain", () => {
  const idsOf = async (actor: SchoolWorld["admin"]["ctx"]) => {
    const students = await prisma.student.findMany({
      where: { AND: [{ user: { schoolId: w.schoolId } }, await policy.studentScope(actor)] },
      select: { id: true },
    });
    const classes = await prisma.class.findMany({
      where: { AND: [{ academicYearId: w.yearId }, await policy.classScope(actor)] },
      select: { id: true },
    });
    return { students: students.map((s) => s.id).sort(), classes: classes.map((c) => c.id).sort() };
  };

  it("admin melihat semuanya", async () => {
    const r = await idsOf(w.admin.ctx);
    expect(r.students).toEqual([w.studentA.studentId, w.studentB.studentId].sort());
    expect(r.classes.length).toBeGreaterThanOrEqual(2);
  });

  it("wali kelas A hanya siswa dan kelas A", async () => {
    expect(await idsOf(w.homeroomA.ctx)).toEqual({
      students: [w.studentA.studentId],
      classes: [w.classA.id],
    });
  });

  it("guru mapel hanya kelas yang diajar dan tidak melihat daftar siswa", async () => {
    expect(await idsOf(w.subjectTeacherB.ctx)).toEqual({ students: [], classes: [w.classB.id] });
  });

  it("siswa hanya dirinya; orang tua hanya anaknya", async () => {
    expect((await idsOf(w.studentA.ctx)).students).toEqual([w.studentA.studentId]);
    expect((await idsOf(w.parentB.ctx)).students).toEqual([w.studentB.studentId]);
    expect((await idsOf(w.studentA.ctx)).classes).toEqual([]);
  });

  it("guru tanpa kaitan dan guru piket tidak mendapat apa pun", async () => {
    expect(await idsOf(w.outsider.ctx)).toEqual({ students: [], classes: [] });
    expect(await idsOf(w.picket.ctx)).toEqual({ students: [], classes: [] });
  });

  it("BK dan kepala sekolah melihat seluruh sekolah", async () => {
    expect((await idsOf(w.principal.ctx)).students).toHaveLength(2);
    expect((await idsOf(w.counselor.ctx)).classes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("AccessPolicy: admin tidak lintas sekolah", () => {
  it("admin sekolah lain ditolak untuk siswa, kelas, dan sesi di sekolah ini", async () => {
    const foreign = await makeSchoolWorld();
    const admin2 = foreign.admin.ctx;
    expect(await policy.canReadStudent(admin2, w.studentA.studentId)).toBe(false);
    expect(await policy.canManageStudent(admin2, w.studentA.studentId)).toBe(false);
    expect(await policy.canReadClass(admin2, w.classA.id)).toBe(false);
    expect(
      await policy.canOperateSession(admin2, {
        classId: w.classA.id,
        scheduleId: null,
        type: "DAILY",
        sessionDate: w.today,
        openedById: w.homeroomA.userId,
      }),
    ).toBe(false);
    // Tetap penuh untuk sekolahnya sendiri.
    expect(await policy.canManageStudent(admin2, foreign.studentA.studentId)).toBe(true);
  });
});
