import mariadb from "mariadb";
import readline from "node:readline/promises";
import { dbTarget, requireEnv } from "./lib/env";

// Membuat database dan pengguna aplikasi (bukan root) di MariaDB XAMPP. Kata sandi root hanya
// dipakai selama proses ini dan tidak disimpan (Rancangan §9.3).

const GRANTS = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "ALTER",
  "DROP",
  "INDEX",
  "REFERENCES",
  "TRIGGER",
  "CREATE TEMPORARY TABLES",
  "LOCK TABLES",
].join(", ");

async function askRootPassword(): Promise<string> {
  if (process.env.DB_ROOT_PASSWORD !== undefined) return process.env.DB_ROOT_PASSWORD;
  if (!process.stdin.isTTY) return "";
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Kata sandi root MariaDB (kosong bila XAMPP bawaan): ");
  rl.close();
  return answer;
}

async function main(): Promise<void> {
  const app = dbTarget("dev");
  const databases = [app.database, dbTarget("test").database, dbTarget("shadow").database];
  requireEnv("DB_APP_PASSWORD");
  if (app.user.toLowerCase() === "root") throw new Error("DB_APP_USER tidak boleh root.");

  const root = await mariadb.createConnection({
    host: app.host,
    port: app.port,
    user: process.env.DB_ROOT_USER ?? "root",
    password: await askRootPassword(),
  });
  try {
    for (const db of databases) {
      await root.query(
        `CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
    }
    for (const host of ["127.0.0.1", "localhost"]) {
      await root.query("CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?", [
        app.user,
        host,
        app.password,
      ]);
      await root.query("ALTER USER ?@? IDENTIFIED BY ?", [app.user, host, app.password]);
      for (const db of databases) {
        await root.query(`GRANT ${GRANTS} ON \`${db}\`.* TO ?@?`, [app.user, host]);
      }
    }
    await root.query("FLUSH PRIVILEGES");

    const rows = await root.query(
      "SELECT VERSION() AS v, @@sql_mode AS mode, @@global.time_zone AS tz",
    );
    const v = rows[0] as { v: string; mode: string; tz: string };
    console.log(`MariaDB ${v.v}`);
    if (!v.mode.includes("STRICT_TRANS_TABLES")) {
      console.warn(
        "PERINGATAN: sql_mode server belum ketat. Ikuti panduan my.ini di README (aplikasi tetap memaksa mode ketat per sesi).",
      );
    }
    if (v.tz !== "+00:00" && v.tz !== "UTC") {
      console.warn(
        `PERINGATAN: default-time-zone server '${v.tz}', seharusnya '+00:00' (aplikasi memaksa +00:00 per sesi).`,
      );
    }
    console.log(`Selesai: ${databases.join(", ")} dan pengguna '${app.user}' siap.`);
  } finally {
    await root.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
