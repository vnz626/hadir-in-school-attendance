import { SetMetadata } from "@nestjs/common";

export const API_DOC = "apiDoc";

export interface ApiDocOptions {
  /** Ringkasan satu baris di OpenAPI. */
  summary?: string;
  /** Nama field berkas bila endpoint menerima multipart/form-data. */
  multipartFile?: string;
  /** Jenis isi respons non-JSON (misalnya application/pdf). */
  produces?: string;
}

/** Anotasi tambahan untuk OpenAPI. Skema masukan diambil otomatis dari ZodValidationPipe. */
export const ApiDoc = (options: ApiDocOptions) => SetMetadata(API_DOC, options);
