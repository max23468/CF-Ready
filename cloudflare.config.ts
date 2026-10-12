import { bindings, defineConfig, triggers } from "cf/config";

// Fonte canonica della configurazione Workers (ADR 0004). Ogni comando sceglie l'ambiente
// con `--mode dev` o `--mode prod`; `production` è la mode predefinita di `vite build` e
// viene rifiutata, così un build senza `--mode` non porta i valori Development in Production.
// Le migrazioni D1 usano i default di `cf d1 migrations`: cartella `migrations`, tabella
// `d1_migrations`, gli stessi di Wrangler.

// I secret dichiarati arrivano al Worker locale da `.dev.vars` o dal processo e, in deploy,
// ereditano il valore già impostato sul Worker: `cf deploy` si ferma se ne manca uno.
const secrets = (...names: string[]) =>
  Object.fromEntries(names.map((name) => [name, bindings.secret()]));
const runtimeSecrets = secrets(
  "SHOPIFY_API_SECRET",
  "SESSION_ENCRYPTION_KEY",
  "TRIAL_LEDGER_HMAC_KEY",
);

const accountId = "98195e505f42abaaeb4827f71a924b1a";

function webhookQueueTriggers(queue: string) {
  return [
    triggers.queue({
      name: queue,
      deadLetterQueue: `${queue}-failures`,
      maxBatchSize: 1,
      maxBatchTimeout: 1,
      maxRetries: 5,
      retryDelay: 10,
    }),
    triggers.queue({
      name: `${queue}-failures`,
      deadLetterQueue: queue,
      maxBatchSize: 1,
      maxBatchTimeout: 1,
      maxRetries: 100,
      retryDelay: 60,
    }),
  ];
}

const base = {
  compatibilityDate: "2026-10-02",
  compatibilityFlags: ["nodejs_compat"],
  entrypoint: "./workers/app.ts",
  previewUrls: false,
  observability: {
    enabled: true,
    logs: { enabled: true, headSamplingRate: 1, invocationLogs: false },
    traces: { enabled: false },
  },
};

const production = {
  accountId,
  worker: {
    ...base,
    name: "cf-ready-prod",
    workersDev: false,
    domains: ["app.cfready.it"],
    triggers: [
      triggers.scheduled({ schedule: "*/5 * * * *" }),
      ...webhookQueueTriggers("cf-ready-webhooks-prod"),
    ],
    env: {
      SHOPIFY_API_KEY: bindings.text("3640fb39bcf605de0537d6dfc0d01c8a"),
      SHOPIFY_APP_URL: bindings.text("https://app.cfready.it"),
      SCOPES: bindings.text("write_validations"),
      BILLING_TEST: bindings.text("false"),
      ALLOWED_SHOP: bindings.text(""),
      SHOP_UPDATE_ACK_ONLY_SHOP: bindings.text("willardltd.myshopify.com"),
      OWNER_NOTIFICATIONS_ENABLED: bindings.text("true"),
      APP_ENVIRONMENT: bindings.text("production"),
      OWNER_TELEGRAM_CONTROL_ENABLED: bindings.text("true"),
      DB: bindings.d1({ name: "cf-ready-db-prod", id: "6434597c-d683-48d9-a51f-b0d15de6a684" }),
      WEBHOOK_QUEUE: bindings.queue({ name: "cf-ready-webhooks-prod" }),
      CF_VERSION_METADATA: bindings.versionMetadata(),
      ...runtimeSecrets,
      ...secrets(
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_CHAT_ID",
        "TELEGRAM_WEBHOOK_SECRET",
        "TELEGRAM_OWNER_USER_ID",
        "SHOPIFY_PARTNER_ORGANIZATION_ID",
        "SHOPIFY_PARTNER_APP_ID",
        "SHOPIFY_PARTNER_ACCESS_TOKEN",
      ),
    },
  },
};

const development = {
  accountId,
  worker: {
    ...base,
    name: "cf-ready-dev",
    workersDev: true,
    triggers: [
      triggers.scheduled({ schedule: "*/5 * * * *" }),
      ...webhookQueueTriggers("cf-ready-webhooks-dev"),
    ],
    env: {
      SHOPIFY_API_KEY: bindings.text("adff48d4fe4ceb0dadb4734520701dd7"),
      SHOPIFY_APP_URL: bindings.text("https://cf-ready-dev.tmsf.workers.dev"),
      SCOPES: bindings.text("write_validations"),
      ALLOWED_SHOP: bindings.text("cf-ready-dev.myshopify.com,cf-ready-polaris-2.myshopify.com"),
      SHOP_UPDATE_ACK_ONLY_SHOP: bindings.text(""),
      APP_ENVIRONMENT: bindings.text("development"),
      OWNER_TELEGRAM_CONTROL_ENABLED: bindings.text("false"),
      DB: bindings.d1({ name: "cf-ready-db-dev", id: "9490eaea-3a12-465d-bb48-e2622b31fc4d" }),
      WEBHOOK_QUEUE: bindings.queue({ name: "cf-ready-webhooks-dev" }),
      CF_VERSION_METADATA: bindings.versionMetadata(),
      ...runtimeSecrets,
    },
  },
};

export default defineConfig((ctx) => {
  switch (ctx.mode) {
    case "prod":
      return production;
    case "production":
      throw new Error("Mode `production` non valida: usa `--mode prod` o `--mode dev`.");
    default:
      // `dev`, il dev server Vite (`development`), Vitest (`test`) e i comandi API senza mode.
      return development;
  }
});
