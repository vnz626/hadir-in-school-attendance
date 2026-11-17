import { conflict, notFound } from "../../common/errors";
import type { Page, PageQuery } from "@hadirin/shared";

/** Hasil `findMany` + `count` dalam bentuk halaman seragam. */
export async function paged<T>(
  q: PageQuery,
  find: (range: { skip: number; take: number }) => Promise<T[]>,
  count: () => Promise<number>,
): Promise<Page<T>> {
  const [data, total] = await Promise.all([
    find({ skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    count(),
  ]);
  return { data, page: q.page, pageSize: q.pageSize, total };
}

/** `orderBy` dari kunci urut yang diizinkan; kunci asing diabaikan (bukan galat) agar URL lama tetap jalan. */
export function orderByOf(
  q: PageQuery,
  allowed: Record<string, (dir: "asc" | "desc") => object>,
  fallback: string,
): object {
  const pick =
    q.sort !== undefined && Object.hasOwn(allowed, q.sort) ? allowed[q.sort] : allowed[fallback];
  return pick!(q.order);
}

interface PrismaLikeError {
  code?: string;
  meta?: { target?: unknown; field_name?: unknown; constraint?: unknown };
}

/**
 * Menerjemahkan galat Prisma ke galat API yang bisa dipahami pengguna. P2002 = melanggar UNIQUE,
 * P2003 = melanggar kunci asing (data masih dipakai), P2025 = tidak ditemukan.
 */
export function mapDbError(
  e: unknown,
  labels: { duplicate?: string; inUse?: string; notFound?: string } = {},
): never {
  const err = e as PrismaLikeError;
  if (err?.code === "P2002") {
    throw conflict(labels.duplicate ?? "Data dengan nilai yang sama sudah ada.", {
      fields: Array.isArray(err.meta?.target) ? err.meta.target : undefined,
    });
  }
  if (err?.code === "P2003") {
    throw conflict(
      labels.inUse ??
        "Data masih dipakai oleh data lain, jadi belum bisa dihapus. Arsipkan atau lepas dulu keterkaitannya.",
    );
  }
  if (err?.code === "P2025") throw notFound(labels.notFound);
  throw e;
}

export const contains = (value: string | undefined) => (value ? { contains: value } : undefined);
