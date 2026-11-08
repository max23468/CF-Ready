import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadWorkerConfig } from "./worker-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function applyLocalMigrations(
  persistTo = path.join(root, ".cloudflare/state"),
  { env = process.env } = {},
) {
  const { DB } = (await loadWorkerConfig("dev", root)).env;
  return execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/cf/bin/cf"),
      "d1",
      "migrations",
      "apply",
      DB.id,
      "--local",
      "--dir",
      path.join(root, "migrations"),
      `--persist-to=${persistTo}`,
    ],
    { cwd: root, encoding: "utf8", env: { ...env, CI: "true" } },
  );
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) process.stdout.write(await applyLocalMigrations());
