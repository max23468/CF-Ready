import assert from "node:assert/strict";
import test from "node:test";
import {
  hasReconciliationBypass,
  verifyProductionDeployment,
  verifyReconciliation,
} from "./reconcile-develop.mjs";

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
      expectedMain: main,
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
        expectedMain: main,
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
        expectedMain: main,
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
  assert.equal(
    hasReconciliationBypass(
      {
        bypass_actors: [
          ...ruleset.bypass_actors,
          { actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" },
        ],
      },
      4735849,
    ),
    false,
  );
});

test("richiede un deploy Production verde e la relativa ricevuta per lo stesso main", () => {
  const run = {
    id: 42,
    path: ".github/workflows/deploy-production.yml",
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "success",
    head_branch: "main",
    head_sha: main,
  };
  const artifacts = [{ name: `deploy-receipt-production-${main}`, expired: false }];
  assert.doesNotThrow(() => verifyProductionDeployment({ run, artifacts, expectedMain: main }));
  assert.throws(
    () =>
      verifyProductionDeployment({
        run: { ...run, head_sha: develop },
        artifacts,
        expectedMain: main,
      }),
    /stesso commit main/,
  );
  assert.throws(
    () => verifyProductionDeployment({ run, artifacts: [], expectedMain: main }),
    /ricevuta non scaduta/,
  );
});
