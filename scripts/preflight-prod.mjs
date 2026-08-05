import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";

import {
  verifyMigrationSafety,
  verifyNoPendingMigrations,
  verifyWorkerSecrets,
} from "./preflight-dev.mjs";

export { verifyNoPendingMigrations };

const expected = {
  clientId: "3640fb39bcf605de0537d6dfc0d01c8a",
  appUrl: "https://cf-ready-prod.tmsf.workers.dev",
  databaseId: "6434597c-d683-48d9-a51f-b0d15de6a684",
  databaseName: "cf-ready-db-prod",
  queueName: "cf-ready-webhooks-prod",
  failureQueueName: "cf-ready-webhooks-prod-failures",
  workerName: "cf-ready-prod",
};

export function verifyProductionConfig(shopifyConfig) {
  const scopes = shopifyConfig.match(
    /^\[access_scopes\]\s*$[\s\S]*?^scopes\s*=\s*"([^"]*)"\s*$/m,
  )?.[1];
  if (
    !new RegExp(`^client_id\\s*=\\s*"${expected.clientId}"\\s*$`, "m").test(shopifyConfig) ||
    !new RegExp(`^application_url\\s*=\\s*"${escapeUrl(expected.appUrl)}"\\s*$`, "m").test(
      shopifyConfig,
    ) ||
    !new RegExp(
      `^redirect_urls\\s*=\\s*\\[\\s*"${escapeUrl(expected.appUrl)}/auth/callback"\\s*\\]\\s*$`,
      "m",
    ).test(shopifyConfig) ||
    scopes !== "write_validations"
  ) {
    throw new Error("Il target Production non coincide con la configurazione attesa.");
  }
  // Un `shopify app dev` distratto riscriverebbe gli URL dell'app pubblica con un tunnel.
  if (!/^automatically_update_urls_on_dev\s*=\s*false\s*$/m.test(shopifyConfig)) {
    throw new Error("shopify.app.toml deve vietare l'aggiornamento automatico degli URL.");
  }
}

// Il Vite plugin appiattisce l'ambiente **al momento della build**: senza
// CLOUDFLARE_ENV=production il bundle porta i valori Development, e `wrangler deploy`
// li pubblicherebbe sotto il nome sbagliato senza dire niente. È l'unico controllo
// che intercetta l'errore prima che diventi un deploy.
export function verifyBuiltConfig(builtConfig) {
  const built = JSON.parse(builtConfig);
  const database = built.d1_databases?.find(({ binding }) => binding === "DB");
  const queueProducer = built.queues?.producers?.find(({ binding }) => binding === "WEBHOOK_QUEUE");
  const queueConsumer = built.queues?.consumers?.find(({ queue }) => queue === expected.queueName);
  const failureQueueConsumer = built.queues?.consumers?.find(
    ({ queue }) => queue === expected.failureQueueName,
  );
  if (
    built.name !== expected.workerName ||
    built.vars?.SHOPIFY_API_KEY !== expected.clientId ||
    built.vars?.SHOPIFY_APP_URL !== expected.appUrl ||
    built.vars?.SCOPES !== "write_validations" ||
    database?.database_name !== expected.databaseName ||
    database?.database_id !== expected.databaseId ||
    queueProducer?.queue !== expected.queueName ||
    queueConsumer?.max_batch_size !== 1 ||
    queueConsumer?.max_retries !== 5 ||
    queueConsumer?.dead_letter_queue !== expected.failureQueueName ||
    failureQueueConsumer?.max_batch_size !== 1 ||
    failureQueueConsumer?.max_retries !== 100 ||
    failureQueueConsumer?.dead_letter_queue !== expected.queueName
  ) {
    throw new Error(
      "Il bundle non è quello Production: ricostruisci con CLOUDFLARE_ENV=production.",
    );
  }
  // In Development limita l'installazione al dev store, perché il client_id sta in un
  // repository pubblico. In Production deve installare chiunque riceva il link.
  if (built.vars?.ALLOWED_SHOP) {
    throw new Error("ALLOWED_SHOP non deve essere impostata in Production.");
  }
}

// Il deploy dichiara nella ricevuta se il bundle usa addebiti reali o di prova.
export function readBillingMode(builtConfig) {
  return JSON.parse(builtConfig).vars?.BILLING_TEST === "false" ? "reale" : "di prova";
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
  verifyBuiltConfig(await readFile("build/server/wrangler.json", "utf8"));

  const migrationNames = (await readdir("migrations")).filter((name) => name.endsWith(".sql"));
  verifyMigrationSafety(
    await Promise.all(
      migrationNames.map(async (name) => ({
        name,
        sql: await readFile(`migrations/${name}`, "utf8"),
      })),
    ),
  );

  run("node", ["scripts/shopify-info-safe.mjs", "shopify.app.toml"]);

  const d1 = JSON.parse(
    run("npm", ["exec", "--", "wrangler", "d1", "info", expected.databaseName, "--json"], false),
  );
  if (d1.uuid !== expected.databaseId || d1.name !== expected.databaseName) {
    throw new Error("Il database D1 Production non coincide con il target atteso.");
  }

  // Al primo giro il Worker non esiste ancora e `secret list` fallisce. È il caso più
  // probabile per chi legge questo errore, quindi vale la pena distinguerlo.
  const listed = spawnSync(
    "npm",
    [
      "exec",
      "--",
      "wrangler",
      "secret",
      "list",
      "--config",
      "wrangler.json",
      "--env",
      "production",
      "--format",
      "json",
    ],
    { encoding: "utf8", stdio: "pipe" },
  );
  if (listed.status !== 0) {
    throw new Error(
      `Impossibile leggere i secret di ${expected.workerName}. Se il Worker non esiste ancora, ` +
        "lo crea il primo secret: npx wrangler secret put SHOPIFY_API_SECRET --env production",
    );
  }
  verifyWorkerSecrets(JSON.parse(listed.stdout));

  console.log("Preflight Production superato: Shopify, bundle, D1 e secret Worker verificati.");
}

function run(command, args, inherit = true) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
  });
  if (result.status !== 0) {
    throw new Error(`Preflight fallito: ${command} ${args.slice(0, 2).join(" ")}`);
  }
  return result.stdout;
}

if (import.meta.main) await main();
