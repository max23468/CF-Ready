import { spawnSync } from "node:child_process";
import { appendFile, readFile, readdir } from "node:fs/promises";

const expected = {
  clientId: "adff48d4fe4ceb0dadb4734520701dd7",
  appUrl: "https://cf-ready-dev.tmsf.workers.dev",
  databaseId: "9490eaea-3a12-465d-bb48-e2622b31fc4d",
  databaseName: "cf-ready-db-dev",
  queueName: "cf-ready-webhooks-dev",
  failureQueueName: "cf-ready-webhooks-dev-failures",
  workerName: "cf-ready-dev",
};

export function verifyDevelopmentConfig(shopifyConfig, wranglerConfig) {
  const shopifyTargets = [
    [shopifyConfig, /^client_id\s*=\s*"adff48d4fe4ceb0dadb4734520701dd7"\s*$/m],
    [shopifyConfig, /^application_url\s*=\s*"https:\/\/cf-ready-dev\.tmsf\.workers\.dev"\s*$/m],
  ];
  const wrangler = JSON.parse(wranglerConfig);
  const database = wrangler.d1_databases?.find(({ binding }) => binding === "DB");
  const queueProducer = wrangler.queues?.producers?.find(
    ({ binding }) => binding === "WEBHOOK_QUEUE",
  );
  const queueConsumer = wrangler.queues?.consumers?.find(
    ({ queue }) => queue === expected.queueName,
  );
  const failureQueueConsumer = wrangler.queues?.consumers?.find(
    ({ queue }) => queue === expected.failureQueueName,
  );
  const shopifyScopes = shopifyConfig.match(
    /^\[access_scopes\]\s*$[\s\S]*?^scopes\s*=\s*"([^"]*)"\s*$/m,
  )?.[1];
  if (
    shopifyTargets.some(([config, pattern]) => !pattern.test(config)) ||
    wrangler.name !== expected.workerName ||
    wrangler.vars?.SHOPIFY_API_KEY !== expected.clientId ||
    wrangler.vars?.SHOPIFY_APP_URL !== expected.appUrl ||
    shopifyScopes !== "write_validations" ||
    wrangler.vars?.SCOPES !== shopifyScopes ||
    wrangler.vars?.ALLOWED_SHOP !== "cf-ready-dev.myshopify.com" ||
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
    throw new Error("Il target Development non coincide con la configurazione attesa.");
  }
}

export function verifyVersionAvailable(versions, version, deployment, commit) {
  if (!versions.some(({ versionTag }) => versionTag === version)) return false;

  const active = versions.find(({ status }) => status === "active");
  if (
    commit &&
    active?.versionTag === version &&
    active.message === `Development ${commit}` &&
    deployment.annotations?.["workers/message"] === `Development ${commit}` &&
    deployment.versions?.length === 1 &&
    deployment.versions[0].percentage === 100
  ) {
    return true;
  }
  throw new Error(`La versione Shopify ${version} è già stata pubblicata.`);
}

export function verifyNoPendingMigrations(output) {
  if (!output.includes("No migrations to apply!")) {
    throw new Error("Il readback D1 segnala migrazioni ancora pendenti.");
  }
}

export function verifyMigrationSafety(migrations) {
  const unsafe = migrations.find(
    ({ name, sql }) =>
      name > "0010_privacy_hardening.sql" &&
      /\bDROP\s+(?:TABLE|COLUMN)\b|\bALTER\s+TABLE\b[\s\S]*\bRENAME\b|\bDELETE\s+FROM\b/i.test(sql),
  );
  if (unsafe) {
    throw new Error(`La migrazione ${unsafe.name} richiede un deploy in due fasi.`);
  }
}

export function verifyWorkerSecrets(secrets) {
  const names = new Set(secrets.map(({ name }) => name));
  if (
    !["SHOPIFY_API_SECRET", "SESSION_ENCRYPTION_KEY", "TRIAL_LEDGER_HMAC_KEY"].every((name) =>
      names.has(name),
    )
  ) {
    throw new Error("Mancano secret runtime sul Worker.");
  }
}

export function verifyCoordinatedRollback(deployment, versions) {
  const active = versions.find(({ status }) => status === "active");
  const commit = active?.message?.match(/^Development ([0-9a-f]{40})$/)?.[1];
  const workerMessage = deployment.annotations?.["workers/message"];
  const secretOnly = deployment.annotations?.["workers/triggered_by"] === "secret";
  if (
    !deployment.id ||
    deployment.versions?.length !== 1 ||
    deployment.versions[0].percentage !== 100 ||
    !active?.versionId ||
    !active.versionTag ||
    !commit ||
    (!secretOnly && !workerMessage?.includes(commit.slice(0, 7)))
  ) {
    throw new Error("Il Worker attivo non coincide con la versione Shopify Development attiva.");
  }
  return {
    deploymentId: deployment.id,
    workerVersionId: deployment.versions[0].version_id,
    shopifyVersionId: active.versionId,
    shopifyVersionTag: active.versionTag,
    commit,
  };
}

async function main() {
  const readbackOnly = process.argv.includes("--readback-only");
  const shopifyConfig = await readFile("shopify.app.dev.toml", "utf8");
  const wranglerConfig = await readFile("wrangler.json", "utf8");
  verifyDevelopmentConfig(shopifyConfig, wranglerConfig);
  const migrationNames = (await readdir("migrations")).filter((name) => name.endsWith(".sql"));
  verifyMigrationSafety(
    await Promise.all(
      migrationNames.map(async (name) => ({
        name,
        sql: await readFile(`migrations/${name}`, "utf8"),
      })),
    ),
  );

  run("node", ["scripts/shopify-info-safe.mjs", "shopify.app.dev.toml"]);
  const versions = JSON.parse(
    run("shopify", ["app", "versions", "list", "--config", "dev", "--no-color", "--json"], false),
  );
  const deployment = JSON.parse(
    run("npm", ["exec", "--", "wrangler", "deployments", "status", "--json"], false),
  );
  if (!readbackOnly) {
    const { version } = JSON.parse(await readFile("package.json", "utf8"));
    const deployReadbackOnly = verifyVersionAvailable(
      versions,
      version,
      deployment,
      process.env.GITHUB_SHA,
    );
    if (process.env.GITHUB_ENV) {
      await appendFile(process.env.GITHUB_ENV, `DEPLOY_READBACK_ONLY=${deployReadbackOnly}\n`);
    }
  }
  verifyCoordinatedRollback(deployment, versions);
  const d1 = JSON.parse(
    run("npm", ["exec", "--", "wrangler", "d1", "info", expected.databaseName, "--json"], false),
  );
  if (d1.uuid !== expected.databaseId || d1.name !== expected.databaseName) {
    throw new Error("Il database D1 Development non coincide con il target atteso.");
  }
  const secrets = JSON.parse(
    run("npm", ["exec", "--", "wrangler", "secret", "list", "--format", "json"], false),
  );
  verifyWorkerSecrets(secrets);

  console.log(
    `${readbackOnly ? "Readback" : "Preflight"} Development superato: Shopify, D1 e secret Worker verificati.`,
  );
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
