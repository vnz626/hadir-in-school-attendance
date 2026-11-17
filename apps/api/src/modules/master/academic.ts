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
  USER_ROLE,
  academicYearCreateSchema,
  academicYearUpdateSchema,
  idParamSchema,
  pageQuerySchema,
  termCreateSchema,
  termUpdateSchema,
  type AcademicYearDto,
  type Page,
  type TermDto,
} from "@hadirin/shared";
import { CurrentUser, Roles, type AuthContext } from "../../common/auth.decorators";
import { notFound, validationError } from "../../common/errors";
import { ZodValidationPipe } from "../../common/zod.pipe";
import { PrismaService } from "../../infra/prisma.service";
import { AccessPolicy } from "../access-policy/access-policy.service";
import { mapDbError, orderByOf, paged } from "./crud-kit";

const yearRow = (y: {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
}): AcademicYearDto => ({
  id: y.id,
  name: y.name,
  startDate: dbDateToCalendarDate(y.startDate),
  endDate: dbDateToCalendarDate(y.endDate),
  isActive: y.isActive,
});

const termRow = (t: {
  id: string;
  academicYearId: string;
  semester: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
}): TermDto => ({
  id: t.id,
  academicYearId: t.academicYearId,
  semester: t.semester === 2 ? 2 : 1,
  startDate: dbDateToCalendarDate(t.startDate),
  endDate: dbDateToCalendarDate(t.endDate),
  isActive: t.isActive,
});

@Injectable()
export class AcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AccessPolicy,
  ) {}

  // ---------- tahun ajaran ----------

  async listYears(
    actor: AuthContext,
    q: z.infer<typeof pageQuerySchema>,
  ): Promise<Page<AcademicYearDto>> {
    const where = { schoolId: actor.schoolId, ...(q.q ? { name: { contains: q.q } } : {}) };
    const orderBy = orderByOf(
      q,
      { name: (d) => ({ name: d }), startDate: (d) => ({ startDate: d }) },
      "startDate",
    );
    const page = await paged(
      q,
      (r) => this.prisma.academicYear.findMany({ where, orderBy, ...r }),
      () => this.prisma.academicYear.count({ where }),
    );
    return { ...page, data: page.data.map(yearRow) };
  }

  private async yearOf(actor: AuthContext, id: string) {
    const y = await this.prisma.academicYear.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!y) throw notFound("Tahun ajaran tidak ditemukan.");
    return y;
  }

  async createYear(
    actor: AuthContext,
    input: z.infer<typeof academicYearCreateSchema>,
  ): Promise<AcademicYearDto> {
    this.policy.assertAdmin(actor);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // Hanya satu tahun ajaran aktif per sekolah.
        if (input.isActive)
          await tx.academicYear.updateMany({
            where: { schoolId: actor.schoolId },
            data: { isActive: false },
          });
        return tx.academicYear.create({
          data: {
            schoolId: actor.schoolId,
            name: input.name,
            startDate: calendarDateToDb(input.startDate),
            endDate: calendarDateToDb(input.endDate),
            isActive: input.isActive,
          },
        });
      });
      return yearRow(created);
    } catch (e) {
      return mapDbError(e, { duplicate: "Nama tahun ajaran itu sudah dipakai." });
    }
  }

  async updateYear(
    actor: AuthContext,
    id: string,
    input: z.infer<typeof academicYearUpdateSchema>,
  ): Promise<AcademicYearDto> {
    this.policy.assertAdmin(actor);
    const current = await this.yearOf(actor, id);
    const start = input.startDate ?? dbDateToCalendarDate(current.startDate);
    const end = input.endDate ?? dbDateToCalendarDate(current.endDate);
    if (end < start) throw validationError("Tanggal selesai tidak boleh sebelum tanggal mulai.");
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (input.isActive)
          await tx.academicYear.updateMany({
            where: { schoolId: actor.schoolId, id: { not: id } },
            data: { isActive: false },
          });
        return tx.academicYear.update({
          where: { id },
          data: {
            name: input.name,
            startDate: input.startDate ? calendarDateToDb(input.startDate) : undefined,
            endDate: input.endDate ? calendarDateToDb(input.endDate) : undefined,
            isActive: input.isActive,
          },
        });
      });
      return yearRow(updated);
    } catch (e) {
      return mapDbError(e, { duplicate: "Nama tahun ajaran itu sudah dipakai." });
    }
  }

  async removeYear(actor: AuthContext, id: string): Promise<void> {
    this.policy.assertAdmin(actor);
    await this.yearOf(actor, id);
    try {
      await this.prisma.academicYear.delete({ where: { id } });
    } catch (e) {
      mapDbError(e, {
        inUse:
          "Tahun ajaran ini masih punya semester, kelas, atau jabatan, jadi belum bisa dihapus.",
      });
    }
  }

  // ---------- semester ----------

  async listTerms(
    actor: AuthContext,
    q: z.infer<typeof pageQuerySchema> & { academicYearId?: string },
  ): Promise<Page<TermDto>> {
    const where = {
      academicYear: { schoolId: actor.schoolId },
      ...(q.academicYearId ? { academicYearId: q.academicYearId } : {}),
    };
    const orderBy = orderByOf(
      q,
      { startDate: (d) => ({ startDate: d }), semester: (d) => ({ semester: d }) },
      "startDate",
    );
    const page = await paged(
      q,
      (r) => this.prisma.term.findMany({ where, orderBy, ...r }),
      () => this.prisma.term.count({ where }),
    );
    return { ...page, data: page.data.map(termRow) };
  }

  private async termOf(actor: AuthContext, id: string) {
    const t = await this.prisma.term.findFirst({
      where: { id, academicYear: { schoolId: actor.schoolId } },
    });
    if (!t) throw notFound("Semester tidak ditemukan.");
    return t;
  }

  /** Semester harus berada di dalam rentang tahun ajarannya. */
  private assertWithinYear(
    year: { startDate: Date; endDate: Date },
    start: string,
    end: string,
  ): void {
    if (start < dbDateToCalendarDate(year.startDate) || end > dbDateToCalendarDate(year.endDate)) {
      throw validationError("Rentang semester harus berada di dalam tahun ajarannya.");
    }
  }

  async createTerm(actor: AuthContext, input: z.infer<typeof termCreateSchema>): Promise<TermDto> {
    this.policy.assertAdmin(actor);
    const year = await this.yearOf(actor, input.academicYearId);
    this.assertWithinYear(year, input.startDate, input.endDate);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (input.isActive)
          await tx.term.updateMany({
            where: { academicYear: { schoolId: actor.schoolId } },
            data: { isActive: false },
          });
        return tx.term.create({
          data: {
            academicYearId: input.academicYearId,
            semester: input.semester,
            startDate: calendarDateToDb(input.startDate),
            endDate: calendarDateToDb(input.endDate),
            isActive: input.isActive,
          },
        });
      });
      return termRow(created);
    } catch (e) {
      return mapDbError(e, { duplicate: "Semester itu sudah ada di tahun ajaran ini." });
    }
  }

  async updateTerm(
    actor: AuthContext,
    id: string,
    input: z.infer<typeof termUpdateSchema>,
  ): Promise<TermDto> {
    this.policy.assertAdmin(actor);
    const current = await this.termOf(actor, id);
    const year = await this.yearOf(actor, current.academicYearId);
    const start = input.startDate ?? dbDateToCalendarDate(current.startDate);
    const end = input.endDate ?? dbDateToCalendarDate(current.endDate);
    if (end < start) throw validationError("Tanggal selesai tidak boleh sebelum tanggal mulai.");
    this.assertWithinYear(year, start, end);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (input.isActive) {
          await tx.term.updateMany({
            where: { academicYear: { schoolId: actor.schoolId }, id: { not: id } },
            data: { isActive: false },
          });
        }
        return tx.term.update({
          where: { id },
          data: {
            semester: input.semester,
            startDate: input.startDate ? calendarDateToDb(input.startDate) : undefined,
            endDate: input.endDate ? calendarDateToDb(input.endDate) : undefined,
            isActive: input.isActive,
          },
        });
      });
      return termRow(updated);
    } catch (e) {
      return mapDbError(e, { duplicate: "Semester itu sudah ada di tahun ajaran ini." });
    }
  }

  async removeTerm(actor: AuthContext, id: string): Promise<void> {
    this.policy.assertAdmin(actor);
    await this.termOf(actor, id);
    try {
      await this.prisma.term.delete({ where: { id } });
    } catch (e) {
      mapDbError(e, {
        inUse: "Semester ini masih punya jadwal atau sesi, jadi belum bisa dihapus.",
      });
    }
  }
}

const termListQuery = pageQuerySchema.extend({ academicYearId: z.string().uuid().optional() });

@Controller("academic-years")
export class AcademicYearsController {
  constructor(private readonly svc: AcademicService) {}

  @Roles(USER_ROLE.ADMIN, USER_ROLE.TEACHER)
  @Get()
  list(
    @CurrentUser() a: AuthContext,
    @Query(new ZodValidationPipe(pageQuerySchema)) q: z.infer<typeof pageQuerySchema>,
  ) {
    return this.svc.listYears(a, q);
  }

  @Roles(USER_ROLE.ADMIN)
  @Post()
  create(
    @CurrentUser() a: AuthContext,
    @Body(new ZodValidationPipe(academicYearCreateSchema))
    b: z.infer<typeof academicYearCreateSchema>,
  ) {
    return this.svc.createYear(a, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(academicYearUpdateSchema))
    b: z.infer<typeof academicYearUpdateSchema>,
  ) {
    return this.svc.updateYear(a, id, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
  ) {
    return this.svc.removeYear(a, id);
  }
}

@Controller("terms")
export class TermsController {
  constructor(private readonly svc: AcademicService) {}

  @Roles(USER_ROLE.ADMIN, USER_ROLE.TEACHER)
  @Get()
  list(
    @CurrentUser() a: AuthContext,
    @Query(new ZodValidationPipe(termListQuery)) q: z.infer<typeof termListQuery>,
  ) {
    return this.svc.listTerms(a, q);
  }

  @Roles(USER_ROLE.ADMIN)
  @Post()
  create(
    @CurrentUser() a: AuthContext,
    @Body(new ZodValidationPipe(termCreateSchema)) b: z.infer<typeof termCreateSchema>,
  ) {
    return this.svc.createTerm(a, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(termUpdateSchema)) b: z.infer<typeof termUpdateSchema>,
  ) {
    return this.svc.updateTerm(a, id, b);
  }

  @Roles(USER_ROLE.ADMIN)
  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
  ) {
    return this.svc.removeTerm(a, id);
  }
}
