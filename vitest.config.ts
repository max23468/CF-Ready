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
        d1Databases: [
          "MIGRATION_DB",
          "MIGRATION_CORE_DB",
          "MIGRATION_PRIVACY_DB",
          "MIGRATION_NOTIFICATION_DB",
          "MIGRATION_ENTITLEMENT_DB",
          "MIGRATION_REVISION_DB",
          "MIGRATION_FULL_DB",
          "MIGRATION_CONTRACTS_DB",
          "MIGRATION_LEGACY_TRIALS_DB",
          "MIGRATION_LEGACY_LEDGER_DB",
          "MIGRATION_LEGACY_BILLING_DB",
          "MIGRATION_CURSOR_NEW_DB",
          "MIGRATION_CURSOR_EXISTING_DB",
        ],
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
    coverage: {
      provider: "istanbul",
      include: ["app/**/*.{ts,tsx}", "workers/**/*.ts"],
      exclude: ["app/**/*.d.ts", "app/billing/types.ts", "app/i18n/types.ts"],
    },
    // Ogni file avvia un pool Workers con D1 e compila gli import dinamici. Il parallelismo
    // tra file contende il cold start locale e può consumare il timeout prima delle assertion.
    fileParallelism: false,
    testTimeout: 10_000,
    benchmark: {
      include: ["benchmarks/**/*.bench.ts"],
    },
  },
});
