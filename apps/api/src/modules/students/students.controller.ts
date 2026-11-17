import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  STUDENT_STATUS,
  USER_ROLE,
  enrollmentCreateSchema,
  idParamSchema,
  pageQuerySchema,
  studentCreateSchema,
  studentUpdateSchema,
  type TemporaryPasswordResponse,
} from "@hadirin/shared";
import { CurrentUser, Roles, type AuthContext } from "../../common/auth.decorators";
import { clientIp, userAgentOf } from "../../common/http";
import { ZodValidationPipe } from "../../common/zod.pipe";
import { AuthService } from "../auth/auth.service";
import { StudentsService } from "./students.service";

const listQuery = pageQuerySchema.extend({
  classId: z.string().uuid().optional(),
  status: z.enum(STUDENT_STATUS).optional(),
});

@Controller("students")
export class StudentsController {
  constructor(
    private readonly auth: AuthService,
    private readonly svc: StudentsService,
  ) {}

  // Siswa dan orang tua memakai daftar ini untuk melihat dirinya/anaknya; AccessPolicy.studentScope
  // menyaring di kueri, jadi mereka tidak pernah menerima baris orang lain.
  @Roles(USER_ROLE.ADMIN, USER_ROLE.TEACHER, USER_ROLE.STUDENT, USER_ROLE.PARENT)
  @Get()
  list(
    @CurrentUser() a: AuthContext,
    @Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>,
  ) {
    return this.svc.list(a, q);
  }

  @Roles(USER_ROLE.ADMIN, USER_ROLE.TEACHER, USER_ROLE.STUDENT, USER_ROLE.PARENT)
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
    @Body(new ZodValidationPipe(studentCreateSchema)) b: z.infer<typeof studentCreateSchema>,
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
    @Body(new ZodValidationPipe(studentUpdateSchema)) b: z.infer<typeof studentUpdateSchema>,
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

  @Roles(USER_ROLE.ADMIN, USER_ROLE.TEACHER, USER_ROLE.STUDENT, USER_ROLE.PARENT)
  @Get(":id/enrollments")
  enrollments(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
  ) {
    return this.svc.enrollments(a, id);
  }

  @Roles(USER_ROLE.ADMIN)
  @Post(":id/enrollments")
  enroll(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(enrollmentCreateSchema)) b: z.infer<typeof enrollmentCreateSchema>,
  ) {
    return this.svc.enroll(a, id, b);
  }

  /** Admin atau wali kelas siswa itu. Kata sandi sementara ditampilkan sekali dan tidak disimpan. */
  @Roles(USER_ROLE.ADMIN, USER_ROLE.TEACHER)
  @Post(":id/password-reset")
  @HttpCode(200)
  async resetPassword(
    @CurrentUser() actor: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TemporaryPasswordResponse> {
    res.setHeader("Cache-Control", "no-store");
    const temporaryPassword = await this.auth.resetStudentPassword(actor, id, {
      ip: clientIp(req),
      userAgent: userAgentOf(req),
    });
    return { temporaryPassword };
  }
}
