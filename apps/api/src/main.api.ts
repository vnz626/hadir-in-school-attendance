import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  // Hanya loopback: browser selalu lewat Next.js (ADR 004).
  await app.listen(Number(process.env.API_PORT ?? 4000), "127.0.0.1");
}

void bootstrap();
