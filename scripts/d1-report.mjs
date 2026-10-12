import { spawnSync } from "node:child_process";

export function parseReportEnvironment(args, usage) {
  const value = args.at(0);
  if (!value || args.length !== 1 || !["development", "production"].includes(value)) {
    throw new Error(usage);
  }
  return value;
}

const databaseIds = {
  development: "9490eaea-3a12-465d-bb48-e2622b31fc4d",
  production: "6434597c-d683-48d9-a51f-b0d15de6a684",
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
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error("La lettura aggregata D1 non è riuscita.");
  }
  return parse(result.stdout);
}
