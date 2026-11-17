import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../config/env";
import { PrismaClient } from "../generated/prisma/client";
import { createMariaDbAdapter } from "./db/prisma";

/** Satu klien Prisma untuk seluruh API. Zona UTC dan mode ketat dipaksa per sesi (ADR 009). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({ adapter: createMariaDbAdapter(config.db) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
