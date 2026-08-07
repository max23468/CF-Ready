import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^react$/,
        replacement: path.join(root, "node_modules/react/cjs/react.development.js"),
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: path.join(root, "node_modules/react/cjs/react-jsx-runtime.development.js"),
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: path.join(root, "node_modules/react/cjs/react-jsx-dev-runtime.development.js"),
      },
    ],
  },
  plugins: [
    cloudflareTest(async () => ({
      main: "./tests/worker.ts",
      wrangler: { configPath: "./wrangler.json" },
      miniflare: {
        d1Databases: ["MIGRATION_DB"],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(root, "migrations")),
          TRIAL_LEDGER_HMAC_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(4))),
        },
      },
    })),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/apply-migrations.ts"],
    // Il pool Workers compila gli import dinamici per file: su una cache fredda il limite
    // Vitest predefinito di 5 secondi scadeva prima che iniziasse l'assertion.
    testTimeout: 10_000,
  },
});
