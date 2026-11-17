import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { z } from "zod";

// .env tunggal di root repo (tidak pernah di-commit). Tes mengatur variabel lewat process.env.
loadDotenv({ path: path.resolve(__dirname, "../../../../.env"), quiet: true });

const boolFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const schema = z.object({
  DB_HOST: z.string().default("127.0.0.1"),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_NAME: z.string().default("hadirin_dev"),
  DB_APP_USER: z.string().default("hadirin"),
  DB_APP_PASSWORD: z.string().min(1, "DB_APP_PASSWORD wajib diisi"),
  API_PORT: z.coerce.number().int().default(4000),
  COOKIE_SECURE: boolFromString,
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET minimal 32 karakter"),
  DEVICE_PEPPER: z.string().min(16, "DEVICE_PEPPER minimal 16 karakter"),
  APP_ORIGIN: z.string().default("http://localhost:3000"),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  STORAGE_DIR: z.string().optional(),
  ENABLE_DOCS: z.enum(["true", "false"]).optional(),
});

export interface AppConfig {
  db: { host: string; port: number; database: string; user: string; password: string };
  apiPort: number;
  cookieSecure: boolean;
  jwtAccessSecret: string;
  devicePepper: string;
  /** Daftar asal web yang sah (pemeriksaan Origin dan tautan di email). */
  appOrigins: string[];
  refreshTtlDays: number;
  storageDir: string | undefined;
  enableDocs: boolean;
}

export const APP_CONFIG = Symbol("APP_CONFIG");

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Konfigurasi lingkungan tidak valid: ${detail}`);
  }
  const e = parsed.data;
  return {
    db: {
      host: e.DB_HOST,
      port: e.DB_PORT,
      database: e.DB_NAME,
      user: e.DB_APP_USER,
      password: e.DB_APP_PASSWORD,
    },
    apiPort: e.API_PORT,
    cookieSecure: e.COOKIE_SECURE,
    jwtAccessSecret: e.JWT_ACCESS_SECRET,
    devicePepper: e.DEVICE_PEPPER,
    appOrigins: e.APP_ORIGIN.split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean),
    refreshTtlDays: e.REFRESH_TTL_DAYS,
    storageDir: e.STORAGE_DIR,
    enableDocs: e.ENABLE_DOCS ? e.ENABLE_DOCS === "true" : process.env.NODE_ENV !== "production",
  };
}
