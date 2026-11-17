import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { z } from "zod";
import { USER_ROLE, idParamSchema } from "@hadirin/shared";
import { CurrentUser, Roles, type AuthContext } from "../../common/auth.decorators";
import { ApiDoc } from "../../common/api-doc";
import { validationError } from "../../common/errors";
import { ZodValidationPipe } from "../../common/zod.pipe";
import { ImportsService } from "./imports.service";
import { MAX_IMPORT_BYTES } from "./spreadsheet";

const kindSchema = z.enum(["STUDENTS", "TEACHERS", "PARENTS"]);
const uploadBodySchema = z.object({ kind: kindSchema });
const commitBodySchema = z.object({ validRowsOnly: z.boolean().default(false) });
const templateQuerySchema = z.object({ format: z.enum(["xlsx", "csv"]).default("xlsx") });

@Controller("imports")
export class ImportsController {
  constructor(private readonly svc: ImportsService) {}

  @ApiDoc({ summary: "Unduh templat impor (xlsx atau csv)", produces: "application/octet-stream" })
  @Roles(USER_ROLE.ADMIN)
  @Get("templates/:kind")
  async template(
    @CurrentUser() a: AuthContext,
    @Param("kind", new ZodValidationPipe(kindSchema)) kind: z.infer<typeof kindSchema>,
    @Query(new ZodValidationPipe(templateQuerySchema)) q: z.infer<typeof templateQuerySchema>,
    @Res() res: Response,
  ): Promise<void> {
    const t = await this.svc.template(a, kind, q.format);
    res.setHeader("Content-Type", t.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${t.filename}"`);
    res.send(t.data);
  }

  @ApiDoc({
    summary: "Unggah berkas impor dan lihat pratinjau (belum membuat data)",
    multipartFile: "file",
  })
  /** Multipart: field `file` (xlsx/csv, maks 2 MB) dan `kind`. Hanya pratinjau; belum ada data yang dibuat. */
  @Roles(USER_ROLE.ADMIN)
  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  upload(
    @CurrentUser() a: AuthContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(uploadBodySchema)) body: z.infer<typeof uploadBodySchema>,
  ) {
    if (!file) throw validationError("Pilih berkas Excel (.xlsx) atau CSV untuk diunggah.");
    return this.svc.preview(a, body.kind, file.buffer);
  }

  @ApiDoc({ summary: "Jalankan impor (opsi: hanya baris valid)" })
  @Roles(USER_ROLE.ADMIN)
  @Post(":id/commit")
  @HttpCode(200)
  commit(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(commitBodySchema)) body: z.infer<typeof commitBodySchema>,
  ) {
    return this.svc.commit(a, id, body.validRowsOnly);
  }

  @Roles(USER_ROLE.ADMIN)
  @Get(":id/report")
  report(
    @CurrentUser() a: AuthContext,
    @Param("id", new ZodValidationPipe(idParamSchema)) id: string,
  ) {
    return this.svc.report(a, id);
  }
}
