import { HttpException } from "@nestjs/common";
import { ERROR_CODE, type ErrorCode } from "@hadirin/shared";

/** Galat bisnis dengan kode dari packages/shared. Format respons seragam diatur AllExceptionsFilter. */
export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super({ error: { code, message, details } }, status);
    // Pesan bermakna untuk log dan pelacakan tumpukan; klien menerima badan respons di atas.
    this.message = message;
  }
}

export const unauthenticated = (message = "Sesi berakhir. Masuk lagi untuk melanjutkan.") =>
  new AppError(ERROR_CODE.UNAUTHENTICATED, 401, message);

export const forbidden = (
  message = "Kamu tidak punya akses untuk melakukan ini.",
  details?: Record<string, unknown>,
) => new AppError(ERROR_CODE.FORBIDDEN, 403, message, details);

export const notFound = (message = "Data tidak ditemukan.") =>
  new AppError(ERROR_CODE.NOT_FOUND, 404, message);

export const conflict = (message: string, details?: Record<string, unknown>) =>
  new AppError(ERROR_CODE.CONFLICT, 409, message, details);

export const validationError = (message: string, details?: Record<string, unknown>) =>
  new AppError(ERROR_CODE.VALIDATION_ERROR, 400, message, details);
