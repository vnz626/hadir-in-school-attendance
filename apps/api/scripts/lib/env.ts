import { config } from "dotenv";
import path from "node:path";

// .env tunggal di root repo; tidak pernah di-commit (AGENTS.md §4).
export const ROOT_DIR = path.resolve(__dirname, "../../../..");
config({ path: path.join(ROOT_DIR, ".env"), quiet: true });

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v)
    throw new Error(
      `Variabel lingkungan ${name} belum diisi. Salin .env.example ke .env lalu isi.`,
    );
  return v;
}

export interface DbTarget {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const DB_NAME_RE = /^hadirin_[a-z]+$/;

export function dbTarget(which: "dev" | "test" | "shadow"): DbTarget {
  const name =
    which === "dev"
      ? (process.env.DB_NAME ?? "hadirin_dev")
      : which === "test"
        ? (process.env.DB_TEST_NAME ?? "hadirin_test")
        : "hadirin_shadow";
  if (!DB_NAME_RE.test(name)) throw new Error(`Nama database tidak valid: ${name}`);
  return {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_APP_USER ?? "hadirin",
    password: requireEnv("DB_APP_PASSWORD"),
    database: name,
  };
}

export function databaseUrl(t: DbTarget): string {
  return `mysql://${encodeURIComponent(t.user)}:${encodeURIComponent(t.password)}@${t.host}:${t.port}/${t.database}`;
}
