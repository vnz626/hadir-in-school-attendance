import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { API_PORT, STORAGE_DIR, WEB_PORT } from "./playwright.config";

const PID_FILE = path.resolve(__dirname, ".worker.pid");

/** Worker job (kartu masuk) berjalan sebagai proses terpisah, seperti di `pnpm dev`. Mulai setelah API menyiapkan database. */
export default async function globalSetup(): Promise<void> {
  fs.rmSync(STORAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const child = spawn(
    process.execPath,
    [path.resolve(__dirname, "../apps/api/dist/main.worker.js")],
    {
      detached: false,
      stdio: "ignore",
      env: {
        ...process.env,
        DB_NAME: process.env.DB_TEST_NAME ?? "hadirin_test",
        API_PORT: String(API_PORT),
        APP_ORIGIN: `http://localhost:${WEB_PORT}`,
        STORAGE_DIR,
      },
    },
  );
  fs.writeFileSync(PID_FILE, String(child.pid));
  child.unref();
}
