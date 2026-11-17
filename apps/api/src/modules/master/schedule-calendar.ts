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
import { calendarDateToDb, dbDateToCalendarDate } from "@hadirin/domain";
import {
  HOLIDAY_SCOPE,
  USER_ROLE,
  calendarDateSchema,
  geofenceCreateSchema,
  geofenceUpdateSchema,
  holidayCreateSchema,
  holidayUpdateSchema,
  idParamSchema,
  pageQuerySchema,
  scheduleCreateSchema,
  scheduleUpdateSchema,
  type GeofenceDto,
  type HolidayDto,
  type Page,
  type ScheduleDto,
} from "@hadirin/shared";
import { CurrentUser, Roles, type AuthContext } from "../../common/auth.decorators";
import { conflict, notFound, validationError } from "../../common/errors";
import { ZodValidationPipe } from "../../common/zod.pipe";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../infra/prisma.service";
import { AccessPolicy } from "../access-policy/access-policy.service";
import { mapDbError, orderByOf, paged } from "./crud-kit";

// ---------- jadwal ----------

const scheduleListQuery = pageQuerySchema.extend({
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  dayOfWeek: z.coerce.number().int().min(1).max(7).optional(),
});

const SCHEDULE_INCLUDE = {
  class: { select: { name: true } },
  subject: { select: { name: true } },
  teacher: { include: { user: { select: { name: true } } } },
} satisfies Prisma.ScheduleInclude;

type ScheduleRow = Prisma.ScheduleGetPayload<{ include: typeof SCHEDULE_INCLUDE }>;

const scheduleDto = (s: ScheduleRow): ScheduleDto => ({
  id: s.id,
  termId: s.termId,
  classId: s.classId,
  className: s.class.name,
  subjectId: s.subjectId,
  subjectName: s.subject.name,
  teacherId: s.teacherId,
  teacherName: s.teacher.user.name,
  dayOfWeek: s.dayOfWeek,
  startTime: s.startTime,
  endTime: s.endTime,
});

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
  ) {}

  async list(actor: AuthContext, q: z.infer<typeof scheduleListQuery>): Promise<Page<ScheduleDto>> {
    this.policy.assertAdmin(actor);
    const where: Prisma.ScheduleWhereInput = {
      term: { academicYear: { schoolId: actor.schoolId } },
      ...(q.termId ? { termId: q.termId } : {}),
      ...(q.classId ? { classId: q.classId } : {}),
      ...(q.teacherId ? { teacherId: q.teacherId } : {}),
      ...(q.dayOfWeek ? { dayOfWeek: q.dayOfWeek } : {}),
    };
    const orderBy = orderByOf(
      q,
      {
        dayOfWeek: (d) => [{ dayOfWeek: d }, { startTime: d }],
        startTime: (d) => ({ startTime: d }),
      },
      "dayOfWeek",
    );
    const page = await paged(
      q,
      (r) =>
        this.prisma.schedule.findMany({
          where,
          orderBy: orderBy as Prisma.ScheduleOrderByWithRelationInput,
          include: SCHEDULE_INCLUDE,
          ...r,
        }),
      () => this.prisma.schedule.count({ where }),
    );
    return { ...page, data: page.data.map(scheduleDto) };
  }

  private async own(actor: AuthContext, id: string) {
    const s = await this.prisma.schedule.findFirst({
      where: { id, term: { academicYear: { schoolId: actor.schoolId } } },
      include: SCHEDULE_INCLUDE,
    });
    if (!s) throw notFound("Jadwal tidak ditemukan.");
    return s;
  }

  /** Guru dan kelas tidak boleh punya dua jadwal yang beririsan pada hari dan semester yang sama. */
  private async assertNoClash(
    s: {
      termId: string;
      classId: string;
      teacherId: string;
      dayOfWeek: number;
      startTime: number;
      endTime: number;
    },
    ignoreId?: string,
  ) {
    const overlap = {
      termId: s.termId,
      dayOfWeek: s.dayOfWeek,
      startTime: { lt: s.endTime },
      endTime: { gt: s.startTime },
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
    };
    const teacherClash = await this.prisma.schedule.findFirst({
      where: { ...overlap, teacherId: s.teacherId },
      select: { id: true },
    });
    if (teacherClash)
      throw conflict("Guru itu sudah punya jadwal lain pada jam yang beririsan.", {
        reason: "TEACHER_CLASH",
        scheduleId: teacherClash.id,
      });
    const classClash = await this.prisma.schedule.findFirst({
      where: { ...overlap, classId: s.classId },
      select: { id: true },
    });
    if (classClash)
      throw conflict("Kelas itu sudah punya jadwal lain pada jam yang beririsan.", {
        reason: "CLASS_CLASH",
        scheduleId: classClash.id,
      });
  }

  private async assertRefs(
    actor: AuthContext,
    r: { termId?: string; classId?: string; subjectId?: string; teacherId?: string },
    termYearId?: string,
  ) {
    if (r.classId) {
      const c = await this.prisma.class.findFirst({
        where: { id: r.classId, deletedAt: null, academicYear: { schoolId: actor.schoolId } },
        select: { academicYearId: true },
      });
      if (!c) throw notFound("Kelas tidak ditemukan.");
      if (termYearId && c.academicYearId !== termYearId) {
        throw validationError("Kelas dan semester harus berasal dari tahun ajaran yang sama.");
      }
    }
    if (r.subjectId) {
      const s = await this.prisma.subject.findFirst({
        where: { id: r.subjectId, schoolId: actor.schoolId },
        select: { id: true },
      });
      if (!s) throw notFound("Mata pelajaran tidak ditemukan.");
    }
    if (r.teacherId) {
      const t = await this.prisma.teacher.findFirst({
        where: {
          id: r.teacherId,
          user: { schoolId: actor.schoolId, deletedAt: null, isActive: true },
        },
        select: { id: true },
      });
      if (!t) throw notFound("Guru tidak ditemukan.");
    }
  }

  async create(
    actor: AuthContext,
    input: z.infer<typeof scheduleCreateSchema>,
  ): Promise<ScheduleDto> {
    this.policy.assertAdmin(actor);
    const term = await this.prisma.term.findFirst({
      where: { id: input.termId, academicYear: { schoolId: actor.schoolId } },
    });
    if (!term) throw notFound("Semester tidak ditemukan.");
    await this.assertRefs(actor, input, term.academicYearId);
    await this.assertNoClash(input);
    const created = await this.prisma.schedule.create({ data: input, include: SCHEDULE_INCLUDE });
    return scheduleDto(created);
  }

  async update(
    actor: AuthContext,
    id: string,
    input: z.infer<typeof scheduleUpdateSchema>,
  ): Promise<ScheduleDto> {
    this.policy.assertAdmin(actor);
    const current = await this.own(actor, id);
    await this.assertRefs(actor, input);
    const merged = {
      termId: current.termId,
      classId: current.classId,
      teacherId: input.teacherId ?? current.teacherId,
      dayOfWeek: input.dayOfWeek ?? current.dayOfWeek,
      startTime: input.startTime ?? current.startTime,
      endTime: input.endTime ?? current.endTime,
    };
    if (merged.endTime <= merged.startTime)
      throw validationError("Jam selesai harus setelah jam mulai.");
    await this.assertNoClash(merged, id);
    return scheduleDto(
      await this.prisma.schedule.update({ where: { id }, data: input, include: SCHEDULE_INCLUDE }),
    );
  }

  async remove(actor: AuthContext, id: string): Promise<void> {
    this.policy.assertAdmin(actor);
    await this.own(actor, id);
    try {
      await this.prisma.schedule.delete({ where: { id } });
    } catch (e) {
      mapDbError(e, {
        inUse:
          "Jadwal ini sudah punya sesi absen atau penugasan pengganti, jadi belum bisa dihapus.",
      });
    }
  }
}

@Controller("schedules")
export class SchedulesController {
  constructor(private readonly svc: SchedulesService) {}

  @Roles(USER_ROLE.ADMIN)
  @Get()
  list(
    @CurrentUser() a: AuthContext,
    @Query(new ZodValidationPipe(scheduleListQuery)) q: z.infer<typeof scheduleListQuery>,
  ) {
    return this.svc.list(a, q);
  }

  @Roles(USER_ROLE.ADMIN)
  @Post()
  create(
    @CurrentUser() a: AuthContext,
    @Body(new ZodValidationPipe(scheduleCreateSchema)) b: z.infer<typeof scheduleCreateSchema>,
  ) {
    return this.svc.create(a, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(scheduleUpdateSchema)) b: z.infer<typeof scheduleUpdateSchema>,
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

// ---------- libur ----------

const holidayListQuery = pageQuerySchema.extend({
  // Hanya libur yang beririsan dengan rentang ini.
  from: calendarDateSchema.optional(),
  to: calendarDateSchema.optional(),
});

type HolidayRow = Prisma.HolidayGetPayload<{ include: { class: { select: { name: true } } } }>;

const holidayDto = (h: HolidayRow): HolidayDto => ({
  id: h.id,
  name: h.name,
  dateFrom: dbDateToCalendarDate(h.dateFrom),
  dateTo: dbDateToCalendarDate(h.dateTo),
  scope: h.scope,
  grade: h.grade,
  classId: h.classId,
  className: h.class?.name ?? null,
});

@Injectable()
export class HolidaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
  ) {}

  async list(actor: AuthContext, q: z.infer<typeof holidayListQuery>): Promise<Page<HolidayDto>> {
    const where: Prisma.HolidayWhereInput = {
      schoolId: actor.schoolId,
      ...(q.from ? { dateTo: { gte: calendarDateToDb(q.from) } } : {}),
      ...(q.to ? { dateFrom: { lte: calendarDateToDb(q.to) } } : {}),
      ...(q.q ? { name: { contains: q.q } } : {}),
    };
    const orderBy = orderByOf(
      q,
      { dateFrom: (d) => ({ dateFrom: d }), name: (d) => ({ name: d }) },
      "dateFrom",
    );
    const page = await paged(
      q,
      (r) =>
        this.prisma.holiday.findMany({
          where,
          orderBy,
          include: { class: { select: { name: true } } },
          ...r,
        }),
      () => this.prisma.holiday.count({ where }),
    );
    return { ...page, data: page.data.map(holidayDto) };
  }

  private async own(actor: AuthContext, id: string) {
    const h = await this.prisma.holiday.findFirst({
      where: { id, schoolId: actor.schoolId },
      include: { class: { select: { name: true } } },
    });
    if (!h) throw notFound("Hari libur tidak ditemukan.");
    return h;
  }

  async create(
    actor: AuthContext,
    input: z.infer<typeof holidayCreateSchema>,
  ): Promise<HolidayDto> {
    this.policy.assertAdmin(actor);
    if (input.scope === HOLIDAY_SCOPE.CLASS && input.classId) {
      const c = await this.prisma.class.findFirst({
        where: { id: input.classId, academicYear: { schoolId: actor.schoolId } },
        select: { id: true },
      });
      if (!c) throw notFound("Kelas tidak ditemukan.");
    }
    const h = await this.prisma.holiday.create({
      data: {
        schoolId: actor.schoolId,
        name: input.name,
        dateFrom: calendarDateToDb(input.dateFrom),
        dateTo: calendarDateToDb(input.dateTo),
        scope: input.scope,
        grade: input.scope === HOLIDAY_SCOPE.GRADE ? (input.grade ?? null) : null,
        classId: input.scope === HOLIDAY_SCOPE.CLASS ? (input.classId ?? null) : null,
      },
      include: { class: { select: { name: true } } },
    });
    return holidayDto(h);
  }

  /** Cakupan (scope) tidak diubah setelah dibuat; ubah nama dan rentang saja. */
  async update(
    actor: AuthContext,
    id: string,
    input: z.infer<typeof holidayUpdateSchema>,
  ): Promise<HolidayDto> {
    this.policy.assertAdmin(actor);
    const current = await this.own(actor, id);
    const from = input.dateFrom ?? dbDateToCalendarDate(current.dateFrom);
    const to = input.dateTo ?? dbDateToCalendarDate(current.dateTo);
    if (to < from) throw validationError("Tanggal selesai tidak boleh sebelum tanggal mulai.");
    const h = await this.prisma.holiday.update({
      where: { id },
      data: {
        name: input.name,
        dateFrom: input.dateFrom ? calendarDateToDb(input.dateFrom) : undefined,
        dateTo: input.dateTo ? calendarDateToDb(input.dateTo) : undefined,
      },
      include: { class: { select: { name: true } } },
    });
    return holidayDto(h);
  }

  async remove(actor: AuthContext, id: string): Promise<void> {
    this.policy.assertAdmin(actor);
    await this.own(actor, id);
    await this.prisma.holiday.delete({ where: { id } });
  }
}

@Controller("holidays")
export class HolidaysController {
  constructor(private readonly svc: HolidaysService) {}

  // Kalender libur boleh dibaca semua guru (jadwal hari ini); hanya admin yang mengubah.
  @Roles(USER_ROLE.ADMIN, USER_ROLE.TEACHER)
  @Get()
  list(
    @CurrentUser() a: AuthContext,
    @Query(new ZodValidationPipe(holidayListQuery)) q: z.infer<typeof holidayListQuery>,
  ) {
    return this.svc.list(a, q);
  }

  @Roles(USER_ROLE.ADMIN)
  @Post()
  create(
    @CurrentUser() a: AuthContext,
    @Body(new ZodValidationPipe(holidayCreateSchema)) b: z.infer<typeof holidayCreateSchema>,
  ) {
    return this.svc.create(a, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(holidayUpdateSchema)) b: z.infer<typeof holidayUpdateSchema>,
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

// ---------- geofence ----------

type GeofenceRow = Prisma.GeofenceGetPayload<object>;

const geofenceDto = (g: GeofenceRow): GeofenceDto => ({
  id: g.id,
  name: g.name,
  lat: Number(g.lat),
  lng: Number(g.lng),
  radiusM: g.radiusM,
  isActive: g.isActive,
});

@Injectable()
export class GeofencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
  ) {}

  async list(actor: AuthContext, q: z.infer<typeof pageQuerySchema>): Promise<Page<GeofenceDto>> {
    this.policy.assertAdmin(actor);
    const where: Prisma.GeofenceWhereInput = {
      schoolId: actor.schoolId,
      ...(q.q ? { name: { contains: q.q } } : {}),
    };
    const orderBy = orderByOf(
      q,
      { name: (d) => ({ name: d }), radiusM: (d) => ({ radiusM: d }) },
      "name",
    );
    const page = await paged(
      q,
      (r) => this.prisma.geofence.findMany({ where, orderBy, ...r }),
      () => this.prisma.geofence.count({ where }),
    );
    return { ...page, data: page.data.map(geofenceDto) };
  }

  private async own(actor: AuthContext, id: string) {
    const g = await this.prisma.geofence.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!g) throw notFound("Titik lokasi tidak ditemukan.");
    return g;
  }

  async create(
    actor: AuthContext,
    input: z.infer<typeof geofenceCreateSchema>,
  ): Promise<GeofenceDto> {
    this.policy.assertAdmin(actor);
    const g = await this.prisma.geofence.create({
      data: {
        schoolId: actor.schoolId,
        name: input.name,
        lat: input.lat.toFixed(7),
        lng: input.lng.toFixed(7),
        radiusM: input.radiusM,
        isActive: input.isActive,
      },
    });
    return geofenceDto(g);
  }

  async update(
    actor: AuthContext,
    id: string,
    input: z.infer<typeof geofenceUpdateSchema>,
  ): Promise<GeofenceDto> {
    this.policy.assertAdmin(actor);
    await this.own(actor, id);
    const g = await this.prisma.geofence.update({
      where: { id },
      data: {
        name: input.name,
        lat: input.lat === undefined ? undefined : input.lat.toFixed(7),
        lng: input.lng === undefined ? undefined : input.lng.toFixed(7),
        radiusM: input.radiusM,
        isActive: input.isActive,
      },
    });
    return geofenceDto(g);
  }

  /** Titik yang sudah dipakai kehadiran tidak bisa dihapus (RESTRICT); nonaktifkan saja lewat `isActive`. */
  async remove(actor: AuthContext, id: string): Promise<void> {
    this.policy.assertAdmin(actor);
    await this.own(actor, id);
    try {
      await this.prisma.geofence.delete({ where: { id } });
    } catch (e) {
      mapDbError(e, {
        inUse: "Titik lokasi ini sudah dipakai data kehadiran. Nonaktifkan saja, jangan hapus.",
      });
    }
  }
}

@Controller("geofences")
export class GeofencesController {
  constructor(private readonly svc: GeofencesService) {}

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
    @Body(new ZodValidationPipe(geofenceCreateSchema)) b: z.infer<typeof geofenceCreateSchema>,
  ) {
    return this.svc.create(a, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(geofenceUpdateSchema)) b: z.infer<typeof geofenceUpdateSchema>,
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
