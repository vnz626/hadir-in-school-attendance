import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";
import { ERROR_CODE, type ApiErrorBody, type ErrorCode } from "@hadirin/shared";

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ERROR_CODE.VALIDATION_ERROR,
  401: ERROR_CODE.UNAUTHENTICATED,
  403: ERROR_CODE.FORBIDDEN,
  404: ERROR_CODE.NOT_FOUND,
  409: ERROR_CODE.CONFLICT,
  413: ERROR_CODE.VALIDATION_ERROR,
  429: ERROR_CODE.RATE_LIMITED,
};

const STATUS_TO_MESSAGE: Record<number, string> = {
  400: "Data yang dikirim tidak valid. Periksa isian lalu coba lagi.",
  401: "Sesi berakhir. Masuk lagi untuk melanjutkan.",
  403: "Kamu tidak punya akses untuk melakukan ini.",
  404: "Data tidak ditemukan.",
  409: "Data bentrok dengan data yang sudah ada.",
  413: "Berkas terlalu besar. Maksimal 2 MB.",
  429: "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.",
};

function isErrorBody(x: unknown): x is ApiErrorBody {
  return (
    typeof x === "object" &&
    x !== null &&
    "error" in x &&
    typeof (x as ApiErrorBody).error?.code === "string"
  );
}

/** Semua galat keluar dalam satu format: `{ error: { code, message, details } }`, pesan berbahasa Indonesia. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isErrorBody(body)) {
        res.status(status).json(body);
        return;
      }
      const payload: ApiErrorBody = {
        error: {
          code: STATUS_TO_CODE[status] ?? ERROR_CODE.CONFLICT,
          message: STATUS_TO_MESSAGE[status] ?? "Permintaan tidak bisa diproses.",
        },
      };
      res.status(status).json(payload);
      return;
    }

    // Galat tak terduga: jangan bocorkan detail ke klien.
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    const payload: ApiErrorBody = {
      error: {
        code: ERROR_CODE.INTERNAL_ERROR,
        message: "Terjadi gangguan di server. Coba lagi, dan hubungi admin bila masih gagal.",
      },
    };
    res.status(500).json(payload);
  }
}
