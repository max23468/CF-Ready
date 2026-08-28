import assert from "node:assert/strict";
import test from "node:test";
import { missingSuccessfulChecks, verifyPromotionHistory } from "./github-gates.mjs";

test("riusa soltanto la suite più recente conclusa fuori dal run corrente", () => {
  const checks = [
    {
      id: 1,
      name: "verify",
      conclusion: "success",
      details_url: "https://github.test/actions/runs/10/job/1",
      check_suite: { id: 20 },
    },
    {
      id: 2,
      name: "e2e",
      conclusion: "success",
      details_url: "https://github.test/actions/runs/10/job/2",
      check_suite: { id: 20 },
    },
    {
      id: 3,
      name: "verify",
      conclusion: "success",
      details_url: "https://github.test/actions/runs/11/job/3",
      check_suite: { id: 21 },
    },
    {
      id: 4,
      name: "e2e",
      conclusion: "success",
      details_url: "https://github.test/actions/runs/11/job/4",
      check_suite: { id: 21 },
    },
    {
      id: 5,
      name: "verify",
      conclusion: "failure",
      details_url: "https://github.test/actions/runs/11/job/5",
      check_suite: { id: 21 },
    },
  ];
  assert.deepEqual(missingSuccessfulChecks(checks, ["verify", "e2e"], "11"), []);
  assert.deepEqual(missingSuccessfulChecks(checks, ["verify", "e2e"], "12"), ["verify"]);
  assert.deepEqual(
    missingSuccessfulChecks([{ name: "verify", conclusion: "neutral" }], ["verify"]),
    ["verify"],
  );
});

test("seleziona il check più recente per nome tra workflow distinti", () => {
  const checks = [
    {
      id: 1,
      name: "verify",
      conclusion: "success",
      check_suite: { id: 20 },
    },
    {
      id: 2,
      name: "e2e",
      conclusion: "success",
      check_suite: { id: 20 },
    },
    {
      id: 3,
      name: "verify",
      conclusion: null,
      check_suite: { id: 21 },
    },
  ];
  assert.deepEqual(missingSuccessfulChecks(checks, ["verify", "e2e"]), ["verify"]);
  assert.deepEqual(
    missingSuccessfulChecks(
      [
        ...checks,
        {
          id: 4,
          name: "react-doctor",
          conclusion: "success",
          check_suite: { id: 22 },
        },
      ],
      ["verify", "e2e", "react-doctor"],
    ),
    ["verify"],
  );
});

test("accetta commit da PR develop revisionata e merge senza nuovo tree", () => {
  assert.doesNotThrow(() =>
    verifyPromotionHistory([
      {
        sha: "a".repeat(40),
        parents: [{}],
        pullRequests: [{ base: "develop", merged: true }],
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

test("rifiuta commit senza una PR merged verso develop", () => {
  assert.throws(
    () =>
      verifyPromotionHistory([
        {
          sha: "c".repeat(40),
          parents: [{}],
          pullRequests: [{ base: "main", merged: true }],
        },
      ]),
    /provenienza review/,
  );
});
