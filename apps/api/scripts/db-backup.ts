import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR, dbTarget } from "./lib/env";

const t = dbTarget("dev");
const xampp = process.env.XAMPP_DIR ?? "C:\\xampp";
const dump = path.join(xampp, "mysql", "bin", "mysqldump.exe");
if (!fs.existsSync(dump)) {
  console.error(`mysqldump tidak ditemukan di ${dump}. Atur XAMPP_DIR di .env.`);
  process.exit(1);
}
const dir = path.join(ROOT_DIR, "backups");
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const out = path.join(dir, `${t.database}-${stamp}.sql`);

// Kata sandi lewat variabel lingkungan, bukan argumen, supaya tidak tampil di daftar proses.
const r = spawnSync(
  dump,
  [
    "-h",
    t.host,
    "-P",
    String(t.port),
    "-u",
    t.user,
    "--single-transaction",
    "--routines",
    "--triggers",
    `--result-file=${out}`,
    t.database,
  ],
  { stdio: "inherit", env: { ...process.env, MYSQL_PWD: t.password } },
);
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Cadangan: ${out}`);
