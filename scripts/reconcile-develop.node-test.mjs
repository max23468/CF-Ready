import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedMainSha,
  verifyReconciliationApp,
  verifyProductionDeployment,
  verifyRecoveryReconciliation,
  verifyReconciliation,
} from "./reconcile-develop.mjs";

const main = "a".repeat(40);
const develop = "b".repeat(40);

test("usa lo SHA del deploy per workflow_run e main per il retry manuale", () => {
  assert.equal(
    expectedMainSha({
      eventName: "workflow_run",
      sourceDeploySha: main,
      mainRefSha: develop,
    }),
    main,
  );
  assert.equal(
    expectedMainSha({
      eventName: "workflow_dispatch",
      sourceDeploySha: develop,
      mainRefSha: main,
    }),
    main,
  );
  assert.throws(
    () => expectedMainSha({ eventName: "push", sourceDeploySha: main, mainRefSha: main }),
    /Evento o commit main atteso non valido/,
  );
});

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

test("recupera solo un develop avanzato linearmente dal candidato già promosso", () => {
  const promotedDevelop = "c".repeat(40);
  const comparison = {
    status: "ahead",
    ahead_by: 2,
    merge_base_commit: { sha: promotedDevelop },
  };
  const input = {
    main,
    develop,
    parents: ["d".repeat(40), promotedDevelop],
    mainTree: "promoted-tree",
    promotedDevelop,
    promotedDevelopTree: "promoted-tree",
    comparison,
    expectedMain: main,
  };
  assert.doesNotThrow(() => verifyRecoveryReconciliation(input));
  assert.throws(
    () =>
      verifyRecoveryReconciliation({ ...input, comparison: { ...comparison, status: "diverged" } }),
    /recupero non può riallineare/,
  );
  assert.throws(
    () => verifyRecoveryReconciliation({ ...input, promotedDevelopTree: "changed-tree" }),
    /recupero non può riallineare/,
  );
  assert.throws(
    () => verifyRecoveryReconciliation({ ...input, develop: promotedDevelop }),
    /recupero non può riallineare/,
  );
});

test("lega il token allo slug restituito dalla GitHub App", () => {
  assert.doesNotThrow(() =>
    verifyReconciliationApp({
      actualSlug: "cf-ready-develop-reconciler",
      expectedSlug: "cf-ready-develop-reconciler",
    }),
  );
  assert.throws(
    () =>
      verifyReconciliationApp({
        actualSlug: "another-app",
        expectedSlug: "cf-ready-develop-reconciler",
      }),
    /GitHub App di riallineamento attesa/,
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
