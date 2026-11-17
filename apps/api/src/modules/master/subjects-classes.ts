import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import {
  USER_ROLE,
  classCreateSchema,
  classUpdateSchema,
  idParamSchema,
  pageQuerySchema,
  subjectCreateSchema,
  subjectUpdateSchema,
  type ClassDto,
  type Page,
  type SubjectDto,
} from "@hadirin/shared";
import { CurrentUser, Roles, type AuthContext } from "../../common/auth.decorators";
import { notFound } from "../../common/errors";
import { ZodValidationPipe } from "../../common/zod.pipe";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../infra/prisma.service";
import { AccessPolicy } from "../access-policy/access-policy.service";
import { mapDbError, orderByOf, paged } from "./crud-kit";

// ---------- mapel ----------

@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
  ) {}

  async list(actor: AuthContext, q: z.infer<typeof pageQuerySchema>): Promise<Page<SubjectDto>> {
    const where: Prisma.SubjectWhereInput = {
      schoolId: actor.schoolId,
      ...(q.q ? { OR: [{ name: { contains: q.q } }, { code: { contains: q.q } }] } : {}),
    };
    const orderBy = orderByOf(
      q,
      { name: (d) => ({ name: d }), code: (d) => ({ code: d }) },
      "name",
    );
    const page = await paged(
      q,
      (r) => this.prisma.subject.findMany({ where, orderBy, ...r }),
      () => this.prisma.subject.count({ where }),
    );
    return { ...page, data: page.data.map((s) => ({ id: s.id, code: s.code, name: s.name })) };
  }

  private async own(actor: AuthContext, id: string) {
    const s = await this.prisma.subject.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!s) throw notFound("Mata pelajaran tidak ditemukan.");
    return s;
  }

  async create(
    actor: AuthContext,
    input: z.infer<typeof subjectCreateSchema>,
  ): Promise<SubjectDto> {
    this.policy.assertAdmin(actor);
    try {
      const s = await this.prisma.subject.create({ data: { schoolId: actor.schoolId, ...input } });
      return { id: s.id, code: s.code, name: s.name };
    } catch (e) {
      return mapDbError(e, { duplicate: "Kode mata pelajaran itu sudah dipakai." });
    }
  }

  async update(
    actor: AuthContext,
    id: string,
    input: z.infer<typeof subjectUpdateSchema>,
  ): Promise<SubjectDto> {
    this.policy.assertAdmin(actor);
    await this.own(actor, id);
    try {
      const s = await this.prisma.subject.update({ where: { id }, data: input });
      return { id: s.id, code: s.code, name: s.name };
    } catch (e) {
      return mapDbError(e, { duplicate: "Kode mata pelajaran itu sudah dipakai." });
    }
  }

  async remove(actor: AuthContext, id: string): Promise<void> {
    this.policy.assertAdmin(actor);
    await this.own(actor, id);
    try {
      await this.prisma.subject.delete({ where: { id } });
    } catch (e) {
      mapDbError(e, {
        inUse: "Mata pelajaran ini masih dipakai di jadwal atau sesi, jadi belum bisa dihapus.",
      });
    }
  }
}

@Controller("subjects")
export class SubjectsController {
  constructor(private readonly svc: SubjectsService) {}

  @Roles(USER_ROLE.ADMIN, USER_ROLE.TEACHER)
  @Get()
  list(
    @CurrentUser() a: AuthContext,
    @Query(new ZodValidationPipe(pageQuerySchema)) q: z.infer<typeof pageQuerySchema>,
  ) {
    return this.svc.list(a, q);
  }

  @Roles(USER_ROLE.ADMIN)
  @Post()
  create(
    @CurrentUser() a: AuthContext,
    @Body(new ZodValidationPipe(subjectCreateSchema)) b: z.infer<typeof subjectCreateSchema>,
  ) {
    return this.svc.create(a, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(subjectUpdateSchema)) b: z.infer<typeof subjectUpdateSchema>,
  ) {
    return this.svc.update(a, id, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
  ) {
    return this.svc.remove(a, id);
  }
}

// ---------- kelas ----------

const classListQuery = pageQuerySchema.extend({ academicYearId: z.string().uuid().optional() });

type ClassRow = Prisma.ClassGetPayload<{
  include: {
    homeroomTeacher: { include: { user: { select: { name: true } } } };
    _count: { select: { enrollments: true } };
  };
}>;

const CLASS_INCLUDE = {
  homeroomTeacher: { include: { user: { select: { name: true } } } },
  // Jumlah siswa = pendaftaran yang masih terbuka.
  _count: { select: { enrollments: { where: { endDate: null } } } },
} satisfies Prisma.ClassInclude;

const classDto = (c: ClassRow): ClassDto => ({
  id: c.id,
  academicYearId: c.academicYearId,
  name: c.name,
  grade: c.grade,
  homeroomTeacherId: c.homeroomTeacherId,
  homeroomTeacherName: c.homeroomTeacher?.user.name ?? null,
  studentCount: c._count.enrollments,
  archived: c.deletedAt !== null,
});

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
  ) {}

  async list(actor: AuthContext, q: z.infer<typeof classListQuery>): Promise<Page<ClassDto>> {
    const scope = await this.policy.classScope(actor);
    const where: Prisma.ClassWhereInput = {
      AND: [
        { academicYear: { schoolId: actor.schoolId } },
        scope,
        q.academicYearId ? { academicYearId: q.academicYearId } : {},
        // Admin boleh melihat arsip; peran lain tidak pernah (scope sudah memaksa deletedAt null).
        this.policy.isAdmin(actor) && q.includeArchived ? {} : { deletedAt: null },
        q.q ? { name: { contains: q.q } } : {},
      ],
    };
    const orderBy = orderByOf(
      q,
      { name: (d) => ({ name: d }), grade: (d) => ({ grade: d }) },
      "name",
    );
    const page = await paged(
      q,
      (r) => this.prisma.class.findMany({ where, orderBy, include: CLASS_INCLUDE, ...r }),
      () => this.prisma.class.count({ where }),
    );
    return { ...page, data: page.data.map(classDto) };
  }

  async get(actor: AuthContext, id: string): Promise<ClassDto> {
    const cls = await this.prisma.class.findFirst({
      where: { id, academicYear: { schoolId: actor.schoolId } },
      include: CLASS_INCLUDE,
    });
    if (!cls) throw notFound("Kelas tidak ditemukan.");
    // 403 (bukan 404) untuk kelas yang ada tetapi bukan haknya, sesuai definisi selesai Fase 2.
    await this.policy.assertCanReadClass(actor, id);
    return classDto(cls);
  }

  private async assertRefs(
    actor: AuthContext,
    academicYearId: string | undefined,
    teacherId: string | null | undefined,
  ) {
    if (academicYearId) {
      const y = await this.prisma.academicYear.findFirst({
        where: { id: academicYearId, schoolId: actor.schoolId },
        select: { id: true },
      });
      if (!y) throw notFound("Tahun ajaran tidak ditemukan.");
    }
    if (teacherId) {
      const t = await this.prisma.teacher.findFirst({
        where: { id: teacherId, user: { schoolId: actor.schoolId, deletedAt: null } },
        select: { id: true },
      });
      if (!t) throw notFound("Guru wali kelas tidak ditemukan.");
    }
  }

  async create(actor: AuthContext, input: z.infer<typeof classCreateSchema>): Promise<ClassDto> {
    this.policy.assertAdmin(actor);
    await this.assertRefs(actor, input.academicYearId, input.homeroomTeacherId);
    try {
      const c = await this.prisma.class.create({
        data: {
          academicYearId: input.academicYearId,
          name: input.name,
          grade: input.grade,
          homeroomTeacherId: input.homeroomTeacherId ?? null,
        },
        include: CLASS_INCLUDE,
      });
      return classDto(c);
    } catch (e) {
      return mapDbError(e, { duplicate: "Nama kelas itu sudah ada di tahun ajaran ini." });
    }
  }

  async update(
    actor: AuthContext,
    id: string,
    input: z.infer<typeof classUpdateSchema>,
  ): Promise<ClassDto> {
    this.policy.assertAdmin(actor);
    const current = await this.prisma.class.findFirst({
      where: { id, academicYear: { schoolId: actor.schoolId } },
    });
    if (!current) throw notFound("Kelas tidak ditemukan.");
    await this.assertRefs(actor, undefined, input.homeroomTeacherId);
    try {
      const c = await this.prisma.class.update({
        where: { id },
        data: { name: input.name, grade: input.grade, homeroomTeacherId: input.homeroomTeacherId },
        include: CLASS_INCLUDE,
      });
      return classDto(c);
    } catch (e) {
      return mapDbError(e, { duplicate: "Nama kelas itu sudah ada di tahun ajaran ini." });
    }
  }

  /** Kelas tidak dihapus: diarsipkan (`deleted_at`), riwayat kehadiran tetap utuh. */
  async archive(actor: AuthContext, id: string): Promise<void> {
    this.policy.assertAdmin(actor);
    const current = await this.prisma.class.findFirst({
      where: { id, academicYear: { schoolId: actor.schoolId } },
    });
    if (!current) throw notFound("Kelas tidak ditemukan.");
    await this.prisma.class.update({
      where: { id },
      data: { deletedAt: current.deletedAt ?? new Date() },
    });
  }
}

@Controller("classes")
export class ClassesController {
  constructor(private readonly svc: ClassesService) {}

  @Roles(USER_ROLE.ADMIN, USER_ROLE.TEACHER)
  @Get()
  list(
    @CurrentUser() a: AuthContext,
    @Query(new ZodValidationPipe(classListQuery)) q: z.infer<typeof classListQuery>,
  ) {
    return this.svc.list(a, q);
  }

  @Roles(USER_ROLE.ADMIN, USER_ROLE.TEACHER)
  @Get(":id")
  get(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
  ) {
    return this.svc.get(a, id);
  }

  @Roles(USER_ROLE.ADMIN)
  @Post()
  create(
    @CurrentUser() a: AuthContext,
    @Body(new ZodValidationPipe(classCreateSchema)) b: z.infer<typeof classCreateSchema>,
  ) {
    return this.svc.create(a, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(classUpdateSchema)) b: z.infer<typeof classUpdateSchema>,
  ) {
    return this.svc.update(a, id, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Delete(":id")
  @HttpCode(204)
  archive(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
  ) {
    return this.svc.archive(a, id);
  }
}
