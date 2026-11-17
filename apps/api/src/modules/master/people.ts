import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { calendarDateToDb, dbDateToCalendarDate, type Clock } from "@hadirin/domain";
import {
  USER_ROLE,
  idParamSchema,
  pageQuerySchema,
  parentCreateSchema,
  parentUpdateSchema,
  staffPositionCreateSchema,
  staffPositionUpdateSchema,
  studentParentCreateSchema,
  studentParentUpdateSchema,
  teacherCreateSchema,
  teacherUpdateSchema,
  type Page,
  type ParentDto,
  type StaffPositionDto,
  type StudentParentDto,
  type TeacherCreatedDto,
  type TeacherDto,
} from "@hadirin/shared";
import { CurrentUser, Roles, type AuthContext } from "../../common/auth.decorators";
import { notFound, validationError } from "../../common/errors";
import { ZodValidationPipe } from "../../common/zod.pipe";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../infra/prisma.service";
import { CLOCK } from "../../infra/tokens";
import { AccessPolicy } from "../access-policy/access-policy.service";
import { PasswordService } from "../auth/password.service";
import { mapDbError, orderByOf, paged } from "./crud-kit";

// ---------- guru ----------

type TeacherRow = Prisma.TeacherGetPayload<{ include: { user: true } }>;

const teacherDto = (t: TeacherRow): TeacherDto => ({
  id: t.id,
  userId: t.userId,
  name: t.user.name,
  email: t.user.email,
  nip: t.nip,
  isActive: t.user.isActive,
  mustChangePassword: t.user.mustChangePassword,
  archived: t.user.deletedAt !== null,
});

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
    private readonly passwords: PasswordService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(actor: AuthContext, q: z.infer<typeof pageQuerySchema>): Promise<Page<TeacherDto>> {
    this.policy.assertAdmin(actor);
    const where: Prisma.TeacherWhereInput = {
      user: {
        schoolId: actor.schoolId,
        ...(q.includeArchived ? {} : { deletedAt: null }),
        ...(q.q ? { OR: [{ name: { contains: q.q } }, { email: { contains: q.q } }] } : {}),
      },
    };
    const orderBy = orderByOf(
      q,
      { name: (d) => ({ user: { name: d } }), email: (d) => ({ user: { email: d } }) },
      "name",
    );
    const page = await paged(
      q,
      (r) => this.prisma.teacher.findMany({ where, orderBy, include: { user: true }, ...r }),
      () => this.prisma.teacher.count({ where }),
    );
    return { ...page, data: page.data.map(teacherDto) };
  }

  private async own(actor: AuthContext, id: string): Promise<TeacherRow> {
    const t = await this.prisma.teacher.findFirst({
      where: { id, user: { schoolId: actor.schoolId } },
      include: { user: true },
    });
    if (!t) throw notFound("Guru tidak ditemukan.");
    return t;
  }

  async create(
    actor: AuthContext,
    input: z.infer<typeof teacherCreateSchema>,
  ): Promise<TeacherCreatedDto> {
    this.policy.assertAdmin(actor);
    const temporaryPassword = this.passwords.generateTemporary();
    const passwordHash = await this.passwords.hash(temporaryPassword);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            schoolId: actor.schoolId,
            role: USER_ROLE.TEACHER,
            name: input.name,
            email: input.email,
            passwordHash,
            mustChangePassword: true,
          },
        });
        const t = await tx.teacher.create({ data: { userId: user.id, nip: input.nip ?? null } });
        return t.id;
      });
      return { teacher: teacherDto(await this.own(actor, id)), temporaryPassword };
    } catch (e) {
      return mapDbError(e, { duplicate: "Email atau NIP itu sudah terdaftar." });
    }
  }

  async update(
    actor: AuthContext,
    id: string,
    input: z.infer<typeof teacherUpdateSchema>,
  ): Promise<TeacherDto> {
    this.policy.assertAdmin(actor);
    const current = await this.own(actor, id);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.teacher.update({ where: { id }, data: { nip: input.nip } });
        await tx.user.update({
          where: { id: current.userId },
          data: { name: input.name, email: input.email, isActive: input.isActive },
        });
        if (input.isActive === false) {
          await tx.refreshToken.updateMany({
            where: { userId: current.userId, revokedAt: null },
            data: { revokedAt: this.clock.now() },
          });
        }
      });
    } catch (e) {
      return mapDbError(e, { duplicate: "Email atau NIP itu sudah terdaftar." });
    }
    return teacherDto(await this.own(actor, id));
  }

  async archive(actor: AuthContext, id: string): Promise<void> {
    this.policy.assertAdmin(actor);
    const current = await this.own(actor, id);
    const now = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: current.userId },
        data: { deletedAt: current.user.deletedAt ?? now, isActive: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: current.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }
}

@Controller("teachers")
export class TeachersController {
  constructor(private readonly svc: TeachersService) {}

  @Roles(USER_ROLE.ADMIN)
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
    @Body(new ZodValidationPipe(teacherCreateSchema)) b: z.infer<typeof teacherCreateSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader("Cache-Control", "no-store");
    return this.svc.create(a, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(teacherUpdateSchema)) b: z.infer<typeof teacherUpdateSchema>,
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

// ---------- jabatan ----------

const positionListQuery = pageQuerySchema.extend({
  teacherId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
});

type PositionRow = Prisma.StaffPositionAssignmentGetPayload<{
  include: { teacher: { include: { user: { select: { name: true } } } } };
}>;

const positionDto = (p: PositionRow): StaffPositionDto => ({
  id: p.id,
  teacherId: p.teacherId,
  teacherName: p.teacher.user.name,
  position: p.position,
  academicYearId: p.academicYearId,
  startsOn: dbDateToCalendarDate(p.startsOn),
  endsOn: p.endsOn ? dbDateToCalendarDate(p.endsOn) : null,
});

const POSITION_INCLUDE = {
  teacher: { include: { user: { select: { name: true } } } },
} satisfies Prisma.StaffPositionAssignmentInclude;

@Injectable()
export class StaffPositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
  ) {}

  async list(
    actor: AuthContext,
    q: z.infer<typeof positionListQuery>,
  ): Promise<Page<StaffPositionDto>> {
    this.policy.assertAdmin(actor);
    const where: Prisma.StaffPositionAssignmentWhereInput = {
      teacher: { user: { schoolId: actor.schoolId } },
      ...(q.teacherId ? { teacherId: q.teacherId } : {}),
      ...(q.academicYearId ? { academicYearId: q.academicYearId } : {}),
    };
    const page = await paged(
      q,
      (r) =>
        this.prisma.staffPositionAssignment.findMany({
          where,
          orderBy: { startsOn: "desc" },
          include: POSITION_INCLUDE,
          ...r,
        }),
      () => this.prisma.staffPositionAssignment.count({ where }),
    );
    return { ...page, data: page.data.map(positionDto) };
  }

  private async own(actor: AuthContext, id: string) {
    const p = await this.prisma.staffPositionAssignment.findFirst({
      where: { id, teacher: { user: { schoolId: actor.schoolId } } },
      include: POSITION_INCLUDE,
    });
    if (!p) throw notFound("Jabatan tidak ditemukan.");
    return p;
  }

  async create(
    actor: AuthContext,
    input: z.infer<typeof staffPositionCreateSchema>,
  ): Promise<StaffPositionDto> {
    this.policy.assertAdmin(actor);
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: input.teacherId, user: { schoolId: actor.schoolId, deletedAt: null } },
      select: { id: true },
    });
    if (!teacher) throw notFound("Guru tidak ditemukan.");
    const year = await this.prisma.academicYear.findFirst({
      where: { id: input.academicYearId, schoolId: actor.schoolId },
      select: { id: true },
    });
    if (!year) throw notFound("Tahun ajaran tidak ditemukan.");
    const created = await this.prisma.staffPositionAssignment.create({
      data: {
        teacherId: input.teacherId,
        position: input.position,
        academicYearId: input.academicYearId,
        startsOn: calendarDateToDb(input.startsOn),
        endsOn: input.endsOn ? calendarDateToDb(input.endsOn) : null,
      },
      include: POSITION_INCLUDE,
    });
    return positionDto(created);
  }

  async update(
    actor: AuthContext,
    id: string,
    input: z.infer<typeof staffPositionUpdateSchema>,
  ): Promise<StaffPositionDto> {
    this.policy.assertAdmin(actor);
    const current = await this.own(actor, id);
    const starts = input.startsOn ?? dbDateToCalendarDate(current.startsOn);
    const ends =
      input.endsOn === undefined
        ? current.endsOn
          ? dbDateToCalendarDate(current.endsOn)
          : null
        : input.endsOn;
    if (ends && ends < starts)
      throw validationError("Tanggal berakhir tidak boleh sebelum tanggal mulai.");
    const updated = await this.prisma.staffPositionAssignment.update({
      where: { id },
      data: {
        position: input.position,
        startsOn: input.startsOn ? calendarDateToDb(input.startsOn) : undefined,
        endsOn:
          input.endsOn === undefined
            ? undefined
            : input.endsOn === null
              ? null
              : calendarDateToDb(input.endsOn),
      },
      include: POSITION_INCLUDE,
    });
    return positionDto(updated);
  }

  async remove(actor: AuthContext, id: string): Promise<void> {
    this.policy.assertAdmin(actor);
    await this.own(actor, id);
    await this.prisma.staffPositionAssignment.delete({ where: { id } });
  }
}

@Controller("staff-positions")
export class StaffPositionsController {
  constructor(private readonly svc: StaffPositionsService) {}

  @Roles(USER_ROLE.ADMIN)
  @Get()
  list(
    @CurrentUser() a: AuthContext,
    @Query(new ZodValidationPipe(positionListQuery)) q: z.infer<typeof positionListQuery>,
  ) {
    return this.svc.list(a, q);
  }

  @Roles(USER_ROLE.ADMIN)
  @Post()
  create(
    @CurrentUser() a: AuthContext,
    @Body(new ZodValidationPipe(staffPositionCreateSchema))
    b: z.infer<typeof staffPositionCreateSchema>,
  ) {
    return this.svc.create(a, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(staffPositionUpdateSchema))
    b: z.infer<typeof staffPositionUpdateSchema>,
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

// ---------- orang tua ----------

type ParentRow = Prisma.ParentGetPayload<{
  include: { user: { select: { name: true } }; _count: { select: { students: true } } };
}>;

const PARENT_INCLUDE = {
  user: { select: { name: true } },
  _count: { select: { students: true } },
} satisfies Prisma.ParentInclude;

const parentDto = (p: ParentRow): ParentDto => ({
  id: p.id,
  userId: p.userId,
  name: p.user.name,
  phoneWa: p.phoneWa,
  waOptIn: p.waOptIn,
  childCount: p._count.students,
});

@Injectable()
export class ParentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(actor: AuthContext, q: z.infer<typeof pageQuerySchema>): Promise<Page<ParentDto>> {
    // Nomor telepon utuh hanya untuk admin (Rancangan §14.2); peran lain belum punya akses ke daftar ini.
    this.policy.assertAdmin(actor);
    const where: Prisma.ParentWhereInput = {
      user: { schoolId: actor.schoolId, ...(q.includeArchived ? {} : { deletedAt: null }) },
      ...(q.q
        ? { OR: [{ phoneWa: { contains: q.q } }, { user: { name: { contains: q.q } } }] }
        : {}),
    };
    const orderBy = orderByOf(
      q,
      { name: (d) => ({ user: { name: d } }), phoneWa: (d) => ({ phoneWa: d }) },
      "name",
    );
    const page = await paged(
      q,
      (r) => this.prisma.parent.findMany({ where, orderBy, include: PARENT_INCLUDE, ...r }),
      () => this.prisma.parent.count({ where }),
    );
    return { ...page, data: page.data.map(parentDto) };
  }

  private async own(actor: AuthContext, id: string) {
    const p = await this.prisma.parent.findFirst({
      where: { id, user: { schoolId: actor.schoolId } },
      include: PARENT_INCLUDE,
    });
    if (!p) throw notFound("Orang tua tidak ditemukan.");
    return p;
  }

  async create(actor: AuthContext, input: z.infer<typeof parentCreateSchema>): Promise<ParentDto> {
    this.policy.assertAdmin(actor);
    const now = this.clock.now();
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        // Orang tua masuk lewat tautan/OTP: tanpa kata sandi (Rancangan §10.2).
        const user = await tx.user.create({
          data: { schoolId: actor.schoolId, role: USER_ROLE.PARENT, name: input.name },
        });
        const p = await tx.parent.create({
          data: {
            userId: user.id,
            phoneWa: input.phoneWa,
            waOptIn: input.waOptIn,
            waOptInAt: input.waOptIn ? now : null,
            waOptSource: input.waOptIn ? "ADMIN" : null,
          },
        });
        return p.id;
      });
      return parentDto(await this.own(actor, id));
    } catch (e) {
      return mapDbError(e, {
        duplicate: "Nomor WhatsApp itu sudah terdaftar pada orang tua lain.",
      });
    }
  }

  async update(
    actor: AuthContext,
    id: string,
    input: z.infer<typeof parentUpdateSchema>,
  ): Promise<ParentDto> {
    this.policy.assertAdmin(actor);
    const current = await this.own(actor, id);
    const now = this.clock.now();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.parent.update({
          where: { id },
          data: {
            phoneWa: input.phoneWa,
            ...(input.waOptIn === undefined || input.waOptIn === current.waOptIn
              ? {}
              : input.waOptIn
                ? { waOptIn: true, waOptInAt: now, waOptSource: "ADMIN" as const }
                : { waOptIn: false, waOptOutAt: now }),
          },
        });
        if (input.name !== undefined)
          await tx.user.update({ where: { id: current.userId }, data: { name: input.name } });
      });
    } catch (e) {
      return mapDbError(e, {
        duplicate: "Nomor WhatsApp itu sudah terdaftar pada orang tua lain.",
      });
    }
    return parentDto(await this.own(actor, id));
  }

  async archive(actor: AuthContext, id: string): Promise<void> {
    this.policy.assertAdmin(actor);
    const current = await this.own(actor, id);
    const now = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: current.userId },
        data: { deletedAt: now, isActive: false },
      }),
      this.prisma.parent.update({ where: { id }, data: { waOptIn: false, waOptOutAt: now } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: current.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }
}

@Controller("parents")
export class ParentsController {
  constructor(private readonly svc: ParentsService) {}

  @Roles(USER_ROLE.ADMIN)
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
    @Body(new ZodValidationPipe(parentCreateSchema)) b: z.infer<typeof parentCreateSchema>,
  ) {
    return this.svc.create(a, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(parentUpdateSchema)) b: z.infer<typeof parentUpdateSchema>,
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

// ---------- relasi siswa-orang tua ----------

const linkListQuery = pageQuerySchema.extend({
  studentId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
});

type LinkRow = Prisma.StudentParentGetPayload<{
  include: {
    student: { include: { user: { select: { name: true } } } };
    parent: { include: { user: { select: { name: true } } } };
  };
}>;

const LINK_INCLUDE = {
  student: { include: { user: { select: { name: true } } } },
  parent: { include: { user: { select: { name: true } } } },
} satisfies Prisma.StudentParentInclude;

const linkDto = (l: LinkRow): StudentParentDto => ({
  id: l.id,
  studentId: l.studentId,
  studentName: l.student.user.name,
  parentId: l.parentId,
  parentName: l.parent.user.name,
  relation: l.relation,
  isPrimary: l.isPrimary,
  receivesNotifications: l.receivesNotifications,
});

@Injectable()
export class StudentParentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
  ) {}

  async list(
    actor: AuthContext,
    q: z.infer<typeof linkListQuery>,
  ): Promise<Page<StudentParentDto>> {
    this.policy.assertAdmin(actor);
    const where: Prisma.StudentParentWhereInput = {
      student: { user: { schoolId: actor.schoolId } },
      ...(q.studentId ? { studentId: q.studentId } : {}),
      ...(q.parentId ? { parentId: q.parentId } : {}),
    };
    const page = await paged(
      q,
      (r) =>
        this.prisma.studentParent.findMany({
          where,
          orderBy: { createdAt: "desc" },
          include: LINK_INCLUDE,
          ...r,
        }),
      () => this.prisma.studentParent.count({ where }),
    );
    return { ...page, data: page.data.map(linkDto) };
  }

  private async own(actor: AuthContext, id: string) {
    const l = await this.prisma.studentParent.findFirst({
      where: { id, student: { user: { schoolId: actor.schoolId } } },
      include: LINK_INCLUDE,
    });
    if (!l) throw notFound("Relasi tidak ditemukan.");
    return l;
  }

  async create(
    actor: AuthContext,
    input: z.infer<typeof studentParentCreateSchema>,
  ): Promise<StudentParentDto> {
    this.policy.assertAdmin(actor);
    const student = await this.prisma.student.findFirst({
      where: { id: input.studentId, user: { schoolId: actor.schoolId } },
      select: { id: true },
    });
    if (!student) throw notFound("Siswa tidak ditemukan.");
    const parent = await this.prisma.parent.findFirst({
      where: { id: input.parentId, user: { schoolId: actor.schoolId } },
      select: { id: true },
    });
    if (!parent) throw notFound("Orang tua tidak ditemukan.");
    try {
      const l = await this.prisma.studentParent.create({ data: input, include: LINK_INCLUDE });
      return linkDto(l);
    } catch (e) {
      return mapDbError(e, { duplicate: "Orang tua itu sudah tertaut ke siswa ini." });
    }
  }

  async update(
    actor: AuthContext,
    id: string,
    input: z.infer<typeof studentParentUpdateSchema>,
  ): Promise<StudentParentDto> {
    this.policy.assertAdmin(actor);
    await this.own(actor, id);
    return linkDto(
      await this.prisma.studentParent.update({ where: { id }, data: input, include: LINK_INCLUDE }),
    );
  }

  async remove(actor: AuthContext, id: string): Promise<void> {
    this.policy.assertAdmin(actor);
    await this.own(actor, id);
    await this.prisma.studentParent.delete({ where: { id } });
  }
}

@Controller("student-parents")
export class StudentParentsController {
  constructor(private readonly svc: StudentParentsService) {}

  @Roles(USER_ROLE.ADMIN)
  @Get()
  list(
    @CurrentUser() a: AuthContext,
    @Query(new ZodValidationPipe(linkListQuery)) q: z.infer<typeof linkListQuery>,
  ) {
    return this.svc.list(a, q);
  }

  @Roles(USER_ROLE.ADMIN)
  @Post()
  create(
    @CurrentUser() a: AuthContext,
    @Body(new ZodValidationPipe(studentParentCreateSchema))
    b: z.infer<typeof studentParentCreateSchema>,
  ) {
    return this.svc.create(a, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(studentParentUpdateSchema))
    b: z.infer<typeof studentParentUpdateSchema>,
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
