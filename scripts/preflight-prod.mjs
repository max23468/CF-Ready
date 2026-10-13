import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  readMigrations,
  readMigrationPolicy,
  run,
  sharesWorkerTopology,
  verifyMigrationSafety,
  verifyQueueJurisdiction,
  verifyWebhookUris,
  verifyWorkerSecrets,
  workerTargets,
} from "./preflight-common.mjs";

export const buildOutput = {
  root: ".cloudflare/output/v0/config.json",
  worker: ".cloudflare/output/v0/workers/default/worker.config.json",
};

const expected = {
  clientId: "3640fb39bcf605de0537d6dfc0d01c8a",
  appUrl: "https://app.cfready.it",
  databaseId: "6434597c-d683-48d9-a51f-b0d15de6a684",
  databaseName: "cf-ready-db-prod",
  queueName: "cf-ready-webhooks-prod-eu",
  failureQueueName: "cf-ready-webhooks-prod-eu-failures",
  workerName: "cf-ready-prod",
};

export function verifyProductionConfig(shopifyConfig) {
  const scopes = shopifyConfig.match(
    /^\[access_scopes\]\s*$[\s\S]*?^scopes\s*=\s*"([^"]*)"\s*$/m,
  )?.[1];
  const optionalScopes = shopifyConfig
    .match(/^optional_scopes\s*=\s*\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]\s*$/m)
    ?.slice(1);
  const emptyEvents =
    /^\[events\]\s*\napi_version\s*=\s*"unstable"\s*\nsubscription\s*=\s*\[\s*\]\s*$/m.test(
      shopifyConfig,
    );
  if (
    !new RegExp(`^client_id\\s*=\\s*"${expected.clientId}"\\s*$`, "m").test(shopifyConfig) ||
    !new RegExp(`^application_url\\s*=\\s*"${escapeUrl(expected.appUrl)}/app"\\s*$`, "m").test(
      shopifyConfig,
    ) ||
    !new RegExp(
      `^redirect_urls\\s*=\\s*\\[\\s*"${escapeUrl(expected.appUrl)}/auth/callback"\\s*\\]\\s*$`,
      "m",
    ).test(shopifyConfig) ||
    scopes !== "write_validations" ||
    optionalScopes?.join(",") !== "write_translations,read_locales,read_markets" ||
    !emptyEvents ||
    /^\[\[events\.subscription\]\]/m.test(shopifyConfig)
  ) {
    throw new Error("Il target Production non coincide con la configurazione attesa.");
  }
  verifyWebhookUris(shopifyConfig, expected.appUrl);
  // Un `shopify app dev` distratto riscriverebbe gli URL dell'app pubblica con un tunnel.
  if (!/^automatically_update_urls_on_dev\s*=\s*false\s*$/m.test(shopifyConfig)) {
    throw new Error("shopify.app.toml deve vietare l'aggiornamento automatico degli URL.");
  }
}

// La Vite plugin fissa l'ambiente **al momento della build**: senza `--mode prod` la Build
// Output porta i valori Development, e `cf deploy --prebuilt` li pubblicherebbe. È l'unico
// controllo che intercetta l'errore prima che diventi un deploy.
export function verifyBuiltConfig(workerConfig, rootConfig) {
  const targets = workerTargets(JSON.parse(workerConfig));
  if (
    JSON.parse(rootConfig).buildContext?.mode !== "prod" ||
    !sharesWorkerTopology(targets, expected) ||
    targets.sendsEmail ||
    // Un solo trigger: il tick delle :00 esegue la retention, gli altri il ciclo owner.
    JSON.stringify(targets.crons) !== '["*/5 * * * *"]' ||
    !["true", "false"].includes(targets.vars.OWNER_NOTIFICATIONS_ENABLED) ||
    !["true", "false"].includes(targets.vars.OWNER_TELEGRAM_CONTROL_ENABLED) ||
    targets.vars.APP_ENVIRONMENT !== "production" ||
    // D-151: l'app Production risponde solo sul dominio personalizzato dichiarato qui.
    targets.workersDev !== false ||
    !targets.domains.includes(new URL(expected.appUrl).host)
  ) {
    throw new Error(
      "La Build Output non è quella Production: ricostruisci con `npm run build:prod`.",
    );
  }
  // In Development limita l'installazione al dev store, perché il client_id sta in un
  // repository pubblico. In Production deve installare chiunque riceva il link.
  if (targets.vars.ALLOWED_SHOP) {
    throw new Error("ALLOWED_SHOP non deve essere impostata in Production.");
  }
}

// Il deploy dichiara nella ricevuta se il bundle usa addebiti reali o di prova.
export function readBillingMode(workerConfig) {
  return workerTargets(JSON.parse(workerConfig)).vars.BILLING_TEST === "false"
    ? "reale"
    : "di prova";
}

// Al primo deploy Production non esiste niente da ripristinare. Il caso va riconosciuto,
// non aggirato: senza rollback armato il deploy prosegue e lo dichiara.
export function readRollbackTarget(deployment) {
  const version = deployment?.versions?.[0];
  if (!deployment?.id || !version?.version_id) return null;
  return { deploymentId: deployment.id, workerVersionId: version.version_id };
}

function escapeUrl(url) {
  return url.replaceAll(".", "\\.").replaceAll("/", "\\/");
}

async function main() {
  const shopifyConfig = await readFile("shopify.app.toml", "utf8");
  verifyProductionConfig(shopifyConfig);
  const workerConfig = await readFile(buildOutput.worker, "utf8");
  verifyBuiltConfig(workerConfig, await readFile(buildOutput.root, "utf8"));

  verifyMigrationSafety(await readMigrations(), await readMigrationPolicy());

  run("node", ["scripts/shopify-info-safe.mjs", "shopify.app.toml"]);

  verifyQueueJurisdiction(
    JSON.parse(run("npm", ["exec", "--", "cf", "queues", "list"], false)),
    [expected.queueName, expected.failureQueueName],
    { allowMissing: true },
  );
  const d1 = JSON.parse(run("npm", ["exec", "--", "cf", "d1", "get", expected.databaseId], false));
  if (
    d1.uuid !== expected.databaseId ||
    d1.name !== expected.databaseName ||
    d1.jurisdiction !== "eu"
  ) {
    throw new Error("Il database D1 Production non coincide con il target atteso.");
  }

  // Al primo giro il Worker non esiste ancora e `secrets list` fallisce. È il caso più
  // probabile per chi legge questo errore, quindi vale la pena distinguerlo.
  const listed = spawnSync(
    "npm",
    ["exec", "--", "cf", "workers", "secrets", "list", "--worker", expected.workerName],
    { encoding: "utf8", stdio: "pipe" },
  );
  if (listed.status !== 0) {
    throw new Error(
      `Impossibile leggere i secret di ${expected.workerName}. Se il Worker non esiste ancora, ` +
        "lo crea il primo deploy con i secret: cf deploy --prebuilt --mode prod --secrets-file <file>",
    );
  }
  const { vars } = workerTargets(JSON.parse(workerConfig));
  verifyWorkerSecrets(JSON.parse(listed.stdout), {
    ownerNotifications: vars.OWNER_NOTIFICATIONS_ENABLED === "true",
    ownerControl: vars.OWNER_TELEGRAM_CONTROL_ENABLED === "true",
  });

  console.log(
    "Preflight Production superato: Shopify, Build Output, code, D1 e secret Worker verificati.",
  );
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) await main();
