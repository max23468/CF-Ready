import assert from "node:assert/strict";
import test from "node:test";
import { classifyCiLane } from "./ci-lane.mjs";

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
  const dependency = classifyCiLane(["package-lock.json"]);
  assert.equal(dependency.lane, "full");
  assert.equal(dependency.dependencyReview, true);
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
