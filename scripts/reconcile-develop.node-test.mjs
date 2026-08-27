import assert from "node:assert/strict";
import test from "node:test";
import { verifyReconciliation } from "./reconcile-develop.mjs";

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
