import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyCiPolicyChange, isCiPolicyFile } from "./ci-policy-check.mjs";

test("riconosce tutto il control plane CI senza ampliare la superficie", () => {
  for (const path of [
    ".github/actions/setup-node-npm/action.yml",
    ".github/workflows/ci.yml",
    ".github/workflows/nested/check.yml",
    ".npmrc",
    "config/coverage-policy.json",
    "doctor.config.json",
    "extensions/cf-ready-validation/package.json",
    "extensions/cf-ready-validation/vitest.config.js",
    "package-lock.json",
    "package.json",
    "scripts/ci-lane.mjs",
    "scripts/ci-policy-check.mjs",
    "scripts/github-gates.mjs",
    "tests/apply-migrations.ts",
    "tests/playwright.config.ts",
    "tsconfig.json",
    "vite.config.ts",
    "vitest.config.ts",
  ]) {
    assert.equal(isCiPolicyFile(path), true, path);
  }
  for (const path of ["app/root.tsx", "tests/home-ui.test.ts", ".github/CODEOWNERS"]) {
    assert.equal(isCiPolicyFile(path), false, path);
  }
});

test("classifica le modifiche ordinarie senza file di policy", () => {
  assert.deepEqual(classifyCiPolicyChange({ files: ["app/root.tsx"] }), {
    description: "La PR non modifica il control plane CI.",
    changedPolicyFiles: [],
  });
});

test("affida anche le modifiche al control plane ai gate automatici della PR", () => {
  assert.deepEqual(
    classifyCiPolicyChange({ files: ["package.json", ".github/workflows/ci.yml"] }),
    {
      description: "Control plane CI rilevato; valgono i gate automatici della PR.",
      changedPolicyFiles: [".github/workflows/ci.yml", "package.json"],
    },
  );
});

test("soltanto un errore inatteso fa fallire la run di attestazione", async () => {
  const source = await readFile(new URL("./ci-policy-check.mjs", import.meta.url), "utf8");
  assert.match(source, /main\(\)\.catch\([\s\S]+process\.exitCode = 1/);
});
