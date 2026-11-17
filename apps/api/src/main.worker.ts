import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { JobRunner } from "./modules/jobs/job-runner";
import { WorkerModule } from "./worker.module";

const POLL_MS = 2000;

async function bootstrap(): Promise<void> {
  const logger = new Logger("Worker");
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const runner = app.get(JobRunner);
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  logger.log(`Worker ${runner.workerId} siap`);
  // API dan worker hanya berkomunikasi lewat database (Rancangan §9.2): worker polling tabel jobs.
  while (!stopping) {
    const worked = await runner.runOnce();
    if (!worked) await new Promise((r) => setTimeout(r, POLL_MS));
  }
  await app.close();
}

void bootstrap();
