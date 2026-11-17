import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import { calendarDateToDb, dbDateToCalendarDate, schoolDateOf, type Clock } from "@hadirin/domain";
import {
  USER_ROLE,
  type EnrollmentDto,
  type Page,
  type StudentCreatedDto,
  type StudentDto,
  type enrollmentCreateSchema,
  type pageQuerySchema,
  type studentCreateSchema,
  type studentUpdateSchema,
} from "@hadirin/shared";
import type { AuthContext } from "../../common/auth.decorators";
import { conflict, notFound, validationError } from "../../common/errors";
import type { Prisma } from "../../generated/prisma/client";
import { openEnrollmentKey } from "../../infra/db/keys";
import { PrismaService } from "../../infra/prisma.service";
import { CLOCK } from "../../infra/tokens";
import { AccessPolicy } from "../access-policy/access-policy.service";
import { PasswordService } from "../auth/password.service";
import { mapDbError, orderByOf, paged } from "../master/crud-kit";

const STUDENT_INCLUDE = {
  user: { select: { name: true, mustChangePassword: true, schoolId: true } },
  // Kelas saat ini = pendaftaran terbuka.
  enrollments: {
    where: { endDate: null },
    take: 1,
    include: { class: { select: { id: true, name: true } } },
  },
} satisfies Prisma.StudentInclude;

type StudentRow = Prisma.StudentGetPayload<{ include: typeof STUDENT_INCLUDE }>;

const toDto = (s: StudentRow): StudentDto => ({
  id: s.id,
  name: s.user.name,
  nis: s.nis,
  nisn: s.nisn,
  status: s.status,
  classId: s.enrollments[0]?.class.id ?? null,
  className: s.enrollments[0]?.class.name ?? null,
  mustChangePassword: s.user.mustChangePassword,
  archived: s.deletedAt !== null,
});

export type StudentListQuery = z.infer<typeof pageQuerySchema> & {
  classId?: string;
  status?: StudentDto["status"];
};

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
    private readonly passwords: PasswordService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(actor: AuthContext, q: StudentListQuery): Promise<Page<StudentDto>> {
    const scope = await this.policy.studentScope(actor);
    const where: Prisma.StudentWhereInput = {
      AND: [
        { user: { schoolId: actor.schoolId } },
        scope,
        this.policy.isAdmin(actor) && q.includeArchived ? {} : { deletedAt: null },
        q.status ? { status: q.status } : {},
        q.classId ? { enrollments: { some: { classId: q.classId, endDate: null } } } : {},
        q.q ? { OR: [{ nis: { contains: q.q } }, { user: { name: { contains: q.q } } }] } : {},
      ],
    };
    const orderBy = orderByOf(
      q,
      {
        name: (d) => ({ user: { name: d } }),
        nis: (d) => ({ nis: d }),
        status: (d) => ({ status: d }),
      },
      "name",
    );
    const page = await paged(
      q,
      (r) => this.prisma.student.findMany({ where, orderBy, include: STUDENT_INCLUDE, ...r }),
      () => this.prisma.student.count({ where }),
    );
    return { ...page, data: page.data.map(toDto) };
  }

  /** Mengambil siswa di sekolah aktor; 404 bila tidak ada, 403 bila ada tetapi bukan haknya. */
  private async readable(actor: AuthContext, id: string): Promise<StudentRow> {
    const s = await this.prisma.student.findFirst({
      where: { id, user: { schoolId: actor.schoolId } },
      include: STUDENT_INCLUDE,
    });
    if (!s) throw notFound("Siswa tidak ditemukan.");
    await this.policy.assertCanReadStudent(actor, id);
    return s;
  }

  async get(actor: AuthContext, id: string): Promise<StudentDto> {
    return toDto(await this.readable(actor, id));
  }

  private async classInSchool(actor: AuthContext, classId: string) {
    const c = await this.prisma.class.findFirst({
      where: { id: classId, deletedAt: null, academicYear: { schoolId: actor.schoolId } },
    });
    if (!c) throw notFound("Kelas tidak ditemukan.");
    return c;
  }

  private async schoolToday(actor: AuthContext): Promise<string> {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: actor.schoolId } });
    return schoolDateOf(this.clock.now(), school.timezone);
  }

  async create(
    actor: AuthContext,
    input: z.infer<typeof studentCreateSchema>,
  ): Promise<StudentCreatedDto> {
    this.policy.assertAdmin(actor);
    const cls = input.classId ? await this.classInSchool(actor, input.classId) : null;
    const startDate = input.enrollmentStartDate ?? (await this.schoolToday(actor));
    const temporaryPassword = this.passwords.generateTemporary();
    const passwordHash = await this.passwords.hash(temporaryPassword);

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            schoolId: actor.schoolId,
            role: USER_ROLE.STUDENT,
            name: input.name,
            loginId: input.nis,
            passwordHash,
            mustChangePassword: true,
          },
        });
        const student = await tx.student.create({
          data: { userId: user.id, nis: input.nis, nisn: input.nisn ?? null },
        });
        if (cls) {
          await tx.classEnrollment.create({
            data: {
              studentId: student.id,
              classId: cls.id,
              academicYearId: cls.academicYearId,
              startDate: calendarDateToDb(startDate),
              openEnrollmentKey: openEnrollmentKey({
                studentId: student.id,
                academicYearId: cls.academicYearId,
                endDate: null,
              }),
            },
          });
        }
        return student.id;
      });
      return { student: await this.get(actor, id), temporaryPassword };
    } catch (e) {
      return mapDbError(e, { duplicate: "NIS itu sudah terdaftar." });
    }
  }

  async update(
    actor: AuthContext,
    id: string,
    input: z.infer<typeof studentUpdateSchema>,
  ): Promise<StudentDto> {
    this.policy.assertAdmin(actor);
    const current = await this.prisma.student.findFirst({
      where: { id, user: { schoolId: actor.schoolId } },
    });
    if (!current) throw notFound("Siswa tidak ditemukan.");
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.student.update({
          where: { id },
          data: { nis: input.nis, nisn: input.nisn, status: input.status },
        });
        if (input.name !== undefined || input.nis !== undefined) {
          // NIS adalah login siswa: ubah bersama.
          await tx.user.update({
            where: { id: current.userId },
            data: { name: input.name, loginId: input.nis },
          });
        }
      });
    } catch (e) {
      return mapDbError(e, { duplicate: "NIS itu sudah terdaftar." });
    }
    return this.get(actor, id);
  }

  /** Siswa diarsipkan, bukan dihapus: akun dinonaktifkan dan sesi dicabut; riwayat kehadiran tetap. */
  async archive(actor: AuthContext, id: string): Promise<void> {
    this.policy.assertAdmin(actor);
    const current = await this.prisma.student.findFirst({
      where: { id, user: { schoolId: actor.schoolId } },
    });
    if (!current) throw notFound("Siswa tidak ditemukan.");
    const now = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.student.update({ where: { id }, data: { deletedAt: current.deletedAt ?? now } }),
      this.prisma.user.update({
        where: { id: current.userId },
        data: { deletedAt: now, isActive: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: current.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  // ---------- pendaftaran kelas (class_enrollments) ----------

  async enrollments(actor: AuthContext, studentId: string): Promise<EnrollmentDto[]> {
    await this.readable(actor, studentId);
    const rows = await this.prisma.classEnrollment.findMany({
      where: { studentId },
      orderBy: { startDate: "desc" },
      include: { class: { select: { name: true } } },
    });
    return rows.map((e) => ({
      id: e.id,
      classId: e.classId,
      className: e.class.name,
      academicYearId: e.academicYearId,
      startDate: dbDateToCalendarDate(e.startDate),
      endDate: e.endDate ? dbDateToCalendarDate(e.endDate) : null,
      endReason: e.endReason,
    }));
  }

  /**
   * Menempatkan atau memindahkan siswa. Pendaftaran terbuka di tahun ajaran yang sama ditutup
   * sehari sebelum tanggal mulai (riwayat lama utuh; rekap memakai rentang ini, Rancangan §12.8).
   */
  async enroll(
    actor: AuthContext,
    studentId: string,
    input: z.infer<typeof enrollmentCreateSchema>,
  ): Promise<EnrollmentDto[]> {
    this.policy.assertAdmin(actor);
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null, user: { schoolId: actor.schoolId } },
    });
    if (!student) throw notFound("Siswa tidak ditemukan.");
    const cls = await this.classInSchool(actor, input.classId);

    const open = await this.prisma.classEnrollment.findFirst({
      where: { studentId, academicYearId: cls.academicYearId, endDate: null },
    });
    if (open && open.classId === cls.id) throw conflict("Siswa sudah terdaftar di kelas ini.");
    if (open && input.startDate <= dbDateToCalendarDate(open.startDate)) {
      throw validationError("Tanggal pindah harus setelah tanggal masuk di kelas sebelumnya.");
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        if (open) {
          const lastDay = new Date(calendarDateToDb(input.startDate).getTime() - 86_400_000);
          await tx.classEnrollment.update({
            where: { id: open.id },
            data: { endDate: lastDay, endReason: "MOVED_CLASS", openEnrollmentKey: null },
          });
        }
        await tx.classEnrollment.create({
          data: {
            studentId,
            classId: cls.id,
            academicYearId: cls.academicYearId,
            startDate: calendarDateToDb(input.startDate),
            openEnrollmentKey: openEnrollmentKey({
              studentId,
              academicYearId: cls.academicYearId,
              endDate: null,
            }),
          },
        });
      });
    } catch (e) {
      return mapDbError(e, {
        duplicate: "Siswa sudah punya pendaftaran terbuka di tahun ajaran ini.",
      });
    }
    return this.enrollments(actor, studentId);
  }
}
