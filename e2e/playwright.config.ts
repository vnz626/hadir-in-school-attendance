import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Variabel rahasia (kata sandi admin, DB) dibaca dari .env akar dan tidak pernah dicetak.
loadEnv({ path: path.resolve(__dirname, "../.env"), quiet: true });

// Port dan database terpisah dari stack dev (3000/4000, hadirin_dev) agar tes tidak mengganggu pekerjaan harian.
export const WEB_PORT = 3100;
export const API_PORT = 4100;
export const STORAGE_DIR = path.resolve(__dirname, ".storage");

const apiEnv = {
  DB_NAME: process.env.DB_TEST_NAME ?? "hadirin_test",
  API_PORT: String(API_PORT),
  APP_ORIGIN: `http://localhost:${WEB_PORT}`,
  STORAGE_DIR,
  COOKIE_SECURE: "false",
  NODE_ENV: "development",
};

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // Satu database bersama dan satu skenario berurutan: tanpa paralel.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "id-ID",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile\.spec\.ts|tampilan\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 780 } },
      testMatch: /mobile\.spec\.ts/,
    },
    {
      name: "tampilan",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testMatch: /tampilan\.spec\.ts/,
    },
  ],
  webServer: [
    {
      // Kosongkan + migrasi + buat admin, baru nyalakan API (build dibuat oleh `pnpm test:e2e`).
      command: `pnpm --filter @hadirin/api exec tsx scripts/e2e-prepare.ts && node ../apps/api/dist/main.api.js`,
      cwd: __dirname,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
    },
    {
      command: `pnpm --filter @hadirin/web exec next dev -p ${WEB_PORT}`,
      cwd: __dirname,
      url: `http://localhost:${WEB_PORT}/masuk`,
      env: { API_ORIGIN: `http://127.0.0.1:${API_PORT}`, NEXT_TELEMETRY_DISABLED: "1" },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
