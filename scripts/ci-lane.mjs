import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const operationalDocs = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "SECURITY.md",
  "docs/plans/2026-07-28-CF-Ready-Master-Plan.md",
  "docs/runbooks/operations.md",
  "docs/runbooks/release-readiness-1.0.md",
  "docs/runbooks/security-maintenance.md",
]);

const dependencyFiles = new Set(["package.json", "package-lock.json", ".npmrc"]);

const isContentDocumentation = (path) =>
  !operationalDocs.has(path) &&
  (path === "README.md" ||
    path === "CONTRIBUTING.md" ||
    path === "LICENSE" ||
    path.startsWith("docs/"));

const isSecuritySensitive = (path) =>
  dependencyFiles.has(path) ||
  path.startsWith(".github/") ||
  path.startsWith("migrations/") ||
  path.startsWith("config/") ||
  path === "wrangler.json" ||
  path.startsWith("scripts/security-") ||
  /(?:auth|billing|crypto|privacy|session|webhook)/i.test(path);

export function classifyCiLane(files, { base = "", head = "" } = {}) {
  const normalized = [...new Set(files.filter(Boolean))].sort();
  if (base === "main" && head === "develop") {
    return {
      lane: "promotion",
      dependencyReview: false,
      e2e: false,
      reactDoctor: false,
      files: normalized,
    };
  }
  if (normalized.length === 0) {
    return {
      lane: "full",
      dependencyReview: true,
      e2e: true,
      reactDoctor: true,
      files: normalized,
    };
  }
  if (normalized.every(isContentDocumentation)) {
    return {
      lane: "docs",
      dependencyReview: false,
      e2e: false,
      reactDoctor: false,
      files: normalized,
    };
  }
  const full = normalized.some((path) => operationalDocs.has(path) || isSecuritySensitive(path));
  return {
    lane: full ? "full" : "standard",
    dependencyReview: normalized.some((path) => dependencyFiles.has(path)),
    e2e: true,
    reactDoctor: normalized.some(
      (path) => path.startsWith("app/") || /\.(?:jsx?|tsx?|css)$/.test(path),
    ),
    files: normalized,
  };
}

export function changedFiles(baseSha, headSha, cwd = process.cwd()) {
  if (!/^[0-9a-f]{40}$/.test(baseSha) || !/^[0-9a-f]{40}$/.test(headSha)) return [];
  return execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", `${baseSha}...${headSha}`],
    {
      cwd,
      encoding: "utf8",
    },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main() {
  const baseSha = argument("--base-sha") ?? "";
  const headSha = argument("--head-sha") ?? "";
  const result = classifyCiLane(changedFiles(baseSha, headSha), {
    base: argument("--base-ref") ?? "",
    head: argument("--head-ref") ?? "",
  });
  const outputs = [
    `lane=${result.lane}`,
    `dependency_review=${result.dependencyReview}`,
    `e2e=${result.e2e}`,
    `react_doctor=${result.reactDoctor}`,
  ];
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${outputs.join("\n")}\n`);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) main();
