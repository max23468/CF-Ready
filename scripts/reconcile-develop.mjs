export function verifyReconciliation({
  main,
  develop,
  parents,
  mainTree,
  developTree,
  expectedMain,
}) {
  if (
    !/^[0-9a-f]{40}$/.test(main) ||
    !/^[0-9a-f]{40}$/.test(develop) ||
    main !== expectedMain ||
    parents.length !== 2 ||
    parents[1] !== develop ||
    mainTree !== developTree
  ) {
    throw new Error("La promozione non è un fast-forward sicuro per develop.");
  }
}

export function hasReconciliationBypass(ruleset, appId) {
  const actors = ruleset.bypass_actors;
  return (
    Array.isArray(actors) &&
    actors.length === 1 &&
    actors[0].actor_type === "Integration" &&
    actors[0].actor_id === appId &&
    actors[0].bypass_mode === "always"
  );
}

export function verifyProductionDeployment({ run, artifacts, expectedMain }) {
  if (
    run?.path !== ".github/workflows/deploy-production.yml" ||
    run.event !== "workflow_dispatch" ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    run.head_branch !== "main" ||
    run.head_sha !== expectedMain
  ) {
    throw new Error(
      "Il riallineamento richiede un deploy Production verde dello stesso commit main.",
    );
  }
  const receiptName = `deploy-receipt-production-${expectedMain}`;
  if (!artifacts.some(({ name, expired }) => name === receiptName && expired === false)) {
    throw new Error("Manca la ricevuta non scaduta del deploy Production sorgente.");
  }
}

async function request(path, token, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path}: ${response.status}`);
  return response.json();
}

async function main() {
  const { GITHUB_EVENT_NAME: eventName, GITHUB_SHA: expectedMain } = process.env;
  const githubToken = process.env.GITHUB_TOKEN;
  const reconciliationToken = process.env.RECONCILIATION_TOKEN;
  if (!githubToken || !reconciliationToken || !expectedMain) {
    throw new Error("Mancano token o commit atteso per il riallineamento.");
  }
  const repository = process.env.GITHUB_REPOSITORY;
  let sourceRun;
  if (eventName === "workflow_run") {
    if (!/^\d+$/.test(process.env.SOURCE_DEPLOY_RUN_ID ?? "")) {
      throw new Error("Manca l'identificativo del deploy Production sorgente.");
    }
    sourceRun = await request(
      `/repos/${repository}/actions/runs/${process.env.SOURCE_DEPLOY_RUN_ID}`,
      githubToken,
    );
  } else if (eventName === "workflow_dispatch") {
    const runs = await request(
      `/repos/${repository}/actions/workflows/deploy-production.yml/runs?branch=main&status=success&per_page=100`,
      githubToken,
    );
    sourceRun = runs.workflow_runs.find(({ head_sha: headSha }) => headSha === expectedMain);
  } else {
    throw new Error("Evento non autorizzato per il riallineamento.");
  }
  if (!sourceRun) {
    throw new Error("Nessun deploy Production verde trovato per il commit main corrente.");
  }
  const artifactResponse = await request(
    `/repos/${repository}/actions/runs/${sourceRun.id}/artifacts?per_page=100`,
    githubToken,
  );
  verifyProductionDeployment({
    run: sourceRun,
    artifacts: artifactResponse.artifacts,
    expectedMain,
  });
  const [installation, rulesets, mainRef, developRef] = await Promise.all([
    request("/installation", reconciliationToken),
    request(`/repos/${repository}/rulesets`, reconciliationToken),
    request(`/repos/${repository}/git/ref/heads/main`, reconciliationToken),
    request(`/repos/${repository}/git/ref/heads/develop`, reconciliationToken),
  ]);
  const developRuleset = rulesets.find(({ name }) => name === "develop governance");
  const ruleset = await request(
    `/repos/${repository}/rulesets/${developRuleset?.id}`,
    reconciliationToken,
  );
  if (!hasReconciliationBypass(ruleset, installation.app_id)) {
    throw new Error("La GitHub App di riallineamento non è nella bypass list del ruleset develop.");
  }
  const main = await request(
    `/repos/${repository}/git/commits/${mainRef.object.sha}`,
    reconciliationToken,
  );
  const develop = await request(
    `/repos/${repository}/git/commits/${developRef.object.sha}`,
    reconciliationToken,
  );
  verifyReconciliation({
    main: mainRef.object.sha,
    develop: developRef.object.sha,
    parents: main.parents.map(({ sha }) => sha),
    mainTree: main.tree.sha,
    developTree: develop.tree.sha,
    expectedMain,
  });
  await request(`/repos/${repository}/git/refs/heads/develop`, reconciliationToken, {
    method: "PATCH",
    body: JSON.stringify({ sha: mainRef.object.sha, force: false }),
  });
  const readback = await request(`/repos/${repository}/git/ref/heads/develop`, reconciliationToken);
  if (readback.object.sha !== mainRef.object.sha) {
    throw new Error("Il readback non conferma il riallineamento di develop.");
  }
  console.log(`develop riallineato in fast-forward a ${mainRef.object.sha}.`);
}

if (process.env.GITHUB_ACTIONS === "true" && import.meta.main) {
  await main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
