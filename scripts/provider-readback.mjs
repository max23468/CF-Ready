import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function verifyShopifyReadback(versions, { environment, version, sourceCommit }) {
  const active = versions.find(({ status }) => status === "active");
  if (active?.versionTag !== version || active.message !== `${environment} ${sourceCommit}`) {
    throw new Error(`Readback Shopify ${environment} non riuscito.`);
  }
  return active;
}

export function verifyWorkerReadback(deployment, { environment, sourceCommit }) {
  if (
    !deployment.id ||
    deployment.annotations?.["workers/message"] !== `${environment} ${sourceCommit}` ||
    deployment.versions?.length !== 1 ||
    deployment.versions[0].percentage !== 100 ||
    !deployment.versions[0].version_id
  ) {
    throw new Error(`Readback Worker ${environment} non riuscito.`);
  }
  return {
    deploymentId: deployment.id,
    versionId: deployment.versions[0].version_id,
  };
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variabile ${name} mancante per il readback provider.`);
  return value;
}

function appendSummary(line) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path) appendFileSync(path, `${line}\n`);
}

function main() {
  const [provider, inputPath] = process.argv.slice(2);
  const environment = requiredEnvironment("DEPLOY_ENVIRONMENT");
  const sourceCommit = requiredEnvironment("DEPLOY_SOURCE_COMMIT");
  const input = JSON.parse(readFileSync(inputPath, "utf8"));

  if (provider === "shopify") {
    const active = verifyShopifyReadback(input, {
      environment,
      version: requiredEnvironment("DEPLOY_VERSION"),
      sourceCommit,
    });
    const source = environment === "Development" ? `, commit sorgente \`${sourceCommit}\`` : "";
    appendSummary(
      `- Shopify attivo: versione \`${active.versionTag}\` (\`${active.versionId}\`)${source}`,
    );
    console.log(`Versione attiva verificata: ${active.versionTag} (${active.versionId})`);
    return;
  }

  if (provider === "worker") {
    const worker = verifyWorkerReadback(input, { environment, sourceCommit });
    appendSummary(
      `- Worker pubblicato: deployment \`${worker.deploymentId}\`, versione \`${worker.versionId}\``,
    );
    console.log(`Worker verificato: ${worker.deploymentId} (${worker.versionId})`);
    return;
  }

  throw new Error("Provider readback non valido: usare shopify oppure worker.");
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
