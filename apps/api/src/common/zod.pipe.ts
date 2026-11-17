import { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { validationError } from "./errors";

/** Semua input divalidasi dengan Zod di server (AGENTS.md §4). */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw validationError("Data yang dikirim tidak valid. Periksa isian lalu coba lagi.", {
      issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
}
