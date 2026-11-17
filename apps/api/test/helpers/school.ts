import argon2 from "argon2";
import { addDays, calendarDateToDb, schoolDateOf } from "@hadirin/domain";
import type { AuthContext } from "../../src/common/auth.decorators";
import { D, prisma, unique } from "./db";
import { PASSWORDS } from "./app";

export type Ctx = AuthContext;

export interface Person {
  userId: string;
  email: string | null;
  ctx: Ctx;
}

export interface SchoolWorld {
  schoolId: string;
  timezone: string;
  today: string;
  yearId: string;
  termId: string;
  subjectId: string;
  admin: Person;
  /** Wali kelas A. */
  homeroomA: Person & { teacherId: string };
  /** Wali kelas B. */
  homeroomB: Person & { teacherId: string };
  /** Guru mapel yang mengajar di kelas A (tanpa jabatan). */
  subjectTeacherA: Person & { teacherId: string };
  /** Guru mapel yang hanya mengajar di kelas B. */
  subjectTeacherB: Person & { teacherId: string };
  picket: Person & { teacherId: string };
  counselor: Person & { teacherId: string };
  principal: Person & { teacherId: string };
  /** Guru pengganti untuk jadwal kelas A hari ini. */
  substituteA: Person & { teacherId: string };
  /** Guru tanpa kaitan apa pun. */
  outsider: Person & { teacherId: string };
  classA: { id: string };
  classB: { id: string };
  scheduleA: { id: string };
  studentA: Person & { studentId: string; nis: string };
  studentB: Person & { studentId: string; nis: string };
  parentA: Person;
  parentB: Person;
}

const ctxOf = (userId: string, role: Ctx["role"], schoolId: string): Ctx => ({
  userId,
  role,
  schoolId,
  mustChangePassword: false,
});

/**
 * Sekolah uji lengkap untuk menguji AccessPolicy: dua kelas dengan wali kelas berbeda, guru mapel,
 * pengganti, piket, BK, kepala sekolah, siswa, dan orang tua. "Hari ini" mengikuti jam nyata
 * (jam palsu tes dimulai dari sekarang).
 */
export async function makeSchoolWorld(): Promise<SchoolWorld> {
  const timezone = "Asia/Jakarta";
  const today = schoolDateOf(new Date(), timezone);
  const school = await prisma.school.create({ data: { name: `Sekolah ${unique()}`, timezone } });
  const year = await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      name: unique().slice(0, 18),
      startDate: D(addDays(today, -60)),
      endDate: D(addDays(today, 200)),
    },
  });
  const term = await prisma.term.create({
    data: {
      academicYearId: year.id,
      semester: 1,
      startDate: D(addDays(today, -30)),
      endDate: D(addDays(today, 90)),
      isActive: true,
    },
  });
  const subject = await prisma.subject.create({
    data: { schoolId: school.id, code: unique().slice(0, 18), name: "Mapel" },
  });
  const hash = await argon2.hash(PASSWORDS.teacher, { type: argon2.argon2id });

  const person = async (
    role: Ctx["role"],
    name: string,
    opts: { email?: boolean; loginId?: string } = {},
  ): Promise<Person> => {
    const email = opts.email === false ? null : `${name}-${unique()}@uji.test`;
    const user = await prisma.user.create({
      data: {
        schoolId: school.id,
        role,
        name,
        email,
        loginId: opts.loginId ?? null,
        passwordHash: role === "PARENT" ? null : hash,
      },
    });
    return { userId: user.id, email, ctx: ctxOf(user.id, role, school.id) };
  };
  const teacher = async (name: string) => {
    const p = await person("TEACHER", name);
    const t = await prisma.teacher.create({ data: { userId: p.userId } });
    return { ...p, teacherId: t.id };
  };

  const admin = await person("ADMIN", "admin");
  const homeroomA = await teacher("wali-a");
  const homeroomB = await teacher("wali-b");
  const subjectTeacherA = await teacher("mapel-a");
  const subjectTeacherB = await teacher("mapel-b");
  const picket = await teacher("piket");
  const counselor = await teacher("bk");
  const principal = await teacher("kepsek");
  const substituteA = await teacher("pengganti");
  const outsider = await teacher("asing");

  for (const [t, position] of [
    [picket, "PICKET"],
    [counselor, "COUNSELOR"],
    [principal, "PRINCIPAL"],
  ] as const) {
    await prisma.staffPositionAssignment.create({
      data: {
        teacherId: t.teacherId,
        position,
        academicYearId: year.id,
        startsOn: D(addDays(today, -10)),
      },
    });
  }

  const classA = await prisma.class.create({
    data: {
      academicYearId: year.id,
      name: `A-${unique()}`.slice(0, 40),
      grade: 7,
      homeroomTeacherId: homeroomA.teacherId,
    },
  });
  const classB = await prisma.class.create({
    data: {
      academicYearId: year.id,
      name: `B-${unique()}`.slice(0, 40),
      grade: 7,
      homeroomTeacherId: homeroomB.teacherId,
    },
  });
  const scheduleA = await prisma.schedule.create({
    data: {
      termId: term.id,
      classId: classA.id,
      subjectId: subject.id,
      teacherId: subjectTeacherA.teacherId,
      dayOfWeek: 1,
      startTime: 450,
      endTime: 495,
    },
  });
  await prisma.schedule.create({
    data: {
      termId: term.id,
      classId: classB.id,
      subjectId: subject.id,
      teacherId: subjectTeacherB.teacherId,
      dayOfWeek: 1,
      startTime: 450,
      endTime: 495,
    },
  });
  await prisma.scheduleSubstitution.create({
    data: {
      scheduleId: scheduleA.id,
      date: calendarDateToDb(today),
      substituteTeacherId: substituteA.teacherId,
      assignedById: admin.userId,
    },
  });

  const student = async (label: string, classId: string) => {
    const nis = `N${unique()}`.slice(0, 28);
    const p = await person("STUDENT", label, { email: false, loginId: nis });
    const s = await prisma.student.create({ data: { userId: p.userId, nis } });
    await prisma.classEnrollment.create({
      data: {
        studentId: s.id,
        classId,
        academicYearId: year.id,
        startDate: D(addDays(today, -50)),
        openEnrollmentKey: `${s.id}|${year.id}`,
      },
    });
    return { ...p, studentId: s.id, nis };
  };
  const studentA = await student("siswa-a", classA.id);
  const studentB = await student("siswa-b", classB.id);

  const parent = async (child: { studentId: string }, label: string) => {
    const p = await person("PARENT", label, { email: false });
    const row = await prisma.parent.create({
      data: { userId: p.userId, phoneWa: `+62800${Math.floor(Math.random() * 1e7)}` },
    });
    await prisma.studentParent.create({
      data: { studentId: child.studentId, parentId: row.id, relation: "Ibu" },
    });
    return p;
  };
  const parentA = await parent(studentA, "ortu-a");
  const parentB = await parent(studentB, "ortu-b");

  return {
    schoolId: school.id,
    timezone,
    today,
    yearId: year.id,
    termId: term.id,
    subjectId: subject.id,
    admin,
    homeroomA,
    homeroomB,
    subjectTeacherA,
    subjectTeacherB,
    picket,
    counselor,
    principal,
    substituteA,
    outsider,
    classA: { id: classA.id },
    classB: { id: classB.id },
    scheduleA: { id: scheduleA.id },
    studentA,
    studentB,
    parentA,
    parentB,
  };
}
