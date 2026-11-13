import { spawnSync } from "node:child_process";
import path from "node:path";
import { databaseUrl, dbTarget } from "./lib/env";
import { applyTriggers } from "./lib/triggers";

/** Migrasi Prisma lalu trigger, pada hadirin_dev atau hadirin_test. */
export async function migrate(which: "dev" | "test"): Promise<void> {
  const target = dbTarget(which);
  const prismaBin = require.resolve("prisma/build/index.js");
  const r = spawnSync(process.execPath, [prismaBin, "migrate", "deploy"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl(target) },
  });
  if (r.status !== 0) throw new Error("prisma migrate deploy gagal");
  const n = await applyTriggers(target);
  console.log(`Trigger diterapkan (${n} pernyataan) pada ${target.database}.`);
}

if (require.main === module) {
  migrate("dev").catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
