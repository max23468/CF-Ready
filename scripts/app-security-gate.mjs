import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// D-209: la scansione deterministica Shopify gira in CI e blocca solo le occorrenze non già
// verificate come falsi positivi. La review del coding agent resta locale, prima di `Pubblica`.
export const RESULTS_PATH = ".shopify/app-security/shopify.app/deterministic-findings.json";
export const KNOWN_PATH = "docs/evidence/shopify-security/known-deterministic-findings.json";
const BLOCKING = new Set(["high"]);

export function evaluateDeterministicScan(results, known) {
  if (results?.schema_version !== 1 || !Array.isArray(results.checks)) {
    throw new Error("Risultati della scansione Shopify non leggibili.");
  }
  const problems = [];
  const coverage = results.coverage ?? {};
  if (coverage.files_skipped?.length || coverage.gaps?.length) {
    problems.push("La scansione ha saltato file o ha lacune di copertura.");
  }
  const allowed = new Map(
    known.findings.map(({ check, file, count }) => [`${check}\u0000${file}`, count]),
  );
  const seen = new Map();
  for (const check of results.checks) {
    if (!["executed", "not_applicable"].includes(check.status)) {
      problems.push(`${check.id}: stato ${check.status}.`);
      continue;
    }
    if (!BLOCKING.has(check.snapshot?.severity)) continue;
    for (const finding of check.findings ?? []) {
      const key = `${check.id}\u0000${finding.location?.file}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of seen) {
    const limit = allowed.get(key) ?? 0;
    if (count > limit) {
      const [check, file] = key.split("\u0000");
      problems.push(`${check} in ${file}: ${count} occorrenze, ${limit} già verificate.`);
    }
  }
  const stale = [...allowed]
    .filter(([key, count]) => (seen.get(key) ?? 0) < count)
    .map(([key]) => key.replace("\u0000", " in "));
  return { problems, stale };
}

function main() {
  const scan = spawnSync(
    "shopify",
    [
      "app",
      "security",
      "check",
      "--config",
      "shopify.app.toml",
      "--skip-instructions",
      "--no-input",
    ],
    { stdio: "inherit" },
  );
  if (scan.status !== 0) throw new Error("La scansione Shopify non è terminata.");
  const { problems, stale } = evaluateDeterministicScan(
    JSON.parse(readFileSync(RESULTS_PATH, "utf8")),
    JSON.parse(readFileSync(KNOWN_PATH, "utf8")),
  );
  for (const entry of stale) {
    process.stdout.write(`Occorrenza nota non più presente, aggiornare ${KNOWN_PATH}: ${entry}\n`);
  }
  if (problems.length) {
    process.stderr.write(`${problems.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Scansione deterministica Shopify: nessun finding high nuovo.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
