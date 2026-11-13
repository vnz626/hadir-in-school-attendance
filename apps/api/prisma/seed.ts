import { SystemClock } from "@hadirin/domain";
import { createPrismaClient } from "../src/infra/db/prisma";
import { dbTarget, requireEnv } from "../scripts/lib/env";
import { LOAD_PROFILE, STANDARD_PROFILE, runSeed } from "./seed/run";

// Pemakaian: pnpm db:seed [--load]   (--load = 1.000 siswa untuk uji beban)
async function main(): Promise<void> {
  const profile = process.argv.includes("--load") ? LOAD_PROFILE : STANDARD_PROFILE;
  const target = dbTarget("dev");
  const prisma = createPrismaClient(target);
  try {
    const started = Date.now();
    const result = await runSeed(prisma, {
      ...profile,
      timezone: requireEnv("SCHOOL_TIMEZONE"),
      passwords: {
        admin: requireEnv("SEED_ADMIN_PASSWORD"),
        teacher: requireEnv("SEED_TEACHER_PASSWORD"),
        student: requireEnv("SEED_STUDENT_PASSWORD"),
      },
      clock: new SystemClock(),
    });
    if (result.skipped) {
      console.log(
        "Seed sudah pernah dijalankan pada database ini; tidak ada yang diubah. Pakai `pnpm db:reset` untuk membangun ulang.",
      );
    } else {
      console.log(
        `Seed selesai dalam ${((Date.now() - started) / 1000).toFixed(1)} detik: ${result.students} siswa, ${result.sessions} sesi, ` +
          `${result.attendances} kehadiran, ${result.audits} jejak audit, ${result.dailyStatuses} status harian.`,
      );
    }
    console.log("\nAkun demo (kata sandi ada di .env, tidak dicetak di sini):");
    console.log("  Peran      Login                  Kata sandi dari");
    console.log("  ADMIN      admin@hadirin.test     SEED_ADMIN_PASSWORD");
    console.log("  TEACHER    guru1@hadirin.test     SEED_TEACHER_PASSWORD");
    console.log("  STUDENT    NIS siswa pertama      SEED_STUDENT_PASSWORD");
    console.log("  PARENT     tanpa kata sandi (masuk lewat tautan/OTP, Fase 2)");
    console.log("Akun lain belum punya kata sandi dan diaktifkan lewat alur reset (Fase 2).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
