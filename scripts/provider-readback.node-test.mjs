import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { verifyShopifyReadback, verifyWorkerReadback } from "./provider-readback.mjs";

const options = {
  environment: "Development",
  version: "1.10.1-dev.tree",
  sourceCommit: "a".repeat(40),
};

test("verifica versione e commit del readback Shopify", () => {
  const active = {
    status: "active",
    versionTag: options.version,
    versionId: "shopify-version",
    message: `Development ${options.sourceCommit}`,
  };
  assert.equal(verifyShopifyReadback([active], options), active);
  assert.throws(
    () => verifyShopifyReadback([{ ...active, message: "Development altro" }], options),
    /Readback Shopify Development/,
  );
  assert.throws(() => verifyShopifyReadback([], options), /Readback Shopify Development/);
  assert.throws(
    () => verifyShopifyReadback([{ ...active, versionTag: "altra" }], options),
    /Readback Shopify Development/,
  );
});

test("richiede un solo Worker al cento per cento per il commit", () => {
  const deployment = {
    id: "deployment",
    annotations: { "workers/message": `Development ${options.sourceCommit}` },
    versions: [{ version_id: "worker-version", percentage: 100 }],
  };
  assert.deepEqual(verifyWorkerReadback(deployment, options), {
    deploymentId: "deployment",
    versionId: "worker-version",
  });
  for (const invalid of [
    { ...deployment, id: "" },
    { ...deployment, annotations: { "workers/message": "Development altro" } },
    { ...deployment, versions: [{ version_id: "worker-version", percentage: 50 }] },
    { ...deployment, versions: [{ version_id: "", percentage: 100 }] },
    { ...deployment, versions: [] },
  ]) {
    assert.throws(() => verifyWorkerReadback(invalid, options), /Readback Worker Development/);
  }
});

test("l'entrypoint valida input e scrive il riepilogo del provider", () => {
  const directory = mkdtempSync(join(tmpdir(), "cf-ready-provider-readback-"));
  const input = join(directory, "shopify.json");
  const workerInput = join(directory, "worker.json");
  const summary = join(directory, "summary.md");
  writeFileSync(
    input,
    JSON.stringify([
      {
        status: "active",
        versionTag: options.version,
        versionId: "shopify-version",
        message: `Development ${options.sourceCommit}`,
      },
    ]),
  );
  writeFileSync(
    workerInput,
    JSON.stringify({
      id: "deployment",
      annotations: { "workers/message": `Development ${options.sourceCommit}` },
      versions: [{ version_id: "worker-version", percentage: 100 }],
    }),
  );
  const run = (provider, inputPath = input, env = {}) =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./provider-readback.mjs", import.meta.url)), provider, inputPath],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DEPLOY_ENVIRONMENT: options.environment,
          DEPLOY_SOURCE_COMMIT: options.sourceCommit,
          DEPLOY_VERSION: options.version,
          GITHUB_STEP_SUMMARY: summary,
          ...env,
        },
      },
    );

  const result = run("shopify");
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(summary, "utf8"), /Shopify attivo.*commit sorgente/);
  assert.equal(run("worker", workerInput).status, 0);
  assert.match(readFileSync(summary, "utf8"), /Worker pubblicato.*worker-version/);

  writeFileSync(
    input,
    JSON.stringify([
      {
        status: "active",
        versionTag: options.version,
        versionId: "shopify-production",
        message: `Production ${options.sourceCommit}`,
      },
    ]),
  );
  assert.equal(run("shopify", input, { DEPLOY_ENVIRONMENT: "Production" }).status, 0);
  assert.doesNotMatch(readFileSync(summary, "utf8").trim().split("\n").at(-1), /commit sorgente/);
  assert.notEqual(run("altro").status, 0);
  assert.notEqual(run("shopify", input, { DEPLOY_SOURCE_COMMIT: "" }).status, 0);
});
