import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// Backport PR #6247, head d6e90d7d1353db6b2c6fab906379ca26cd66401b:
// https://github.com/stryker-mutator/stryker-js/pull/6247
// shortcut: rimuovere dopo l'upgrade a un runner che include il fix upstream.
const original = `.map(({ test: name }) => escapeRegExp(name))
                .join('|');
            const regex = new RegExp(regexTestNameFilter);`;
const patched = original
  .replace("escapeRegExp(name)", "escapeRegExp(name).replace(/ /g, '(?: > | )')")
  .replace(
    "new RegExp(regexTestNameFilter)",
    () => "new RegExp(`(?:${regexTestNameFilter})\\\\s*$`)",
  );

export function patchStrykerVitest(source) {
  if (source.includes(patched)) return source;
  if (source.split(original).length !== 2) {
    throw new Error(
      "Backport Stryker #6247: codice inatteso, verificare il runner prima dell'upgrade",
    );
  }
  return source.replace(original, () => patched);
}

export function applyStrykerVitestPatch(
  entry = import.meta.resolve("@stryker-mutator/vitest-runner"),
) {
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", entry), "utf8"));
  if (manifest.version !== "10.0.0") {
    throw new Error(
      "Backport Stryker #6247 previsto per vitest-runner 10.0.0: verificare il fix upstream",
    );
  }
  const target = fileURLToPath(new URL("vitest-test-runner.js", entry));
  const source = readFileSync(target, "utf8");
  const result = patchStrykerVitest(source);
  if (result !== source) writeFileSync(target, result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  applyStrykerVitestPatch();
}
