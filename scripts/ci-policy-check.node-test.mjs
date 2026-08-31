import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateCiPolicy, isCiPolicyFile } from "./ci-policy-check.mjs";

test("riconosce tutto il control plane CI senza ampliare la superficie", () => {
  for (const path of [
    ".github/workflows/ci.yml",
    ".github/workflows/nested/check.yml",
    ".npmrc",
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

test("consente modifiche ordinarie da qualunque mittente", () => {
  assert.deepEqual(
    evaluateCiPolicy({
      action: "synchronize",
      files: ["app/root.tsx"],
      ownerId: 10,
      senderId: 20,
      trustedAutomation: false,
    }),
    {
      state: "success",
      description: "La PR non modifica il control plane CI.",
      changedPolicyFiles: [],
    },
  );
});

test("nega eventi generici e accetta soltanto l'etichetta del proprietario", () => {
  const files = ["package.json", ".github/workflows/ci.yml"];
  const input = {
    action: "synchronize",
    files,
    ownerId: 10,
    senderId: 10,
    trustedAutomation: false,
  };
  assert.deepEqual(evaluateCiPolicy(input), {
    state: "failure",
    description: "Le modifiche CI richiedono ci-policy-approved dal proprietario.",
    changedPolicyFiles: [".github/workflows/ci.yml", "package.json"],
  });
  assert.equal(
    evaluateCiPolicy({
      ...input,
      action: "labeled",
      label: "ci-policy-approved",
    }).state,
    "success",
  );
  assert.equal(
    evaluateCiPolicy({ ...input, action: "reopened", label: "ci-policy-approved" }).state,
    "failure",
  );
});

test("un diniego atteso blocca lo SHA senza far fallire la run di attestazione", async () => {
  const source = await readFile(new URL("./ci-policy-check.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /result\.state !== "success"[^\n]+process\.exitCode/);
  assert.match(source, /main\(\)\.catch\([\s\S]+process\.exitCode = 1/);
});

test("mantiene funzionanti gli aggiornamenti Dependabot attendibili", () => {
  assert.equal(
    evaluateCiPolicy({
      action: "synchronize",
      files: ["package-lock.json"],
      ownerId: 10,
      senderId: 49699333,
      trustedAutomation: true,
    }).state,
    "success",
  );
});
