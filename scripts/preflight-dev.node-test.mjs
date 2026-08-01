import assert from "node:assert/strict";
import { test } from "node:test";

import {
  verifyCoordinatedRollback,
  verifyDevelopmentConfig,
  verifyVersionAvailable,
  verifyWorkerSecrets,
} from "./preflight-dev.mjs";

const shopify = `
client_id = "adff48d4fe4ceb0dadb4734520701dd7"
application_url = "https://cf-ready-dev.tmsf.workers.dev"
`;
const wrangler = `{
  "name": "cf-ready-dev",
  "vars": {
    "SHOPIFY_API_KEY": "adff48d4fe4ceb0dadb4734520701dd7",
    "SHOPIFY_APP_URL": "https://cf-ready-dev.tmsf.workers.dev",
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
    () => verifyVersionAvailable([{ versionTag: "0.4.22" }], "0.4.22"),
    /già stata pubblicata/,
  );
  assert.doesNotThrow(() => verifyVersionAvailable([{ versionTag: "0.4.21" }], "0.4.22"));
});

test("il preflight richiede entrambi i secret runtime Worker", () => {
  const all = [{ name: "SHOPIFY_API_SECRET" }, { name: "SESSION_ENCRYPTION_KEY" }];
  assert.doesNotThrow(() => verifyWorkerSecrets(all));
  assert.throws(() => verifyWorkerSecrets(all.slice(0, 1)), /Mancano secret runtime/);
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
