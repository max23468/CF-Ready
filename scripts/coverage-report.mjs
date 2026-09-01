import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import coverageLibrary from "istanbul-lib-coverage";
import reportLibrary from "istanbul-lib-report";
import reports from "istanbul-reports";
import {
  classifyCoverageSources,
  COVERAGE_GROUPS,
  normalizeCoveragePath,
  trackedCoverageSources,
} from "./coverage-scope.mjs";

const { createCoverageMap } = coverageLibrary;
const { createContext } = reportLibrary;
const METRICS = ["statements", "branches", "functions", "lines"];
const root = resolve(import.meta.dirname, "..");

export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function mergeCoverageFiles(files) {
  const map = createCoverageMap({});
  for (const file of files) map.merge(readJson(file));
  return map;
}

function relativeFile(repositoryRoot, file) {
  const path = normalizeCoveragePath(relative(repositoryRoot, file));
  if (path === ".." || path.startsWith("../")) {
    throw new Error(`Coverage fuori repository: ${file}`);
  }
  return path;
}

export function indexCoverageMap(map, repositoryRoot) {
  return new Map(map.files().map((file) => [relativeFile(repositoryRoot, file), file]));
}

export function selectCoverageMap(map, files, repositoryRoot) {
  const selected = createCoverageMap({});
  const index = indexCoverageMap(map, repositoryRoot);
  for (const file of files) {
    const coveragePath = index.get(normalizeCoveragePath(file));
    if (!coveragePath) throw new Error(`Sorgente senza coverage: ${file}`);
    selected.addFileCoverage(map.fileCoverageFor(coveragePath));
  }
  return selected;
}

export function coverageSummary(map) {
  const raw = map.getCoverageSummary().toJSON();
  return Object.fromEntries(
    METRICS.map((metric) => [
      metric,
      {
        total: raw[metric].total,
        covered: raw[metric].covered,
        pct: raw[metric].pct,
      },
    ]),
  );
}

export function coverageState({ globalMap, functionMap, sources, policy, repositoryRoot }) {
  const groups = classifyCoverageSources(sources, policy);
  const globalIndex = indexCoverageMap(globalMap, repositoryRoot);
  const missing = sources.filter((file) => !globalIndex.has(file));
  const unexpected = [...globalIndex.keys()].filter((file) => !sources.includes(file));
  if (missing.length || unexpected.length) {
    const details = [
      ...missing.map((file) => `manca ${file}`),
      ...unexpected.map((file) => `fuori scope ${file}`),
    ];
    throw new Error(`Inventario coverage non canonico: ${details.join(", ")}`);
  }

  const functionFiles = policy.functionBundle.map(normalizeCoveragePath);
  const domainMaps = Object.fromEntries(
    Object.entries(policy.targets.criticalDomains.domains ?? {}).map(([domain, target]) => [
      domain,
      selectCoverageMap(globalMap, target.files.map(normalizeCoveragePath), repositoryRoot),
    ]),
  );
  const groupMaps = Object.fromEntries(
    COVERAGE_GROUPS.map((group) => [
      group,
      group === "function"
        ? selectCoverageMap(functionMap, functionFiles, repositoryRoot)
        : selectCoverageMap(globalMap, groups[group], repositoryRoot),
    ]),
  );
  const sourceHash = createHash("sha256")
    .update(`${sources.join("\n")}\n`)
    .digest("hex");

  return {
    schemaVersion: policy.schemaVersion,
    sourceCount: sources.length,
    sourceHash,
    global: coverageSummary(globalMap),
    groups: Object.fromEntries(
      COVERAGE_GROUPS.map((group) => [group, coverageSummary(groupMaps[group])]),
    ),
    domains: Object.fromEntries(
      Object.entries(domainMaps).map(([domain, map]) => [domain, coverageSummary(map)]),
    ),
    functionFiles: Object.fromEntries(
      functionFiles.map((file) => [
        file,
        coverageSummary(selectCoverageMap(functionMap, [file], repositoryRoot)),
      ]),
    ),
  };
}

function metricFailures(actual, minimum, label) {
  return METRICS.filter((metric) => actual[metric].pct < minimum).map(
    (metric) => `${label}.${metric}: ${actual[metric].pct}% < ${minimum}%`,
  );
}

export function targetFailures(state, policy) {
  const failures = [];
  if (policy.targets.global.active) {
    failures.push(...metricFailures(state.global, policy.targets.global.minimum, "global"));
  }
  for (const [group, target] of Object.entries(policy.targets.groups)) {
    if (!target.active) continue;
    failures.push(...metricFailures(state.groups[group], target.minimum, group));
    if (target.perFile) {
      for (const [file, summary] of Object.entries(state.functionFiles)) {
        failures.push(...metricFailures(summary, target.minimum, file));
      }
    }
  }
  if (policy.targets.criticalDomains.active) {
    for (const [domain, target] of Object.entries(policy.targets.criticalDomains.domains ?? {})) {
      if (target.coverageActive === false) continue;
      failures.push(
        ...metricFailures(
          state.domains[domain],
          target.minimum ?? policy.targets.criticalDomains.minimum,
          `domain.${domain}`,
        ),
      );
    }
  }
  return failures;
}

export function baselineFailures(current, committed, previous) {
  const failures = [];
  if (JSON.stringify(current) !== JSON.stringify(committed)) {
    failures.push("La baseline committata non corrisponde alla misura corrente");
  }
  if (!previous) return failures;

  const compare = (currentSummary, previousSummary, label) => {
    for (const metric of METRICS) {
      if (currentSummary[metric].pct < previousSummary[metric].pct) {
        failures.push(
          `${label}.${metric} regredisce: ${previousSummary[metric].pct}% -> ${currentSummary[metric].pct}%`,
        );
      }
    }
  };
  compare(current.global, previous.global, "global");
  for (const group of COVERAGE_GROUPS) {
    compare(current.groups[group], previous.groups[group], group);
  }
  for (const domain of Object.keys(current.domains ?? {})) {
    if (previous.domains?.[domain]) {
      compare(current.domains[domain], previous.domains[domain], `domain.${domain}`);
    }
  }
  return failures;
}

export function parseChangedLines(diff) {
  const changed = new Map();
  let file;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      file = normalizeCoveragePath(line.slice(6));
      if (!changed.has(file)) changed.set(file, new Set());
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!file || !hunk) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    for (let offset = 0; offset < count; offset += 1) changed.get(file).add(start + offset);
  }
  return changed;
}

export function changedExecutableLineCoverage(map, changed, sources, repositoryRoot) {
  const index = indexCoverageMap(map, repositoryRoot);
  const sourceSet = new Set(sources);
  let total = 0;
  let covered = 0;
  for (const [file, lines] of changed) {
    if (!sourceSet.has(file)) continue;
    const coveragePath = index.get(file);
    if (!coveragePath) throw new Error(`File modificato senza coverage: ${file}`);
    const lineCoverage = map.fileCoverageFor(coveragePath).getLineCoverage();
    for (const line of lines) {
      if (!(line in lineCoverage)) continue;
      total += 1;
      if (lineCoverage[line] > 0) covered += 1;
    }
  }
  return { total, covered, pct: total === 0 ? 100 : Math.floor((covered * 10_000) / total) / 100 };
}

function writeCoverageReports(map, directory) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const context = createContext({ dir: directory, coverageMap: map });
  for (const reporter of ["json", "json-summary", "lcovonly", "html", "text-summary"]) {
    reports.create(reporter).execute(context);
  }
}

function gitJson(repositoryRoot, revision, file, execute = execFileSync) {
  try {
    return JSON.parse(
      execute("git", ["show", `${revision}:${file}`], {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return null;
  }
}

function argument(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function runCoverageReport({
  repositoryRoot = root,
  args = process.argv.slice(2),
  execute = execFileSync,
} = {}) {
  const policyFile = resolve(repositoryRoot, "config/coverage-policy.json");
  const baselineFile = resolve(repositoryRoot, "config/coverage-baseline.json");
  const policy = readJson(policyFile);
  const reportFiles = ["app", "function", "operations"].map((name) =>
    resolve(repositoryRoot, `.coverage/${name}/coverage-final.json`),
  );
  const globalMap = mergeCoverageFiles(reportFiles);
  const functionMap = mergeCoverageFiles([reportFiles[1]]);
  const sources = trackedCoverageSources(repositoryRoot, policy, execute);
  const state = coverageState({ globalMap, functionMap, sources, policy, repositoryRoot });

  writeCoverageReports(globalMap, resolve(repositoryRoot, ".coverage/global"));
  writeFileSync(
    resolve(repositoryRoot, ".coverage/coverage-summary.json"),
    `${JSON.stringify(state, null, 2)}\n`,
  );

  if (args.includes("--update-baseline")) {
    mkdirSync(dirname(baselineFile), { recursive: true });
    writeFileSync(baselineFile, `${JSON.stringify(state, null, 2)}\n`);
    return { state, failures: [] };
  }

  const committed = readJson(baselineFile);
  const baseSha = argument(args, "--base-sha");
  const headSha = argument(args, "--head-sha");
  const previous = /^[0-9a-f]{40}$/.test(baseSha ?? "")
    ? gitJson(repositoryRoot, baseSha, "config/coverage-baseline.json", execute)
    : null;
  const failures = [
    ...baselineFailures(state, committed, previous),
    ...targetFailures(state, policy),
  ];

  if (
    policy.ratchet.active &&
    /^[0-9a-f]{40}$/.test(baseSha ?? "") &&
    /^[0-9a-f]{40}$/.test(headSha ?? "")
  ) {
    const diff = execute(
      "git",
      ["diff", "--unified=0", "--diff-filter=ACMR", `${baseSha}...${headSha}`, "--"],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    const changedCoverage = changedExecutableLineCoverage(
      globalMap,
      parseChangedLines(diff),
      sources,
      repositoryRoot,
    );
    if (changedCoverage.pct < policy.ratchet.changedExecutableLines) {
      failures.push(
        `Diff coverage linee eseguibili: ${changedCoverage.pct}% < ${policy.ratchet.changedExecutableLines}% (${changedCoverage.covered}/${changedCoverage.total})`,
      );
    }
  }

  if (failures.length) throw new Error(failures.join("\n"));
  return { state, failures };
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  try {
    runCoverageReport();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
