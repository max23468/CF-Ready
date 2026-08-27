import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

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
  path.startsWith("scripts/") ||
  path === "wrangler.json" ||
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

export function parseChangedFiles(output) {
  const fields = output.split("\0");
  const files = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) continue;
    const source = fields[index++];
    if (source) files.push(source);
    if (status.startsWith("R") || status.startsWith("C")) {
      const destination = fields[index++];
      if (destination) files.push(destination);
    }
  }
  return files;
}

export function changedFiles(
  baseSha,
  headSha,
  { cwd = process.cwd(), execute = execFileSync } = {},
) {
  if (!/^[0-9a-f]{40}$/.test(baseSha) || !/^[0-9a-f]{40}$/.test(headSha)) return [];
  const output = execute(
    "git",
    [
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
      "--diff-filter=ACMRD",
      `${baseSha}...${headSha}`,
    ],
    { cwd, encoding: "utf8" },
  );
  return parseChangedFiles(output);
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

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main();
