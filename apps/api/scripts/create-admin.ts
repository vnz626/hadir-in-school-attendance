import argon2 from "argon2";
import { createPrismaClient } from "../src/infra/db/prisma";
import { dbTarget, requireEnv } from "./lib/env";

/**
 * Membuat sekolah kosong beserta SATU admin pertama (kata sandi dari .env). Dipakai untuk setup
 * sekolah dari nol dan oleh tes e2e. Menolak berjalan bila sudah ada sekolah, kecuali `--force`.
 *
 * Pemakaian: pnpm db:create-admin [--db dev|test] [--school "Nama Sekolah"] [--force]
 * Variabel: ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SCHOOL_TIMEZONE (lihat .env.example)
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export async function createAdmin(
  which: "dev" | "test",
  opts: { schoolName: string; email: string; password: string; timezone: string; force?: boolean },
): Promise<string> {
  const prisma = createPrismaClient(dbTarget(which));
  try {
    if (!opts.force && (await prisma.school.count()) > 0) {
      throw new Error(
        "Sudah ada sekolah di database ini. Pakai --force bila memang ingin menambah sekolah lain.",
      );
    }
    if (opts.password.length < 8) throw new Error("Kata sandi admin minimal 8 karakter.");
    const school = await prisma.school.create({
      data: { name: opts.schoolName, timezone: opts.timezone },
    });
    await prisma.schoolSetting.create({
      data: { schoolId: school.id, checkinModes: ["QR", "QUICK"], schoolDays: [1, 2, 3, 4, 5] },
    });
    await prisma.user.create({
      data: {
        schoolId: school.id,
        role: "ADMIN",
        name: "Administrator",
        email: opts.email,
        passwordHash: await argon2.hash(opts.password, { type: argon2.argon2id }),
      },
    });
    return school.id;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  const which = arg("db") === "test" ? "test" : "dev";
  createAdmin(which, {
    schoolName: arg("school") ?? "Sekolah Baru",
    email: process.env.ADMIN_EMAIL ?? "admin@hadirin.test",
    password: requireEnv("SEED_ADMIN_PASSWORD"),
    timezone: requireEnv("SCHOOL_TIMEZONE"),
    force: process.argv.includes("--force"),
  })
    .then(() => {
      console.log(`Sekolah kosong dan admin dibuat di hadirin_${which}.`);
      console.log(
        "Masuk dengan email admin dan kata sandi SEED_ADMIN_PASSWORD dari .env, lalu siapkan sekolah lewat menu Data master.",
      );
    })
    .catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
