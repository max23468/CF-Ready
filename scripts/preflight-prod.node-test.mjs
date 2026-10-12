import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { loadWorkerConfig } from "./preflight-common.mjs";
import {
  readBillingMode,
  readRollbackTarget,
  verifyBuiltConfig,
  verifyProductionConfig,
} from "./preflight-prod.mjs";

const shopify = readFileSync(new URL("../shopify.app.toml", import.meta.url), "utf8");

// La Build Output Production nasce da `cloudflare.config.ts` in mode `prod`; gli addebiti di
// prova distinguono il fixture dal valore reale.
const productionWorker = await loadWorkerConfig("prod");
const builtProduction = JSON.stringify({
  ...productionWorker,
  env: { ...productionWorker.env, BILLING_TEST: { type: "text", value: "true" } },
});
const prodRoot = JSON.stringify({ buildContext: { isPreview: false, mode: "prod" } });
const verifyBuilt = (workerConfig, rootConfig = prodRoot) =>
  verifyBuiltConfig(workerConfig, rootConfig);
const withVar = (config, name, value) => ({
  ...config,
  env: { ...config.env, [name]: { type: "text", value } },
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
    ["URL non aggiornato", shopify.replace(/app\.cfready\.it/g, "example.com")],
    ["scope più ampio", shopify.replace("write_validations", "read_orders")],
    ["scope opzionali assenti", shopify.replace(/^optional_scopes.*\n/m, "")],
    [
      "sezione Events assente",
      shopify.replace(/\n\[events\]\napi_version = "unstable"\nsubscription = \[\]\n/, "\n"),
    ],
    [
      "sottoscrizione Events non prevista",
      shopify.replace("subscription = []", '[[events.subscription]]\nhandle = "non-prevista"'),
    ],
  ];
  for (const [name, config] of cases) {
    assert.throws(() => verifyProductionConfig(config), /target Production/, name);
  }
});

test("il preflight rifiuta webhook relativi all'App URL /app", () => {
  assert.throws(
    () =>
      verifyProductionConfig(
        shopify.replace("https://app.cfready.it/webhooks/shop/update", "/webhooks/shop/update"),
      ),
    /\/webhooks\/shop\/update/,
  );
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

// La regressione che conta: senza `--mode prod` la Build Output porta i valori Development e
// `cf deploy --prebuilt` li pubblicherebbe senza dire niente.
test("il preflight riconosce una Build Output costruita senza --mode prod", async () => {
  const builtDevelopment = JSON.stringify(await loadWorkerConfig("dev"));
  assert.doesNotThrow(() => verifyBuilt(builtProduction));
  assert.throws(() => verifyBuilt(builtDevelopment), /build:prod/);
  for (const mode of ["dev", "production", undefined]) {
    assert.throws(
      () => verifyBuilt(builtProduction, JSON.stringify({ buildContext: { mode } })),
      /build:prod/,
    );
  }
});

test("il preflight richiede app.cfready.it come unico ingresso pubblico del Worker", () => {
  const workersDev = { ...JSON.parse(builtProduction), workersDev: true };
  assert.throws(() => verifyBuilt(JSON.stringify(workersDev)), /Production/);

  const withoutCustomDomain = { ...JSON.parse(builtProduction), domains: [] };
  assert.throws(() => verifyBuilt(JSON.stringify(withoutCustomDomain)), /Production/);
});

test("il preflight vieta ALLOWED_SHOP in Production", () => {
  for (const allowed of [
    "cf-ready-dev.myshopify.com",
    "cf-ready-dev.myshopify.com,cf-ready-polaris-2.myshopify.com",
  ]) {
    const restricted = withVar(JSON.parse(builtProduction), "ALLOWED_SHOP", allowed);
    assert.throws(() => verifyBuilt(JSON.stringify(restricted)), /ALLOWED_SHOP/);
  }
});

test("il preflight legge il database Production sbagliato", () => {
  const wrongDatabase = JSON.parse(builtProduction);
  wrongDatabase.env.DB.name = "cf-ready-db-dev";
  assert.throws(() => verifyBuilt(JSON.stringify(wrongDatabase)), /Production/);
});

test("il preflight rifiuta la coda webhook Production sbagliata", () => {
  const wrongQueue = JSON.parse(builtProduction);
  wrongQueue.env.WEBHOOK_QUEUE.name = "cf-ready-webhooks-dev";
  assert.throws(() => verifyBuilt(JSON.stringify(wrongQueue)), /Production/);
});

test("il preflight richiede un solo trigger ogni cinque minuti", () => {
  for (const crons of [["* * * * *"], ["0 * * * *", "*/5 * * * *"]]) {
    const wrong = JSON.parse(builtProduction);
    wrong.triggers = [
      ...crons.map((schedule) => ({ type: "scheduled", schedule })),
      ...wrong.triggers.filter(({ type }) => type !== "scheduled"),
    ];
    assert.throws(() => verifyBuilt(JSON.stringify(wrong)), /Production/);
  }
});

test("la modalità di addebito è dichiarata come la legge il Worker", () => {
  assert.equal(readBillingMode(builtProduction), "di prova");
  const real = withVar(JSON.parse(builtProduction), "BILLING_TEST", "false");
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
