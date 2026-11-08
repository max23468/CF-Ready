import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadWorkerConfig } from "./worker-config.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

export function parseReportEnvironment(args, usage) {
  const value = args.at(0);
  if (!value || args.length !== 1 || !["development", "production"].includes(value)) {
    throw new Error(usage);
  }
  return value;
}

const databaseIds = {
  development: (await loadWorkerConfig("dev", root)).env.DB.id,
  production: (await loadWorkerConfig("prod", root)).env.DB.id,
};

export function d1ReportCommand(environment, query) {
  return ["exec", "--", "cf", "d1", "query", databaseIds[environment], "--sql", query];
}

export function parseD1Json(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("cf non ha restituito JSON valido.");
  }
}

export function fetchD1Report(environment, query, parse, { spawn = spawnSync } = {}) {
  const result = spawn("npm", d1ReportCommand(environment, query), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error("La lettura aggregata D1 non è riuscita.");
  }
  return parse(result.stdout);
}
