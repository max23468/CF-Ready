import { execFileSync } from "node:child_process";

const UI_TOP_LEVEL = new Set([
  "app/app-window-navigation.ts",
  "app/embedded-admin.ts",
  "app/i18n.ts",
  "app/messages-draft.ts",
  "app/revalidation.ts",
  "app/reviews.ts",
  "app/save-bar.ts",
]);

const SERVER_ROUTES = ["app/routes/_index/route.tsx", "app/routes/auth.$.tsx"];

export const COVERAGE_GROUPS = [
  "server-worker",
  "ui-routes",
  "function",
  "operations",
  "public-site",
];

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

export function coverageGroup(file, policy) {
  const path = normalizeCoveragePath(file);
  if (!isCoverageSource(path, policy)) return null;
  if (path.startsWith("extensions/cf-ready-validation/src/")) return "function";
  if (path.startsWith("scripts/")) return "operations";
  if (path.startsWith("site/")) return "public-site";
  if (path.startsWith("workers/")) return "server-worker";

  const serverRoute = SERVER_ROUTES.includes(path) || /^app\/routes\/webhooks\..*\.tsx$/.test(path);
  const uiSource =
    (!serverRoute && path.endsWith(".tsx") && path !== "app/entry.server.tsx") ||
    (path.startsWith("app/features/") && !path.includes(".server.")) ||
    path.startsWith("app/i18n/") ||
    UI_TOP_LEVEL.has(path);
  return uiSource ? "ui-routes" : "server-worker";
}

export function classifyCoverageSources(files, policy) {
  const groups = Object.fromEntries(COVERAGE_GROUPS.map((group) => [group, []]));
  for (const file of [...new Set(files.map(normalizeCoveragePath))].sort()) {
    const group = coverageGroup(file, policy);
    if (group) groups[group].push(file);
  }
  return groups;
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
