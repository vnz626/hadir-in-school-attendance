import { spawnSync } from "node:child_process";
import path from "node:path";
import { databaseUrl, dbTarget } from "./lib/env";

// Membuat berkas migrasi baru TANPA menerapkannya (--create-only), supaya CHECK bisa ditambahkan
// manual sebelum dijalankan (Rancangan §10.3). Pemakaian: pnpm --filter @hadirin/api db:migrate:new <nama>
const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error(
    "Beri nama migrasi (huruf kecil, angka, garis bawah). Contoh: db:migrate:new tambah_kolom_x",
  );
  process.exit(1);
}

const prismaBin = require.resolve("prisma/build/index.js");
const r = spawnSync(
  process.execPath,
  [prismaBin, "migrate", "dev", "--create-only", "--name", name],
  {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl(dbTarget("dev")),
      SHADOW_DATABASE_URL: databaseUrl(dbTarget("shadow")),
    },
  },
);
process.exit(r.status ?? 1);
