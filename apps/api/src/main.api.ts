import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { loadConfig } from "./config/env";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  // Hanya loopback: browser selalu lewat Next.js (ADR 004).
  await app.listen(config.apiPort, "127.0.0.1");
}

void bootstrap();
