import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// `git diff --check` senza argomenti guarda solo le modifiche non in stage: in CI e su un tree
// pulito non controlla nulla. Il confronto parte quindi dal merge-base con il branch di
// destinazione e arriva al working tree, così copre i commit del branch e le modifiche locali.
// In una PR GitHub espone il branch di destinazione in GITHUB_BASE_REF; altrove vale develop.
export function diffCheckBase({ env = process.env, git = runGit } = {}) {
  const targets = [env.GITHUB_BASE_REF && `origin/${env.GITHUB_BASE_REF}`, "origin/develop"];
  for (const target of targets.filter(Boolean)) {
    const result = git(["merge-base", target, "HEAD"]);
    if (result.status === 0) return result.stdout.trim();
  }
  return null;
}

function runGit(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

function main() {
  const base = diffCheckBase();
  if (!base) console.warn("diff-check: branch di destinazione assente, controllo solo da HEAD.");
  const result = spawnSync("git", ["diff", "--check", base ?? "HEAD"], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main();
