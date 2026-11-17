import { Global, Module } from "@nestjs/common";
import path from "node:path";
import { SystemClock } from "@hadirin/domain";
import { APP_CONFIG, loadConfig, type AppConfig } from "../config/env";
import { LocalFileStorage } from "./file-storage";
import { DbJobQueue } from "./job-queue";
import { ConsoleMailer } from "./mailer";
import { PrismaService } from "./prisma.service";
import { MemoryRateLimiter } from "./rate-limiter";
import { CLOCK, FILE_STORAGE, JOB_QUEUE, MAILER, RATE_LIMITER } from "./tokens";

/**
 * Layanan di balik antarmuka. Implementasi lokal dipilih di sini; tes menimpanya
 * (`overrideProvider`) dengan FakeClock, MemoryMailer, dan sebagainya.
 */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    { provide: CLOCK, useFactory: () => new SystemClock() },
    {
      provide: RATE_LIMITER,
      useFactory: (clock: SystemClock) => new MemoryRateLimiter(clock),
      inject: [CLOCK],
    },
    { provide: MAILER, useFactory: () => new ConsoleMailer() },
    PrismaService,
    {
      provide: FILE_STORAGE,
      // Folder storage/ di akar repo, di luar folder yang disajikan Next.js (Rancangan §14.2).
      useFactory: (config: AppConfig) =>
        new LocalFileStorage(config.storageDir ?? path.resolve(__dirname, "../../../../storage")),
      inject: [APP_CONFIG],
    },
    {
      provide: JOB_QUEUE,
      useFactory: (prisma: PrismaService, clock: SystemClock) => new DbJobQueue(prisma, clock),
      inject: [PrismaService, CLOCK],
    },
  ],
  exports: [APP_CONFIG, CLOCK, RATE_LIMITER, MAILER, PrismaService, FILE_STORAGE, JOB_QUEUE],
})
export class InfraModule {}
