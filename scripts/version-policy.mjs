import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { changedFiles, releaseSurface } from "./ci-lane.mjs";

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? "");
  if (!match) throw new Error(`Versione SemVer non valida: ${version}.`);
  return match.slice(1).map(Number);
}

export function compareVersions(left, right) {
  const [a, b] = [parseVersion(left), parseVersion(right)];
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function nextVersions(version) {
  const [major, minor, patch] = parseVersion(version);
  return [`${major}.${minor}.${patch + 1}`, `${major}.${minor + 1}.0`, `${major + 1}.0.0`];
}

// Un lotto su develop porta una sola versione: il primo cambiamento distribuito la
// prepara, i successivi la riusano o la alzano di livello rispetto a quella promossa.
export function checkVersionPolicy({ promoted, base, head, release, dependencyUpdate = false }) {
  const step = compareVersions(head, base);
  if (step < 0) throw new Error(`La versione scende da ${base} a ${head}.`);
  if (step === 0) {
    if (release && base === promoted && !dependencyUpdate) {
      throw new Error(
        `Il diff cambia una superficie distribuita: prepara il bump di ${promoted} (patch o minor) con il changelog.`,
      );
    }
    return base === promoted ? "nessun bump" : `riusa ${base} del lotto non promosso`;
  }
  if (!release) {
    throw new Error(
      `La versione passa a ${head} senza superfici distribuite: tooling, test, workflow e documentazione non cambiano la SemVer.`,
    );
  }
  if (!nextVersions(promoted).includes(head)) {
    throw new Error(
      `Il lotto non promosso usa già ${base}: ${head} deve restare un solo passo da ${promoted} (${nextVersions(promoted).join(", ")}).`,
    );
  }
  return `bump ${promoted} → ${head}`;
}

export function packageManifest(ref, { cwd = process.cwd(), execute = execFileSync } = {}) {
  try {
    return JSON.parse(
      execute("git", ["show", `${ref}:package.json`], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return undefined;
  }
}

export function runVersionPolicy({
  baseSha,
  headSha,
  files,
  headRef = "",
  mainRef = "origin/main",
  workingTree = false,
  cwd = process.cwd(),
  execute = execFileSync,
}) {
  const before = packageManifest(baseSha, { cwd, execute });
  const after = workingTree
    ? JSON.parse(readFileSync(`${cwd}/package.json`, "utf8"))
    : packageManifest(headSha, { cwd, execute });
  const promoted = packageManifest(mainRef, { cwd, execute });
  if (!before || !after || !promoted) throw new Error("Manifest package.json non leggibile.");
  return checkVersionPolicy({
    promoted: promoted.version,
    base: before.version,
    head: after.version,
    release: releaseSurface(files, { before, after }).release,
    dependencyUpdate: headRef.startsWith("dependabot/"),
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  try {
    const baseSha = argument("--base-sha") ?? "";
    const headSha = argument("--head-sha") ?? "";
    console.log(
      `Versione: ${runVersionPolicy({
        baseSha,
        headSha,
        files: changedFiles(baseSha, headSha),
        headRef: argument("--head-ref") ?? "",
        mainRef: argument("--main-ref") ?? "origin/main",
      })}.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
