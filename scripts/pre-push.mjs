// Gate locale prima del push: formato, lint e typecheck sui file cambiati rispetto a
// develop, in parallelo e con un budget di 9 secondi. Lo installa `npm install` tramite
// `scripts/install-hooks.mjs`; in CI non serve perché la CI esegue gli stessi controlli.
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const BUDGET_MS = 9_000;

const formatRoots = /^(?:app|benchmarks|config|extensions|scripts|site|workers|tests)\//;
const formatRootFiles = new Set([
  "cloudflare.config.ts",
  "react-router.config.ts",
  "stryker.critical.config.mjs",
  "vite.config.ts",
  "vitest.config.ts",
  "vitest.browser.config.ts",
]);
const formattable = /\.(?:[cm]?[jt]sx?|json|jsonc|css|html|md|ya?ml|toml)$/;
const lintable = /\.(?:[cm]?[jt]sx?)$/;
const typed = /\.(?:[cm]?[jt]sx?|json)$/;

// Le stesse radici di `npm run format`, senza l'HTML generato del sito. Oxlint legge i tipi
// e typegen riscrive `.react-router/types`: i tipi si rigenerano prima, poi formato, lint e
// typecheck girano in parallelo.
export function selectChecks(files) {
  const format = files.filter(
    (file) =>
      formattable.test(file) &&
      (formatRoots.test(file) || formatRootFiles.has(file)) &&
      !(file.startsWith("site/") && file.endsWith(".html")),
  );
  const lint = files.filter((file) => lintable.test(file) && !file.startsWith("docs/"));
  const typecheck = files.some((file) => typed.test(file));
  const prepare = lint.length || typecheck ? [["npm", ["run", "typegen"]]] : [];
  const checks = [];
  if (format.length) checks.push(["npx", ["oxfmt", "--check", ...format]]);
  if (lint.length) checks.push(["npx", ["oxlint", ...lint]]);
  if (typecheck) checks.push(["npx", ["tsc", "--noEmit"]]);
  return { prepare, checks };
}

// `Pubblica` e `verify:change` lasciano una ricevuta per il tree già verificato dal gate
// locale completo (scripts/publish.mjs): quel push non ripete i controlli.
export function verifiedByLocalGate(cwd = process.cwd()) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const tree = git("rev-parse", "HEAD^{tree}");
  const common = path.resolve(cwd, git("rev-parse", "--git-common-dir"));
  return existsSync(path.join(common, "cf-ready-publications", `local-gate-${tree}.json`));
}

// Senza `origin/develop`, per esempio in un clone parziale, confronta l'ultimo commit.
export function changedFiles(cwd = process.cwd()) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  let base;
  try {
    base = git("merge-base", "HEAD", "origin/develop");
  } catch {
    base = git("rev-parse", "HEAD~1");
  }
  return git("diff", "--name-only", "--diff-filter=ACMR", base, "HEAD").split("\n").filter(Boolean);
}

export function run([command, args]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (status) => resolve({ command: `${command} ${args[0]}`, status, output }));
  });
}

export async function main({
  env = process.env,
  files = () => changedFiles(),
  verified = () => verifiedByLocalGate(),
  execute = run,
  now = () => performance.now(),
  log = console.log,
  error = (message) => process.stderr.write(message),
} = {}) {
  if (env.CI) return 0;
  if (verified()) {
    log("pre-push: tree già verificato dal gate locale.");
    return 0;
  }
  const started = now();
  const { prepare, checks } = selectChecks(files());
  const results = [];
  for (const command of prepare) results.push(await execute(command));
  if (results.every((result) => result.status === 0)) {
    results.push(...(await Promise.all(checks.map(execute))));
  }
  const elapsed = Math.round(now() - started);
  let status = 0;
  for (const result of results) {
    if (result.status === 0) continue;
    status = 1;
    error(`\n✗ ${result.command}\n${result.output}`);
  }
  if (elapsed > BUDGET_MS) {
    error(`\n✗ pre-push oltre il budget: ${elapsed} ms su ${BUDGET_MS} ms.\n`);
    status = 1;
  }
  if (status === 0) log(`pre-push verde in ${elapsed} ms.`);
  return status;
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) process.exitCode = await main();
