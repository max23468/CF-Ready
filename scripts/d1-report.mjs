import { spawnSync } from "node:child_process";

export function parseReportEnvironment(args, usage) {
  const value = args.at(0);
  if (!value || args.length !== 1 || !["development", "production"].includes(value)) {
    throw new Error(usage);
  }
  return value;
}

export function d1ReportCommand(environment, query) {
  const args = [
    "exec",
    "--",
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--remote",
    "--json",
    "--config",
    "wrangler.json",
    "--command",
    query,
  ];
  if (environment === "production") args.push("--env", "production");
  return args;
}

export function parseWranglerJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("Wrangler non ha restituito JSON valido.");
  }
}

export function fetchD1Report(environment, query, parse, { spawn = spawnSync } = {}) {
  const result = spawn("npm", d1ReportCommand(environment, query), {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error("La lettura aggregata D1 non è riuscita.");
  }
  return parse(result.stdout);
}
