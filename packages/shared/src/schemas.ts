import { z } from "zod";

export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");

/** Jam dinding: menit sejak 00:00 waktu sekolah (Rancangan §10.2). */
export const minuteOfDaySchema = z.number().int().min(0).max(1439);

export const healthResponseSchema = z.object({ status: z.literal("ok") });
