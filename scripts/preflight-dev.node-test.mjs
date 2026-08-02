import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  verifyCoordinatedRollback,
  verifyDevelopmentConfig,
  verifyMigrationSafety,
  verifyNoPendingMigrations,
  verifyVersionAvailable,
  verifyWorkerSecrets,
} from "./preflight-dev.mjs";

const shopify = `
client_id = "adff48d4fe4ceb0dadb4734520701dd7"
application_url = "https://cf-ready-dev.tmsf.workers.dev"
[access_scopes]
scopes = "write_validations"
`;
const wrangler = `{
  "name": "cf-ready-dev",
  "vars": {
    "SHOPIFY_API_KEY": "adff48d4fe4ceb0dadb4734520701dd7",
    "SHOPIFY_APP_URL": "https://cf-ready-dev.tmsf.workers.dev",
    "SCOPES": "write_validations",
    "ALLOWED_SHOP": "cf-ready-dev.myshopify.com"
  },
  "d1_databases": [{
    "binding": "DB",
    "database_name": "cf-ready-db-dev",
    "database_id": "9490eaea-3a12-465d-bb48-e2622b31fc4d"
  }]
}`;

test("il preflight lega il nome Worker alla chiave corretta", () => {
  assert.doesNotThrow(() => verifyDevelopmentConfig(shopify, wrangler));
  assert.throws(
    () =>
      verifyDevelopmentConfig(
        shopify,
        wrangler.replace('"name": "cf-ready-dev"', '"name": "altro-worker"'),
      ),
    /target Development/,
  );
  assert.throws(
    () => verifyDevelopmentConfig(shopify, wrangler.replace("write_validations", "read_orders")),
    /target Development/,
  );
  assert.throws(
    () => verifyDevelopmentConfig(shopify.replace("write_validations", "read_orders"), wrangler),
    /target Development/,
  );
  assert.throws(
    () =>
      verifyDevelopmentConfig(
        shopify,
        wrangler.replace("cf-ready-dev.myshopify.com", "altro-store.myshopify.com"),
      ),
    /target Development/,
  );
  const parsed = JSON.parse(wrangler);
  parsed.d1_databases = [
    { binding: "DB", database_name: "database-errato", database_id: "id-errato" },
    { ...parsed.d1_databases[0], binding: "ALTRO" },
  ];
  assert.throws(
    () => verifyDevelopmentConfig(shopify, JSON.stringify(parsed)),
    /target Development/,
  );
});

test("il preflight rifiuta una versione Shopify già pubblicata", () => {
  assert.throws(
    () => verifyVersionAvailable([{ versionTag: "0.4.22" }], "0.4.22", {}, undefined),
    /già stata pubblicata/,
  );
  assert.doesNotThrow(() => verifyVersionAvailable([{ versionTag: "0.4.21" }], "0.4.22"));
});

test("il retry dello stesso commit coordinato procede in solo readback", () => {
  const commit = "d49717985a93a40f0b0958d19fa8bb012f24b701";
  const deployment = {
    annotations: { "workers/message": `Development ${commit}` },
    versions: [{ version_id: "worker-version-uno", percentage: 100 }],
  };
  const versions = [{ status: "active", versionTag: "0.4.22", message: `Development ${commit}` }];

  assert.equal(verifyVersionAvailable(versions, "0.4.22", deployment, commit), true);
  assert.throws(
    () => verifyVersionAvailable(versions, "0.4.22", deployment, "a".repeat(40)),
    /già stata pubblicata/,
  );
});

test("il readback D1 richiede zero migrazioni pendenti", () => {
  assert.doesNotThrow(() => verifyNoPendingMigrations("✅ No migrations to apply!"));
  assert.throws(
    () => verifyNoPendingMigrations("Migrations to be applied:\n0008_claim.sql"),
    /ancora pendenti/,
  );
});

test("il preflight richiede due fasi per nuove migrazioni distruttive", () => {
  assert.doesNotThrow(() =>
    verifyMigrationSafety([
      { name: "0010_privacy_hardening.sql", sql: "ALTER TABLE shops DROP COLUMN online_user_id;" },
      { name: "0011_add_index.sql", sql: "CREATE INDEX idx_shops ON shops(shop);" },
    ]),
  );
  assert.throws(
    () =>
      verifyMigrationSafety([
        { name: "0011_remove_column.sql", sql: "ALTER TABLE shops DROP COLUMN legacy;" },
      ]),
    /deploy in due fasi/,
  );
  assert.throws(
    () =>
      verifyMigrationSafety([
        { name: "0012_delete_trials.sql", sql: "DELETE FROM trials WHERE trial_ends_at < ?;" },
      ]),
    /deploy in due fasi/,
  );
});

test("il preflight richiede tutti i secret runtime Worker", () => {
  const all = [
    { name: "SHOPIFY_API_SECRET" },
    { name: "SESSION_ENCRYPTION_KEY" },
    { name: "TRIAL_LEDGER_HMAC_KEY" },
  ];
  assert.doesNotThrow(() => verifyWorkerSecrets(all));
  assert.throws(() => verifyWorkerSecrets(all.slice(0, 2)), /Mancano secret runtime/);
});

test("il rollback richiede Worker e Shopify sullo stesso commit", () => {
  const commit = "d49717985a93a40f0b0958d19fa8bb012f24b701";
  const deployment = {
    id: "deployment-uno",
    annotations: { "workers/message": `Release 0.4.21 da ${commit.slice(0, 7)}` },
    versions: [{ version_id: "worker-version-uno", percentage: 100 }],
  };
  const versions = [
    {
      status: "active",
      versionId: "shopify-version-uno",
      versionTag: "0.4.21",
      message: `Development ${commit}`,
    },
  ];

  assert.deepEqual(verifyCoordinatedRollback(deployment, versions), {
    deploymentId: "deployment-uno",
    workerVersionId: "worker-version-uno",
    shopifyVersionId: "shopify-version-uno",
    shopifyVersionTag: "0.4.21",
    commit,
  });
  assert.throws(
    () =>
      verifyCoordinatedRollback(
        { ...deployment, annotations: { "workers/message": "Development altro-commit" } },
        versions,
      ),
    /non coincide/,
  );
});

test("il rollback accetta una versione Worker nata dalla sola rotazione secret", () => {
  const commit = "d49717985a93a40f0b0958d19fa8bb012f24b701";
  assert.deepEqual(
    verifyCoordinatedRollback(
      {
        id: "deployment-secret",
        annotations: { "workers/triggered_by": "secret" },
        versions: [{ version_id: "worker-secret", percentage: 100 }],
      },
      [
        {
          status: "active",
          versionId: "shopify-version-uno",
          versionTag: "0.4.21",
          message: `Development ${commit}`,
        },
      ],
    ),
    {
      deploymentId: "deployment-secret",
      workerVersionId: "worker-secret",
      shopifyVersionId: "shopify-version-uno",
      shopifyVersionTag: "0.4.21",
      commit,
    },
  );
});

test("il workflow ripristina entrambi i provider da un job indipendente", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/deploy-development.yml", import.meta.url),
    "utf8",
  );
  const deployJob = workflow.indexOf("  deploy:");
  const rollbackJob = workflow.indexOf("  rollback:");
  const rollbackStep = workflow.slice(rollbackJob);

  assert.ok(deployJob >= 0 && rollbackJob > deployJob);
  assert.match(
    rollbackStep,
    /always\(\).*needs\.deploy\.result != 'success'.*needs\.deploy\.outputs\.rollback_commit != ''/,
  );
  assert.match(rollbackStep, /needs: deploy/);
  assert.match(rollbackStep, /shopify app release[\s\S]*SHOPIFY_ROLLBACK_VERSION_TAG/);
  assert.match(rollbackStep, /wrangler rollback "\$WORKER_ROLLBACK_VERSION_ID"/);
  assert.match(rollbackStep, /verifyCoordinatedRollback\(deployment, versions\)/);
});
