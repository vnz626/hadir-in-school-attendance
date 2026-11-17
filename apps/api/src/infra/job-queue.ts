import type { Clock } from "@hadirin/domain";
import type { Prisma, PrismaClient } from "../generated/prisma/client";

export interface EnqueueInput {
  queue: string;
  payload: Prisma.InputJsonValue;
  /** Dua job dengan dedupeKey sama tidak pernah dibuat dua kali (UNIQUE di tabel `jobs`). */
  dedupeKey?: string;
  runAt?: Date;
  maxAttempts?: number;
}

export interface JobQueue {
  enqueue(input: EnqueueInput): Promise<{ id: string; created: boolean }>;
}

export interface ClaimedJob {
  id: string;
  queue: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

/** Waktu sewa job. Worker yang mati di tengah job kehilangan sewanya, lalu job diambil worker lain. */
export const JOB_LEASE_MS = 5 * 60_000;

const BACKOFF_BASE_MS = 30_000;

/** Penundaan ulang eksponensial: 30 dtk, 60 dtk, 2 mnt, 4 mnt, ... maksimal 1 jam. */
export function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1), 60 * 60_000);
}

/**
 * Antrean job di tabel `jobs` (Rancangan §12.12). MariaDB 10.4 tidak punya SKIP LOCKED, jadi
 * klaim memakai pembaruan bersyarat: hanya satu pekerja yang berhasil mengubah baris yang sama.
 */
export class DbJobQueue implements JobQueue {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
  ) {}

  async enqueue(input: EnqueueInput): Promise<{ id: string; created: boolean }> {
    try {
      const job = await this.prisma.job.create({
        data: {
          queue: input.queue,
          payload: input.payload,
          dedupeKey: input.dedupeKey ?? null,
          runAt: input.runAt ?? this.clock.now(),
          maxAttempts: input.maxAttempts ?? 5,
        },
      });
      return { id: job.id, created: true };
    } catch (e) {
      if ((e as { code?: string }).code === "P2002" && input.dedupeKey) {
        const existing = await this.prisma.job.findUniqueOrThrow({
          where: { dedupeKey: input.dedupeKey },
        });
        return { id: existing.id, created: false };
      }
      throw e;
    }
  }

  /** Mengambil satu job yang siap dijalankan, atau `null`. Aman dipanggil banyak pekerja sekaligus. */
  async claim(workerId: string, queues: readonly string[]): Promise<ClaimedJob | null> {
    const now = this.clock.now();
    const candidates = await this.prisma.job.findMany({
      where: {
        queue: { in: [...queues] },
        OR: [
          { status: "PENDING", runAt: { lte: now } },
          // Sewa habis: pekerja sebelumnya dianggap mati.
          { status: "RUNNING", lockedUntil: { lt: now } },
        ],
      },
      orderBy: { runAt: "asc" },
      take: 5,
    });
    for (const c of candidates) {
      const claimed = await this.prisma.job.updateMany({
        where: {
          id: c.id,
          attempts: c.attempts,
          OR: [{ status: "PENDING" }, { status: "RUNNING", lockedUntil: { lt: now } }],
        },
        data: {
          status: "RUNNING",
          lockedBy: workerId,
          lockedUntil: new Date(now.getTime() + JOB_LEASE_MS),
          attempts: c.attempts + 1,
        },
      });
      if (claimed.count === 1) {
        return {
          id: c.id,
          queue: c.queue,
          payload: c.payload,
          attempts: c.attempts + 1,
          maxAttempts: c.maxAttempts,
        };
      }
    }
    return null;
  }

  async complete(id: string, workerId: string): Promise<void> {
    await this.prisma.job.updateMany({
      where: { id, lockedBy: workerId, status: "RUNNING" },
      data: {
        status: "DONE",
        finishedAt: this.clock.now(),
        lockedBy: null,
        lockedUntil: null,
        lastError: null,
      },
    });
  }

  async fail(job: ClaimedJob, workerId: string, error: string): Promise<void> {
    const now = this.clock.now();
    const final = job.attempts >= job.maxAttempts;
    await this.prisma.job.updateMany({
      where: { id: job.id, lockedBy: workerId, status: "RUNNING" },
      data: final
        ? {
            status: "FAILED",
            finishedAt: now,
            lockedBy: null,
            lockedUntil: null,
            lastError: error.slice(0, 2000),
          }
        : {
            status: "PENDING",
            runAt: new Date(now.getTime() + backoffMs(job.attempts)),
            lockedBy: null,
            lockedUntil: null,
            lastError: error.slice(0, 2000),
          },
    });
  }
}
