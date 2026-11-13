import mariadb from "mariadb";
import { dbTarget } from "./lib/env";
import { migrate } from "./db-migrate";

/** Hanya hadirin_dev dan hadirin_test yang boleh dikosongkan (nama dikunci di dbTarget). */
export async function resetDatabase(which: "dev" | "test"): Promise<void> {
  const t = dbTarget(which);
  const conn = await mariadb.createConnection({
    host: t.host,
    port: t.port,
    user: t.user,
    password: t.password,
  });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${t.database}\``);
    await conn.query(
      `CREATE DATABASE \`${t.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await conn.end();
  }
  await migrate(which);
  console.log(`${t.database} dikosongkan dan dimigrasi ulang.`);
}

if (require.main === module) {
  resetDatabase("dev").catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
