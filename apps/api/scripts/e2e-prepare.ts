import { createAdmin } from "./create-admin";
import { resetDatabase } from "./db-reset";
import { requireEnv } from "./lib/env";

/**
 * Menyiapkan hadirin_test untuk tes e2e: kosongkan, migrasi, lalu buat sekolah kosong dengan satu
 * admin. Dijalankan SEBELUM API e2e menyala (tes admin menyiapkan sekolah dari nol).
 */
async function main(): Promise<void> {
  await resetDatabase("test");
  await createAdmin("test", {
    schoolName: "Sekolah Uji E2E",
    email: process.env.ADMIN_EMAIL ?? "admin@hadirin.test",
    password: requireEnv("SEED_ADMIN_PASSWORD"),
    timezone: requireEnv("SCHOOL_TIMEZONE"),
  });
  console.log("hadirin_test siap untuk e2e.");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
