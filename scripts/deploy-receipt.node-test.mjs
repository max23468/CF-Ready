import assert from "node:assert/strict";
import test from "node:test";
import { createDeployReceipt } from "./deploy-receipt.mjs";

const input = {
  environment: "Production",
  commit: "a".repeat(40),
  tree: "b".repeat(40),
  repository: "owner/repo",
  runUrl: "https://github.test/run/1",
  repositoryVersion: "1.0.3",
  shopifyVersion: "1.0.3",
  worker: {
    id: "deployment",
    annotations: { "workers/message": `Production ${"a".repeat(40)}` },
    versions: [{ version_id: "worker", percentage: 100 }],
  },
  shopify: [
    {
      status: "active",
      versionId: "shopify",
      versionTag: "1.0.3",
      message: `Production ${"a".repeat(40)}`,
    },
  ],
  rollback: { workerVersionId: "old-worker", shopifyVersionTag: "1.0.2" },
};

test("crea una ricevuta minima legata a commit e tree", () => {
  const receipt = createDeployReceipt(input);
  assert.equal(receipt.commit, input.commit);
  assert.equal(receipt.providerSourceCommit, input.commit);
  assert.equal(receipt.tree, input.tree);
  assert.equal(receipt.worker.versionId, "worker");
  assert.equal(receipt.shopify.versionTag, "1.0.3");
  assert.equal(receipt.checks.providerReadback, "green");
});

test("rifiuta readback incompleti", () => {
  assert.throws(
    () => createDeployReceipt({ ...input, worker: { versions: [] } }),
    /Dati insufficienti/,
  );
  assert.throws(
    () =>
      createDeployReceipt({
        ...input,
        shopify: [{ ...input.shopify[0], versionTag: "1.0.2" }],
      }),
    /Dati insufficienti/,
  );
});
