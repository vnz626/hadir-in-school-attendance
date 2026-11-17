import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/generated/**",
      "**/next-env.d.ts",
      "**/playwright-report/**",
      "**/test-results/**",
      "e2e/screenshots/**",
      "e2e/.storage/**",
      "storage/**",
      "backups/**",
      "docs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Skrip pengembangan CommonJS (bukan bagian aplikasi).
    files: ["apps/api/scripts/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        process: "readonly",
        __dirname: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  prettier,
  {
    rules: {
      // AGENTS.md §6: `any` hanya dengan komentar alasan.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
