import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const ALLOWED_ADVISORIES = new Set([1124282]);
const RSC_PATTERN = /unstable_|entry\.rsc/i;

function advisorySources(name, vulnerabilities, seen = new Set()) {
  if (seen.has(name)) return new Set();
  seen.add(name);
  const sources = new Set();
  for (const item of vulnerabilities[name]?.via ?? []) {
    if (typeof item === "string") {
      for (const source of advisorySources(item, vulnerabilities, seen)) sources.add(source);
    } else if (item.source) {
      sources.add(item.source);
    }
  }
  return sources;
}

export function verifySecurityAudit(report, sourceFiles = []) {
  if (
    report.auditReportVersion !== 2 ||
    !report.vulnerabilities ||
    typeof report.metadata?.vulnerabilities?.total !== "number"
  ) {
    throw new Error("Report npm audit non valido.");
  }
  const vulnerabilities = report.vulnerabilities;
  for (const name of Object.keys(vulnerabilities)) {
    const sources = advisorySources(name, vulnerabilities);
    if (!sources.size || [...sources].some((source) => !ALLOWED_ADVISORIES.has(source))) {
      throw new Error(`Advisory npm non consentito: ${name}.`);
    }
  }
  if (
    sourceFiles.some(({ path, content }) => RSC_PATTERN.test(path) || RSC_PATTERN.test(content))
  ) {
    throw new Error("Le API RSC instabili non sono consentite.");
  }
}

function readSources(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) return readSources(child);
    if (!/\.(?:js|mjs|ts|tsx)$/.test(entry.name)) return [];
    return [{ path: child, content: readFileSync(child, "utf8") }];
  });
}

function main() {
  const result = spawnSync("npm", ["audit", "--json"], { encoding: "utf8" });
  if (!result.stdout) throw new Error("npm audit non ha restituito un report JSON.");
  const sources = ["app", "workers"].flatMap(readSources);
  for (const path of ["package.json", "react-router.config.ts", "vite.config.ts"]) {
    sources.push({ path, content: readFileSync(path, "utf8") });
  }
  verifySecurityAudit(JSON.parse(result.stdout), sources);
  console.log("Security audit superato: nessun advisory applicabile al runtime corrente.");
}

if (import.meta.main) main();
