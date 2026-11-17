import { Inject, Injectable } from "@nestjs/common";
import { calendarDateToDb, schoolDateOf, type Clock } from "@hadirin/domain";
import {
  SESSION_TYPE,
  STAFF_POSITION,
  USER_ROLE,
  type CalendarDate,
  type SessionType,
} from "@hadirin/shared";
import type { AuthContext } from "../../common/auth.decorators";
import { forbidden } from "../../common/errors";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../infra/prisma.service";
import { CLOCK } from "../../infra/tokens";

/** Data minimal sebuah sesi untuk memutuskan siapa boleh mengoperasikannya (Rancangan §14.1). */
export interface SessionRef {
  classId: string;
  scheduleId: string | null;
  type: SessionType;
  sessionDate: CalendarDate;
  openedById: string;
}

interface TeacherContext {
  teacherId: string;
  schoolId: string;
  timezone: string;
}

/**
 * SATU-SATUNYA tempat yang memutuskan kepemilikan data (AGENTS.md §4, Rancangan §14.1).
 * Endpoint tidak boleh menulis pemeriksaan akses sendiri: panggil metode di sini. Daftar (list)
 * memakai `*Scope()` yang mengembalikan filter Prisma, sehingga baris milik orang lain tidak
 * pernah ikut terambil (bukan disaring belakangan).
 *
 *  | Subjek          | Boleh                                                                        |
 *  | Admin           | semua                                                                        |
 *  | Wali kelas      | semua data siswa di kelas perwaliannya (profil, kehadiran, akun)             |
 *  | Guru mapel      | kelas yang ia ajar pada semester berjalan; sesi yang ia buka                 |
 *  | Guru pengganti  | jadwal yang ditugaskan, hanya pada tanggal penugasan                         |
 *  | Guru piket      | sesi DAILY semua kelas pada tanggal ia bertugas                              |
 *  | BK, kepsek      | baca saja seluruh sekolah                                                    |
 *  | Siswa           | dirinya sendiri                                                              |
 *  | Orang tua       | anak yang tertaut di student_parents                                         |
 */
@Injectable()
export class AccessPolicy {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ---------- konteks ----------

  private async teacherContext(actor: AuthContext): Promise<TeacherContext | null> {
    if (actor.role !== USER_ROLE.TEACHER) return null;
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: actor.userId },
      include: { user: { include: { school: true } } },
    });
    if (!teacher) return null;
    return {
      teacherId: teacher.id,
      schoolId: teacher.user.schoolId,
      timezone: teacher.user.school.timezone,
    };
  }

  private today(tc: TeacherContext): CalendarDate {
    return schoolDateOf(this.clock.now(), tc.timezone);
  }

  /** Jabatan yang berlaku pada tanggal itu (tanggal sekolah). */
  private async hasPosition(
    tc: TeacherContext,
    positions: readonly string[],
    date: CalendarDate = this.today(tc),
  ): Promise<boolean> {
    const d = calendarDateToDb(date);
    const found = await this.prisma.staffPositionAssignment.findFirst({
      where: {
        teacherId: tc.teacherId,
        position: { in: positions as never },
        startsOn: { lte: d },
        OR: [{ endsOn: null }, { endsOn: { gte: d } }],
      },
      select: { id: true },
    });
    return found !== null;
  }

  /** BK dan kepala sekolah: baca saja seluruh sekolah. */
  private async isSchoolWideReader(actor: AuthContext): Promise<boolean> {
    const tc = await this.teacherContext(actor);
    if (!tc) return false;
    return this.hasPosition(tc, [STAFF_POSITION.COUNSELOR, STAFF_POSITION.PRINCIPAL]);
  }

  // ---------- admin ----------

  isAdmin(actor: AuthContext): boolean {
    return actor.role === USER_ROLE.ADMIN;
  }

  /** Data master dan pengaturan: hanya admin yang boleh mengubah. */
  assertAdmin(actor: AuthContext): void {
    if (!this.isAdmin(actor)) throw forbidden();
  }

  // ---------- pengaturan sekolah ----------

  async canReadSchoolSettings(actor: AuthContext): Promise<boolean> {
    return this.isAdmin(actor) || (await this.isSchoolWideReader(actor));
  }

  async assertCanReadSchoolSettings(actor: AuthContext): Promise<void> {
    if (!(await this.canReadSchoolSettings(actor))) throw forbidden();
  }

  // ---------- siswa ----------

  /** Kelas siswa saat ini = pendaftaran terbuka. */
  private async currentHomeroomTeacherId(studentId: string): Promise<string | null> {
    const enrollment = await this.prisma.classEnrollment.findFirst({
      where: { studentId, endDate: null, class: { deletedAt: null } },
      select: { class: { select: { homeroomTeacherId: true } } },
    });
    return enrollment?.class.homeroomTeacherId ?? null;
  }

  /** Wali kelas dari kelas siswa saat ini. */
  async isHomeroomOfStudent(actor: AuthContext, studentId: string): Promise<boolean> {
    const tc = await this.teacherContext(actor);
    if (!tc) return false;
    return (await this.currentHomeroomTeacherId(studentId)) === tc.teacherId;
  }

  /** Siswa dan kelas hanya dihitung bila berada di sekolah aktor: admin pun tidak lintas sekolah. */
  private async studentInSchool(actor: AuthContext, studentId: string): Promise<boolean> {
    const s = await this.prisma.student.findFirst({
      where: { id: studentId, user: { schoolId: actor.schoolId } },
      select: { id: true },
    });
    return s !== null;
  }

  private async classInSchool(actor: AuthContext, classId: string): Promise<boolean> {
    const c = await this.prisma.class.findFirst({
      where: { id: classId, academicYear: { schoolId: actor.schoolId } },
      select: { id: true },
    });
    return c !== null;
  }

  async canReadStudent(actor: AuthContext, studentId: string): Promise<boolean> {
    if (this.isAdmin(actor)) return this.studentInSchool(actor, studentId);
    switch (actor.role) {
      case USER_ROLE.STUDENT: {
        const own = await this.prisma.student.findFirst({
          where: { id: studentId, userId: actor.userId },
          select: { id: true },
        });
        return own !== null;
      }
      case USER_ROLE.PARENT: {
        const link = await this.prisma.studentParent.findFirst({
          where: { studentId, parent: { userId: actor.userId } },
          select: { id: true },
        });
        return link !== null;
      }
      case USER_ROLE.TEACHER:
        return (
          (await this.isHomeroomOfStudent(actor, studentId)) ||
          (await this.isSchoolWideReader(actor))
        );
      default:
        return false;
    }
  }

  /** Mengubah data atau akun siswa (termasuk reset kata sandi): admin dan wali kelasnya saja. */
  async canManageStudent(actor: AuthContext, studentId: string): Promise<boolean> {
    if (this.isAdmin(actor)) return this.studentInSchool(actor, studentId);
    return this.isHomeroomOfStudent(actor, studentId);
  }

  async assertCanReadStudent(actor: AuthContext, studentId: string): Promise<void> {
    if (!(await this.canReadStudent(actor, studentId))) throw forbidden();
  }

  async assertCanManageStudent(actor: AuthContext, studentId: string): Promise<void> {
    if (!(await this.canManageStudent(actor, studentId))) throw forbidden();
  }

  /** Filter Prisma untuk daftar siswa yang boleh dibaca. */
  async studentScope(actor: AuthContext): Promise<Prisma.StudentWhereInput> {
    if (this.isAdmin(actor)) return {};
    switch (actor.role) {
      case USER_ROLE.STUDENT:
        return { userId: actor.userId };
      case USER_ROLE.PARENT:
        return { parents: { some: { parent: { userId: actor.userId } } } };
      case USER_ROLE.TEACHER: {
        const tc = await this.teacherContext(actor);
        if (!tc) return { id: { in: [] } };
        if (await this.isSchoolWideReader(actor)) return {};
        return {
          enrollments: {
            some: { endDate: null, class: { homeroomTeacherId: tc.teacherId, deletedAt: null } },
          },
        };
      }
      default:
        return { id: { in: [] } };
    }
  }

  // ---------- kelas ----------

  /** Guru yang mengajar kelas itu pada semester berjalan, atau pengganti hari ini. */
  private async teachesClass(tc: TeacherContext, classId: string): Promise<boolean> {
    const today = this.today(tc);
    const d = calendarDateToDb(today);
    const own = await this.prisma.schedule.findFirst({
      where: {
        classId,
        teacherId: tc.teacherId,
        term: { startDate: { lte: d }, endDate: { gte: d } },
      },
      select: { id: true },
    });
    if (own) return true;
    const substitute = await this.prisma.scheduleSubstitution.findFirst({
      where: { substituteTeacherId: tc.teacherId, date: d, schedule: { classId } },
      select: { id: true },
    });
    return substitute !== null;
  }

  /** Membaca kelas dan rosternya: admin, wali kelas, guru yang mengajar di kelas itu, BK/kepsek. */
  async canReadClass(actor: AuthContext, classId: string): Promise<boolean> {
    if (this.isAdmin(actor)) return this.classInSchool(actor, classId);
    if (actor.role !== USER_ROLE.TEACHER) return false;
    const tc = await this.teacherContext(actor);
    if (!tc) return false;
    const cls = await this.prisma.class.findFirst({
      where: { id: classId, deletedAt: null },
      select: { homeroomTeacherId: true },
    });
    if (!cls) return false;
    if (cls.homeroomTeacherId === tc.teacherId) return true;
    if (await this.isSchoolWideReader(actor)) return true;
    return this.teachesClass(tc, classId);
  }

  /** Mengelola kelas (kartu masuk, akun siswanya): admin sekolah itu atau wali kelasnya. */
  async canManageClass(actor: AuthContext, classId: string): Promise<boolean> {
    if (this.isAdmin(actor)) return this.classInSchool(actor, classId);
    const tc = await this.teacherContext(actor);
    if (!tc) return false;
    const cls = await this.prisma.class.findFirst({
      where: { id: classId, deletedAt: null },
      select: { homeroomTeacherId: true },
    });
    return cls?.homeroomTeacherId === tc.teacherId;
  }

  async assertCanManageClass(actor: AuthContext, classId: string): Promise<void> {
    if (!(await this.canManageClass(actor, classId))) throw forbidden();
  }

  async assertCanReadClass(actor: AuthContext, classId: string): Promise<void> {
    if (!(await this.canReadClass(actor, classId))) throw forbidden();
  }

  async classScope(actor: AuthContext): Promise<Prisma.ClassWhereInput> {
    if (this.isAdmin(actor)) return {};
    if (actor.role !== USER_ROLE.TEACHER) return { id: { in: [] } };
    const tc = await this.teacherContext(actor);
    if (!tc) return { id: { in: [] } };
    // Kelas yang diarsipkan tidak memberi akses, konsisten dengan canReadClass.
    if (await this.isSchoolWideReader(actor)) return { deletedAt: null };
    const d = calendarDateToDb(this.today(tc));
    return {
      deletedAt: null,
      OR: [
        { homeroomTeacherId: tc.teacherId },
        {
          schedules: {
            some: { teacherId: tc.teacherId, term: { startDate: { lte: d }, endDate: { gte: d } } },
          },
        },
        {
          schedules: {
            some: { substitutions: { some: { substituteTeacherId: tc.teacherId, date: d } } },
          },
        },
      ],
    };
  }

  // ---------- sesi (dipakai mulai Fase 3; aturannya sudah ditegakkan sekarang) ----------

  /**
   * Mengoperasikan sesi (melihat roster, menandai, menutup): admin; guru yang membukanya;
   * guru pengganti pada tanggal penugasan; guru piket untuk sesi DAILY pada tanggal ia bertugas;
   * wali kelas untuk sesi di kelasnya.
   */
  async canOperateSession(actor: AuthContext, session: SessionRef): Promise<boolean> {
    if (this.isAdmin(actor)) return this.classInSchool(actor, session.classId);
    if (actor.role !== USER_ROLE.TEACHER) return false;
    if (session.openedById === actor.userId) return true;
    const tc = await this.teacherContext(actor);
    if (!tc) return false;

    const cls = await this.prisma.class.findFirst({
      where: { id: session.classId },
      select: { homeroomTeacherId: true },
    });
    if (cls?.homeroomTeacherId === tc.teacherId) return true;

    if (session.scheduleId) {
      const sub = await this.prisma.scheduleSubstitution.findFirst({
        where: {
          scheduleId: session.scheduleId,
          date: calendarDateToDb(session.sessionDate),
          substituteTeacherId: tc.teacherId,
        },
        select: { id: true },
      });
      if (sub) return true;
    }
    if (session.type === SESSION_TYPE.DAILY) {
      return this.hasPosition(tc, [STAFF_POSITION.PICKET], session.sessionDate);
    }
    return false;
  }

  async assertCanOperateSession(actor: AuthContext, session: SessionRef): Promise<void> {
    if (!(await this.canOperateSession(actor, session))) throw forbidden();
  }
}
