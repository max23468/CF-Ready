import assert from "node:assert/strict";
import test from "node:test";
import { hasReconciliationBypass, verifyReconciliation } from "./reconcile-develop.mjs";

const main = "a".repeat(40);
const develop = "b".repeat(40);

test("consente soltanto il merge di promozione con tree invariato", () => {
  assert.doesNotThrow(() =>
    verifyReconciliation({
      main,
      develop,
      parents: ["c".repeat(40), develop],
      mainTree: "tree",
      developTree: "tree",
    }),
  );
  assert.throws(
    () =>
      verifyReconciliation({
        main,
        develop,
        parents: [develop],
        mainTree: "tree",
        developTree: "tree",
      }),
    /fast-forward sicuro/,
  );
  assert.throws(
    () =>
      verifyReconciliation({
        main,
        develop,
        parents: ["c".repeat(40), develop],
        mainTree: "tree-main",
        developTree: "tree-develop",
      }),
    /fast-forward sicuro/,
  );
});

test("lega il bypass all'app dell'installation token", () => {
  const ruleset = {
    bypass_actors: [{ actor_id: 4735849, actor_type: "Integration", bypass_mode: "always" }],
  };
  assert.equal(hasReconciliationBypass(ruleset, 4735849), true);
  assert.equal(hasReconciliationBypass(ruleset, 15368), false);
});
