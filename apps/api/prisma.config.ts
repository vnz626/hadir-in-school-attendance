import path from "node:path";
import { defineConfig } from "prisma/config";
import { config } from "dotenv";

// DATABASE_URL diisi oleh skrip db:* (scripts/lib/env.ts). Bila kosong, pakai hadirin_dev dari .env.
config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

function fallbackUrl(): string {
  const {
    DB_HOST = "127.0.0.1",
    DB_PORT = "3306",
    DB_APP_USER = "hadirin",
    DB_APP_PASSWORD = "",
    DB_NAME = "hadirin_dev",
  } = process.env;
  return `mysql://${encodeURIComponent(DB_APP_USER)}:${encodeURIComponent(DB_APP_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? fallbackUrl(),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
