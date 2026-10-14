import { spawn, execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// La corsia browser è divisa per motore: i due runner girano in parallelo anche in CI.
export const COVERAGE_PARTS = ["app", "ui-chromium", "ui-webkit", "function", "operations"];

export function coverageParts(mode = "full") {
  if (mode === "full") return COVERAGE_PARTS;
  if (mode === "operations") return ["operations"];
  throw new Error(`Modalità coverage non valida: ${mode}`);
}

export function stampCoverage(part, root = process.cwd(), execute = execFileSync) {
  if (!COVERAGE_PARTS.includes(part)) throw new Error("Raccolta coverage sconosciuta.");
  const git = (args) => execute("git", args, { cwd: root, encoding: "utf8" }).trim();
  const directory = resolve(root, ".coverage", part);
  // La ricevuta non può trasformare un report assente in un risultato valido.
  JSON.parse(readFileSync(resolve(directory, "coverage-final.json"), "utf8"));
  const evidence = {
    part,
    commit: git(["rev-parse", "HEAD"]),
    tree: git(["rev-parse", "HEAD^{tree}"]),
  };
  writeFileSync(resolve(directory, "provenance.json"), `${JSON.stringify(evidence)}\n`);
  return evidence;
}

export function verifyCoverageParts(parts, root = process.cwd(), execute = execFileSync) {
  const git = (args) => execute("git", args, { cwd: root, encoding: "utf8" }).trim();
  const commit = git(["rev-parse", "HEAD"]);
  const tree = git(["rev-parse", "HEAD^{tree}"]);
  for (const part of parts) {
    if (!COVERAGE_PARTS.includes(part)) throw new Error("Raccolta coverage sconosciuta.");
    const evidence = JSON.parse(
      readFileSync(resolve(root, ".coverage", part, "provenance.json"), "utf8"),
    );
    if (evidence.part !== part || evidence.commit !== commit || evidence.tree !== tree) {
      throw new Error(`Provenienza coverage ${part} diversa dal candidato.`);
    }
  }
}

export async function collectCoverage(mode = "full", root = process.cwd(), launch = spawn) {
  const parts = coverageParts(mode);
  for (const part of parts)
    rmSync(resolve(root, ".coverage", part), { recursive: true, force: true });
  // Runner separati non condividono report; tutti devono terminare prima dell'aggregazione.
  const results = await Promise.allSettled(
    parts.map(
      (part) =>
        new Promise((resolveResult, reject) => {
          const child = launch("npm", ["run", `coverage:${part}`], { cwd: root, stdio: "inherit" });
          child.once("error", reject);
          child.once("exit", (code, signal) => {
            if (code !== 0) reject(new Error(`Coverage ${part} fallita (${signal ?? code}).`));
            else resolveResult(part);
          });
        }),
    ),
  );
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Raccolta coverage fallita.",
    );
  for (const part of parts) stampCoverage(part, root);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const mode = args.includes("--operations-only") ? "operations" : "full";
  if (args[0] === "--stamp") stampCoverage(args[1]);
  else if (args[0] === "--verify") verifyCoverageParts(coverageParts(mode));
  else await collectCoverage(mode);
}
