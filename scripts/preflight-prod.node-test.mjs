import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  readBillingMode,
  readRollbackTarget,
  verifyBuiltConfig,
  verifyProductionConfig,
} from "./preflight-prod.mjs";

const shopify = readFileSync(new URL("../shopify.app.toml", import.meta.url), "utf8");

const builtProduction = JSON.stringify({
  name: "cf-ready-prod",
  vars: {
    SHOPIFY_API_KEY: "3640fb39bcf605de0537d6dfc0d01c8a",
    SHOPIFY_APP_URL: "https://cf-ready-prod.tmsf.workers.dev",
    SCOPES: "write_validations",
    BILLING_TEST: "true",
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: "cf-ready-db-prod",
      database_id: "6434597c-d683-48d9-a51f-b0d15de6a684",
    },
  ],
  queues: {
    producers: [{ binding: "WEBHOOK_QUEUE", queue: "cf-ready-webhooks-prod" }],
    consumers: [{ queue: "cf-ready-webhooks-prod", max_batch_size: 1, max_retries: 5 }],
  },
});

test("il manifest Production del repository supera il preflight", () => {
  assert.doesNotThrow(() => verifyProductionConfig(shopify));
});

test("il preflight rifiuta un manifest che non è quello Production", () => {
  const cases = [
    [
      "client_id di un'altra app",
      shopify.replace("3640fb39bcf605de0537d6dfc0d01c8a", "0".repeat(32)),
    ],
    ["URL non aggiornato", shopify.replace(/cf-ready-prod\.tmsf\.workers\.dev/g, "example.com")],
    ["scope più ampio", shopify.replace("write_validations", "read_orders")],
  ];
  for (const [name, config] of cases) {
    assert.throws(() => verifyProductionConfig(config), /target Production/, name);
  }
});

test("il preflight vieta l'aggiornamento automatico degli URL in Production", () => {
  assert.throws(
    () =>
      verifyProductionConfig(
        shopify.replace(
          "automatically_update_urls_on_dev = false",
          "automatically_update_urls_on_dev = true",
        ),
      ),
    /aggiornamento automatico/,
  );
});

// La regressione che conta: senza CLOUDFLARE_ENV=production il bundle porta i valori
// Development e `wrangler deploy` li pubblicherebbe senza dire niente.
test("il preflight riconosce un bundle costruito senza CLOUDFLARE_ENV=production", () => {
  const builtDevelopment = JSON.stringify({
    name: "cf-ready-dev",
    vars: {
      SHOPIFY_API_KEY: "adff48d4fe4ceb0dadb4734520701dd7",
      SHOPIFY_APP_URL: "https://cf-ready-dev.tmsf.workers.dev",
      SCOPES: "write_validations",
      ALLOWED_SHOP: "cf-ready-dev.myshopify.com",
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: "cf-ready-db-dev",
        database_id: "9490eaea-3a12-465d-bb48-e2622b31fc4d",
      },
    ],
  });

  assert.doesNotThrow(() => verifyBuiltConfig(builtProduction));
  assert.throws(() => verifyBuiltConfig(builtDevelopment), /CLOUDFLARE_ENV=production/);
});

test("il preflight vieta ALLOWED_SHOP in Production", () => {
  const restricted = JSON.parse(builtProduction);
  restricted.vars.ALLOWED_SHOP = "cf-ready-dev.myshopify.com";
  assert.throws(() => verifyBuiltConfig(JSON.stringify(restricted)), /ALLOWED_SHOP/);
});

test("il preflight legge il database Production sbagliato", () => {
  const wrongDatabase = JSON.parse(builtProduction);
  wrongDatabase.d1_databases[0].database_name = "cf-ready-db-dev";
  assert.throws(() => verifyBuiltConfig(JSON.stringify(wrongDatabase)), /Production/);
});

test("il preflight rifiuta la coda webhook Production sbagliata", () => {
  const wrongQueue = JSON.parse(builtProduction);
  wrongQueue.queues.producers[0].queue = "cf-ready-webhooks-dev";
  assert.throws(() => verifyBuiltConfig(JSON.stringify(wrongQueue)), /Production/);
});

test("la modalità di addebito è dichiarata come la legge il Worker", () => {
  assert.equal(readBillingMode(builtProduction), "di prova");
  const real = JSON.parse(builtProduction);
  real.vars.BILLING_TEST = "false";
  assert.equal(readBillingMode(JSON.stringify(real)), "reale");
});

test("il primo deploy Production non ha un target di rollback", () => {
  assert.equal(readRollbackTarget(undefined), null);
  assert.equal(readRollbackTarget({}), null);
  assert.equal(readRollbackTarget({ id: "d1", versions: [] }), null);
  assert.deepEqual(readRollbackTarget({ id: "d1", versions: [{ version_id: "v1" }] }), {
    deploymentId: "d1",
    workerVersionId: "v1",
  });
});
