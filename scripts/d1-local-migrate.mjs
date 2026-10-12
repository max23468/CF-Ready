import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadWorkerConfig } from "./preflight-common.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// `cf d1 migrations apply --local` 1.0.0-beta applica le migrazioni ma non termina: in locale
// resta Wrangler (ADR 0004), con una configurazione generata dal binding `DB` di
// `cloudflare.config.ts` e lo stesso stato locale della Vite plugin.
export async function applyLocalMigrations(
  persistTo = path.join(root, ".cloudflare/state"),
  { env = process.env } = {},
) {
  const { DB } = (await loadWorkerConfig("dev", root)).env;
  const configPath = path.join(root, ".cloudflare/wrangler-local-d1.json");
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    `${JSON.stringify({
      name: "cf-ready-local-d1",
      compatibility_date: "2026-10-02",
      d1_databases: [
        {
          binding: "DB",
          database_name: DB.name,
          database_id: DB.id,
          migrations_dir: path.join(root, "migrations"),
        },
      ],
    })}\n`,
  );
  return execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/wrangler/bin/wrangler.js"),
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--config",
      configPath,
      `--persist-to=${persistTo}`,
    ],
    { cwd: root, encoding: "utf8", env: { ...env, CI: "true", WRANGLER_SEND_METRICS: "false" } },
  );
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) process.stdout.write(await applyLocalMigrations());
