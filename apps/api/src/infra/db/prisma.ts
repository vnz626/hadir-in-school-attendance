import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../generated/prisma/client";

export interface DbConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit?: number;
}

// Sesi selalu UTC dan mode ketat, apa pun isi my.ini: MariaDB XAMPP punya zona 'SYSTEM' dan
// sql_mode longgar secara bawaan (Rancangan §9.3, §12.11).
const SESSION_INIT_SQL =
  "SET time_zone = '+00:00', sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'";

export function createPrismaClient(config: DbConnectionConfig): PrismaClient {
  const adapter = new PrismaMariaDb({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: config.connectionLimit ?? 5,
    timezone: "Z",
    initSql: SESSION_INIT_SQL,
  });
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
