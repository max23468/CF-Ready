import assert from "node:assert/strict";
import test from "node:test";
import { changedFiles, classifyCiLane, parseChangedFiles } from "./ci-lane.mjs";

test("la documentazione di contenuto usa la corsia docs", () => {
  assert.equal(classifyCiLane(["docs/listing/listing-it.md"]).lane, "docs");
  assert.equal(classifyCiLane(["README.md", "docs/listing/listing-en.md"]).e2e, false);
});

test("il sito distribuibile non viene trattato come sola documentazione", () => {
  const result = classifyCiLane(["site/index.html"]);
  assert.equal(result.lane, "standard");
  assert.equal(result.e2e, true);
});

test("governance, workflow e dipendenze restano full", () => {
  assert.equal(classifyCiLane(["AGENTS.md"]).lane, "full");
  assert.equal(classifyCiLane([".github/workflows/ci.yml"]).lane, "full");
  assert.equal(classifyCiLane(["docs/runbooks/secret-inventory.md"]).lane, "full");
  assert.equal(classifyCiLane(["docs/runbooks/future-operation.md"]).lane, "full");
  const dependency = classifyCiLane(["package-lock.json"]);
  assert.equal(dependency.lane, "full");
  assert.equal(dependency.dependencyReview, true);
  assert.equal(classifyCiLane(["scripts/reconcile-develop.mjs"]).lane, "full");
  assert.equal(classifyCiLane(["config/coverage-baseline.json"]).lane, "full");
});

test("il diff include anche i file eliminati", () => {
  const base = "a".repeat(40);
  const head = "b".repeat(40);
  let args;
  const files = changedFiles(base, head, {
    execute: (_command, receivedArgs) => {
      args = receivedArgs;
      return "D\0.github/workflows/obsolete.yml\0M\0README.md\0";
    },
  });
  assert.deepEqual(files, [".github/workflows/obsolete.yml", "README.md"]);
  assert.ok(args.includes("--name-status"));
  assert.ok(args.includes("-z"));
  assert.ok(args.includes("--diff-filter=ACMRD"));
});

test("il diff conserva entrambi i percorsi di rinomine e copie", () => {
  const files = parseChangedFiles(
    "R100\0.github/workflows/obsolete.yml\0docs/obsolete.md\0" +
      "C087\0scripts/source.mjs\0docs/source.md\0",
  );
  assert.deepEqual(files, [
    ".github/workflows/obsolete.yml",
    "docs/obsolete.md",
    "scripts/source.mjs",
    "docs/source.md",
  ]);
  assert.equal(classifyCiLane(files).lane, "full");
});

test("il runtime ordinario usa standard con E2E", () => {
  const result = classifyCiLane(["app/routes/app._index.tsx"]);
  assert.equal(result.lane, "standard");
  assert.equal(result.e2e, true);
  assert.equal(result.reactDoctor, true);
});

test("la promozione riusa le prove senza browser o React Doctor", () => {
  const result = classifyCiLane(["app/routes/app._index.tsx"], {
    base: "main",
    head: "develop",
  });
  assert.equal(result.lane, "promotion");
  assert.equal(result.e2e, false);
  assert.equal(result.reactDoctor, false);
});

test("un diff vuoto fallisce verso la corsia completa", () => {
  assert.equal(classifyCiLane([]).lane, "full");
});
