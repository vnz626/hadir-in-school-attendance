import { Inject, Injectable, Logger } from "@nestjs/common";
import crypto from "node:crypto";
import type { Clock } from "@hadirin/domain";
import { DbJobQueue } from "../../infra/job-queue";
import { PrismaService } from "../../infra/prisma.service";
import { CLOCK } from "../../infra/tokens";

/**
 * Handler job WAJIB idempoten (AGENTS.md §7): bisa dijalankan dua kali, atau diulang setelah
 * worker mati di tengah dan sewanya habis, tanpa efek ganda.
 */
export interface JobHandler {
  readonly queue: string;
  handle(payload: unknown): Promise<void>;
}

export const JOB_HANDLERS = Symbol("JOB_HANDLERS");

@Injectable()
export class JobRunner {
  private readonly logger = new Logger("JobRunner");
  private readonly queue: DbJobQueue;
  readonly workerId = `worker-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;

  constructor(
    prisma: PrismaService,
    @Inject(CLOCK) clock: Clock,
    @Inject(JOB_HANDLERS) private readonly handlers: readonly JobHandler[],
  ) {
    this.queue = new DbJobQueue(prisma, clock);
  }

  /** Menjalankan satu job bila ada. `true` bila ada job yang diproses (berhasil maupun gagal). */
  async runOnce(): Promise<boolean> {
    const job = await this.queue.claim(
      this.workerId,
      this.handlers.map((h) => h.queue),
    );
    if (!job) return false;
    const handler = this.handlers.find((h) => h.queue === job.queue);
    try {
      if (!handler) throw new Error(`Tidak ada handler untuk antrean ${job.queue}`);
      await handler.handle(job.payload);
      await this.queue.complete(job.id, this.workerId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `Job ${job.id} (${job.queue}) gagal pada percobaan ${job.attempts}: ${message}`,
      );
      await this.queue.fail(job, this.workerId, message);
    }
    return true;
  }

  /** Menghabiskan antrean yang siap jalan (dipakai tes dan worker). */
  async drain(limit = 100): Promise<number> {
    let n = 0;
    while (n < limit && (await this.runOnce())) n++;
    return n;
  }
}
