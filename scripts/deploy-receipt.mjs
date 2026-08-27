import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function createDeployReceipt({
  environment,
  commit,
  sourceCommit = commit,
  tree,
  repository,
  runUrl,
  repositoryVersion,
  shopifyVersion,
  worker,
  shopify,
  rollback,
}) {
  const active = shopify.find(({ status }) => status === "active");
  if (
    !["Development", "Production"].includes(environment) ||
    !/^[0-9a-f]{40}$/.test(commit) ||
    !/^[0-9a-f]{40}$/.test(sourceCommit) ||
    !/^[0-9a-f]{40}$/.test(tree) ||
    !worker.id ||
    worker.versions?.length !== 1 ||
    worker.versions[0].percentage !== 100 ||
    worker.annotations?.["workers/message"] !== `${environment} ${sourceCommit}` ||
    !active?.versionId ||
    active.versionTag !== shopifyVersion ||
    active.message !== `${environment} ${sourceCommit}`
  ) {
    throw new Error("Dati insufficienti per la ricevuta di deploy.");
  }
  return {
    schemaVersion: 1,
    environment,
    repository,
    commit,
    providerSourceCommit: sourceCommit,
    tree,
    repositoryVersion,
    shopifyVersion,
    workflowRun: runUrl,
    createdAt: new Date().toISOString(),
    worker: {
      deploymentId: worker.id,
      versionId: worker.versions[0].version_id,
      percentage: worker.versions[0].percentage,
    },
    shopify: {
      versionId: active.versionId,
      versionTag: active.versionTag,
      message: active.message,
    },
    rollback,
    checks: {
      migrations: "readback-green",
      smoke: "green",
      providerReadback: "green",
    },
  };
}

async function main() {
  const worker = JSON.parse(await readFile(process.env.WORKER_RECEIPT_PATH, "utf8"));
  const shopify = JSON.parse(await readFile(process.env.SHOPIFY_RECEIPT_PATH, "utf8"));
  const receipt = createDeployReceipt({
    environment: process.env.DEPLOY_ENVIRONMENT,
    commit: process.env.GITHUB_SHA,
    sourceCommit: process.env.DEPLOY_SOURCE_COMMIT ?? process.env.GITHUB_SHA,
    tree: process.env.GIT_TREE,
    repository: process.env.GITHUB_REPOSITORY,
    runUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    repositoryVersion: process.env.REPOSITORY_VERSION,
    shopifyVersion: process.env.DEPLOY_VERSION,
    worker,
    shopify,
    rollback: {
      workerVersionId: process.env.ROLLBACK_WORKER_VERSION_ID || null,
      shopifyVersionTag: process.env.ROLLBACK_SHOPIFY_VERSION_TAG || null,
    },
  });
  await writeFile(process.env.DEPLOY_RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`Ricevuta ${receipt.environment} creata per ${receipt.commit}.`);
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) await main();
