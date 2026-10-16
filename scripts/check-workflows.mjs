import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const version = readFileSync(new URL("../mise.toml", import.meta.url), "utf8").match(
  /^actionlint = "([\d.]+)"$/m,
)?.[1];

export function checkWorkflows(execute = spawnSync) {
  if (!version) throw new Error("Versione actionlint mancante in mise.toml.");
  const installed = execute("actionlint", ["-version"], { encoding: "utf8" });
  if (installed.error || installed.status !== 0) {
    throw new Error("actionlint non disponibile: esegui mise install actionlint.");
  }
  if (installed.stdout.split(/\r?\n/, 1)[0] !== version) {
    throw new Error(`Serve actionlint ${version}: esegui mise install actionlint.`);
  }
  // I controlli opzionali dipendono da tool globali: stesso risultato in locale e CI.
  const result = execute("actionlint", ["-shellcheck=", "-pyflakes=", ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = checkWorkflows();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
