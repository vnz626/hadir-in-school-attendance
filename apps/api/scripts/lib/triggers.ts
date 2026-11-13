import fs from "node:fs";
import path from "node:path";
import mariadb from "mariadb";
import type { DbTarget } from "./env";

const SEPARATOR = /^-- @@\s*$/m;

/**
 * Menjalankan prisma/sql/triggers.sql pernyataan demi pernyataan. Tanpa `DELIMITER` milik klien
 * mysql: pernyataan dipisah baris `-- @@`, dan tiap pernyataan dikirim utuh ke server.
 */
export async function applyTriggers(target: DbTarget): Promise<number> {
  const file = path.resolve(__dirname, "../../prisma/sql/triggers.sql");
  const statements = fs
    .readFileSync(file, "utf8")
    .split(SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const conn = await mariadb.createConnection({ ...target, multipleStatements: false });
  try {
    for (const sql of statements) await conn.query(sql);
  } finally {
    await conn.end();
  }
  return statements.length;
}
