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

export function verifyRecoveryReconciliation({
  main,
  develop,
  parents,
  mainTree,
  promotedDevelop,
  promotedDevelopTree,
  comparison,
  expectedMain,
}) {
  if (
    main !== expectedMain ||
    parents.length !== 2 ||
    parents[1] !== promotedDevelop ||
    mainTree !== promotedDevelopTree ||
    develop === promotedDevelop ||
    comparison?.status !== "ahead" ||
    comparison.ahead_by < 1 ||
    comparison.merge_base_commit?.sha !== promotedDevelop
  ) {
    throw new Error("Il recupero non può riallineare in sicurezza l'ascendenza di develop.");
  }
}

export function verifyManualAncestryRecovery({ eventName, ...recovery }) {
  if (eventName !== "workflow_dispatch") {
    throw new Error("Il recupero di sola ascendenza richiede un avvio manuale.");
  }
  verifyRecoveryReconciliation(recovery);
}

export function verifyReconciliationApp({ actualSlug, expectedSlug }) {
  if (!expectedSlug || actualSlug !== expectedSlug) {
    throw new Error("Il token non appartiene alla GitHub App di riallineamento attesa.");
  }
}

export function expectedMainSha({ eventName, sourceDeploySha, mainRefSha }) {
  const expected = eventName === "workflow_run" ? sourceDeploySha : mainRefSha;
  if (
    !["workflow_run", "workflow_dispatch"].includes(eventName) ||
    !/^[0-9a-f]{40}$/.test(expected ?? "")
  ) {
    throw new Error("Evento o commit main atteso non valido per il riallineamento.");
  }
  return expected;
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

export function verifyPagesDeployment({ run, expectedMain }) {
  if (
    run?.path !== ".github/workflows/deploy-pages-production.yml" ||
    run.event !== "workflow_dispatch" ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    run.head_branch !== "main" ||
    run.head_sha !== expectedMain
  ) {
    throw new Error(
      "Il riallineamento richiede un deploy Pages Production verde dello stesso commit main.",
    );
  }
}

export function verifyReconciliationDeployment({ run, artifacts = [], expectedMain }) {
  if (run?.path === ".github/workflows/deploy-production.yml") {
    verifyProductionDeployment({ run, artifacts, expectedMain });
    return;
  }
  if (run?.path === ".github/workflows/deploy-pages-production.yml") {
    verifyPagesDeployment({ run, expectedMain });
    return;
  }
  throw new Error("Il workflow sorgente non è un deploy riconosciuto.");
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
  const eventName = process.env.GITHUB_EVENT_NAME;
  const githubToken = process.env.GITHUB_TOKEN;
  const reconciliationToken = process.env.RECONCILIATION_TOKEN;
  verifyReconciliationApp({
    actualSlug: process.env.RECONCILIATION_APP_SLUG,
    expectedSlug: process.env.EXPECTED_RECONCILIATION_APP_SLUG,
  });
  if (!githubToken || !reconciliationToken) {
    throw new Error("Mancano i token per il riallineamento.");
  }
  const repository = process.env.GITHUB_REPOSITORY;
  const observedMainRef = await request(`/repos/${repository}/git/ref/heads/main`, githubToken);
  const expectedMain = expectedMainSha({
    eventName,
    sourceDeploySha: process.env.SOURCE_DEPLOY_SHA,
    mainRefSha: observedMainRef.object.sha,
  });
  const [mainRef, developRef] = await Promise.all([
    request(`/repos/${repository}/git/ref/heads/main`, reconciliationToken),
    request(`/repos/${repository}/git/ref/heads/develop`, reconciliationToken),
  ]);
  const main = await request(
    `/repos/${repository}/git/commits/${mainRef.object.sha}`,
    reconciliationToken,
  );
  const develop = await request(
    `/repos/${repository}/git/commits/${developRef.object.sha}`,
    reconciliationToken,
  );
  let targetSha = mainRef.object.sha;
  let directReconciliation = true;
  try {
    verifyReconciliation({
      main: mainRef.object.sha,
      develop: developRef.object.sha,
      parents: main.parents.map(({ sha }) => sha),
      mainTree: main.tree.sha,
      developTree: develop.tree.sha,
      expectedMain,
    });
  } catch {
    directReconciliation = false;
  }

  if (directReconciliation) {
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
      const [productionRuns, pagesRuns] = await Promise.all([
        request(
          `/repos/${repository}/actions/workflows/deploy-production.yml/runs?branch=main&status=success&per_page=100`,
          githubToken,
        ),
        request(
          `/repos/${repository}/actions/workflows/deploy-pages-production.yml/runs?branch=main&status=success&per_page=100`,
          githubToken,
        ),
      ]);
      sourceRun = [...productionRuns.workflow_runs, ...pagesRuns.workflow_runs].find(
        ({ head_sha: headSha }) => headSha === expectedMain,
      );
    }
    if (!sourceRun) {
      throw new Error("Nessun deploy verde trovato per il commit main corrente.");
    }
    const artifacts =
      sourceRun.path === ".github/workflows/deploy-production.yml"
        ? (
            await request(
              `/repos/${repository}/actions/runs/${sourceRun.id}/artifacts?per_page=100`,
              githubToken,
            )
          ).artifacts
        : [];
    verifyReconciliationDeployment({
      run: sourceRun,
      artifacts,
      expectedMain,
    });
  } else {
    const promotedDevelopSha = main.parents[1]?.sha;
    if (!/^[0-9a-f]{40}$/.test(promotedDevelopSha ?? "")) {
      throw new Error("Il merge main non espone il parent develop promosso.");
    }
    const [promotedDevelop, comparison] = await Promise.all([
      request(`/repos/${repository}/git/commits/${promotedDevelopSha}`, reconciliationToken),
      request(
        `/repos/${repository}/compare/${promotedDevelopSha}...${developRef.object.sha}`,
        reconciliationToken,
      ),
    ]);
    verifyManualAncestryRecovery({
      eventName,
      main: mainRef.object.sha,
      develop: developRef.object.sha,
      parents: main.parents.map(({ sha }) => sha),
      mainTree: main.tree.sha,
      promotedDevelop: promotedDevelopSha,
      promotedDevelopTree: promotedDevelop.tree.sha,
      comparison,
      expectedMain,
    });
    const recoveryCommit = await request(`/repos/${repository}/git/commits`, reconciliationToken, {
      method: "POST",
      body: JSON.stringify({
        message: "chore: recover develop ancestry after main promotion",
        tree: develop.tree.sha,
        parents: [developRef.object.sha, mainRef.object.sha],
      }),
    });
    targetSha = recoveryCommit.sha;
  }
  await request(`/repos/${repository}/git/refs/heads/develop`, reconciliationToken, {
    method: "PATCH",
    body: JSON.stringify({ sha: targetSha, force: false }),
  });
  const readback = await request(`/repos/${repository}/git/ref/heads/develop`, reconciliationToken);
  if (readback.object.sha !== targetSha) {
    throw new Error("Il readback non conferma il riallineamento di develop.");
  }
  console.log(`develop riallineato in fast-forward a ${targetSha}.`);
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (process.env.GITHUB_ACTIONS === "true" && isDirectExecution) {
  await main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
import { pathToFileURL } from "node:url";
