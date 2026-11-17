import fs from "node:fs";
import path from "node:path";

export default async function globalTeardown(): Promise<void> {
  const pidFile = path.resolve(__dirname, ".worker.pid");
  if (!fs.existsSync(pidFile)) return;
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  try {
    process.kill(pid);
  } catch {
    // sudah berhenti
  }
  fs.rmSync(pidFile, { force: true });
}
