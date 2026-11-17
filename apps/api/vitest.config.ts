import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // SWC memancarkan metadata dekorator yang dibutuhkan injeksi dependensi NestJS (esbuild tidak).
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup-file.ts"],
    // Satu database uji bersama: berkas tes berjalan berurutan agar tidak saling mengganggu.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
