import { execFileSync } from "node:child_process";

const FUNCTION_SOURCE_PREFIX = "extensions/cf-ready-validation/src/";

export function normalizeCoveragePath(file) {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isCoverageSource(file, policy) {
  const path = normalizeCoveragePath(file);
  if (path in policy.nonExecutableSources) return false;
  if (/^app\/.*\.tsx?$/.test(path)) return !path.endsWith(".d.ts");
  if (/^workers\/.*\.ts$/.test(path)) return true;
  if (/^extensions\/cf-ready-validation\/src\/.*\.ts$/.test(path)) return true;
  if (/^scripts\/.*\.mjs$/.test(path)) return !path.endsWith(".node-test.mjs");
  return /^site\/.*\.js$/.test(path) && !path.startsWith("site/.wrangler/");
}

export function isFunctionSource(file) {
  return normalizeCoveragePath(file).startsWith(FUNCTION_SOURCE_PREFIX);
}

export function trackedCoverageSources(repositoryRoot, policy, execute = execFileSync) {
  const output = execute(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      "app",
      "workers",
      "extensions/cf-ready-validation/src",
      "scripts",
      "site",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  return output
    .split("\0")
    .filter(Boolean)
    .map(normalizeCoveragePath)
    .filter((file) => isCoverageSource(file, policy))
    .sort();
}
