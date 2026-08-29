import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  readMigrations,
  run,
  verifyMigrationSafety,
  verifyWorkerSecrets,
} from "./preflight-common.mjs";

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
  const emptyEvents =
    /^\[events\]\s*\napi_version\s*=\s*"unstable"\s*\nsubscription\s*=\s*\[\s*\]\s*$/m.test(
      shopifyConfig,
    );
  if (
    shopifyTargets.some(([config, pattern]) => !pattern.test(config)) ||
    wrangler.name !== expected.workerName ||
    wrangler.vars?.SHOPIFY_API_KEY !== expected.clientId ||
    wrangler.vars?.SHOPIFY_APP_URL !== expected.appUrl ||
    shopifyScopes !== "write_validations" ||
    !emptyEvents ||
    /^\[\[events\.subscription\]\]/m.test(shopifyConfig) ||
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

export function developmentVersion(version, tree) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) || !/^[0-9a-f]{40}$/.test(tree)) {
    throw new Error("Versione repository o tree Git non validi per Development.");
  }
  return `${version}-dev.${tree.slice(0, 12)}`;
}

export function verifyVersionAvailable(versions, version, deployment, commit, tree) {
  if (!versions.some(({ versionTag }) => versionTag === version)) {
    return { readbackOnly: false, deployedCommit: undefined };
  }

  const active = versions.find(({ status }) => status === "active");
  const deployedCommit = active?.message?.match(/^Development ([0-9a-f]{40})$/)?.[1];
  const baseVersion = version.slice(0, version.lastIndexOf("-dev."));
  if (
    commit &&
    tree &&
    version === developmentVersion(baseVersion, tree) &&
    active?.versionTag === version &&
    deployedCommit &&
    deployment.annotations?.["workers/message"] === `Development ${deployedCommit}` &&
    deployment.versions?.length === 1 &&
    deployment.versions[0].percentage === 100
  ) {
    return { readbackOnly: true, deployedCommit };
  }
  throw new Error(`La versione Shopify ${version} è già stata pubblicata.`);
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
  verifyMigrationSafety(await readMigrations());

  run("node", ["scripts/shopify-info-safe.mjs", "shopify.app.dev.toml"]);
  const versions = JSON.parse(
    run("shopify", ["app", "versions", "list", "--config", "dev", "--no-color", "--json"], false),
  );
  const deployment = JSON.parse(
    run("npm", ["exec", "--", "wrangler", "deployments", "status", "--json"], false),
  );
  if (!readbackOnly) {
    const { version } = JSON.parse(await readFile("package.json", "utf8"));
    const tree = process.env.GIT_TREE;
    const deployVersion = process.env.DEPLOY_VERSION ?? developmentVersion(version, tree);
    const availability = verifyVersionAvailable(
      versions,
      deployVersion,
      deployment,
      process.env.GITHUB_SHA,
      tree,
    );
    if (process.env.GITHUB_ENV) {
      await appendFile(
        process.env.GITHUB_ENV,
        `DEPLOY_READBACK_ONLY=${availability.readbackOnly}\n` +
          `DEPLOY_SOURCE_COMMIT=${availability.deployedCommit ?? process.env.GITHUB_SHA}\n`,
      );
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

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) await main();
