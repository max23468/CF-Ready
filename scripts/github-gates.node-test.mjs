import assert from "node:assert/strict";
import test from "node:test";
import { missingSuccessfulChecks, verifyPromotionHistory } from "./github-gates.mjs";

test("riusa soltanto check conclusi fuori dal run corrente", () => {
  const checks = [
    {
      name: "verify",
      conclusion: "success",
      details_url: "https://github.test/actions/runs/10/job/1",
    },
    {
      name: "e2e",
      conclusion: "success",
      details_url: "https://github.test/actions/runs/11/job/2",
    },
  ];
  assert.deepEqual(missingSuccessfulChecks(checks, ["verify", "e2e"], "11"), ["e2e"]);
  assert.deepEqual(missingSuccessfulChecks(checks, ["verify", "e2e"], "12"), []);
  assert.deepEqual(
    missingSuccessfulChecks([{ name: "verify", conclusion: "neutral" }], ["verify"]),
    ["verify"],
  );
});

test("accetta commit da PR develop revisionata e merge senza nuovo tree", () => {
  assert.doesNotThrow(() =>
    verifyPromotionHistory([
      {
        sha: "a".repeat(40),
        parents: [{}],
        pullRequests: [{ base: "develop", merged: true, codexReview: "success" }],
      },
      {
        sha: "b".repeat(40),
        parents: [{}, {}],
        tree: "tree",
        parentTrees: ["old", "tree"],
        pullRequests: [],
      },
    ]),
  );
});

test("rifiuta commit senza provenienza Codex", () => {
  assert.throws(
    () =>
      verifyPromotionHistory([
        {
          sha: "c".repeat(40),
          parents: [{}],
          pullRequests: [{ base: "develop", merged: true, codexReview: "failure" }],
        },
      ]),
    /provenienza review/,
  );
});
