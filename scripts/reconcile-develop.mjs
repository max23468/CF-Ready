export function verifyReconciliation({ main, develop, parents, mainTree, developTree }) {
  if (
    !/^[0-9a-f]{40}$/.test(main) ||
    !/^[0-9a-f]{40}$/.test(develop) ||
    parents.length !== 2 ||
    parents[1] !== develop ||
    mainTree !== developTree
  ) {
    throw new Error("La promozione non è un fast-forward sicuro per develop.");
  }
}

export function hasReconciliationBypass(ruleset, appId) {
  return ruleset.bypass_actors?.some(
    ({ actor_id: actorId, actor_type: actorType, bypass_mode: bypassMode }) =>
      actorType === "Integration" && actorId === appId && bypassMode === "always",
  );
}

async function request(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${process.env.RECONCILIATION_TOKEN}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path}: ${response.status}`);
  return response.json();
}

async function main() {
  if (!process.env.RECONCILIATION_TOKEN) {
    throw new Error("Manca il token della GitHub App dedicata al riallineamento.");
  }
  const repository = process.env.GITHUB_REPOSITORY;
  const [installation, rulesets, mainRef, developRef] = await Promise.all([
    request("/installation"),
    request(`/repos/${repository}/rulesets`),
    request(`/repos/${repository}/git/ref/heads/main`),
    request(`/repos/${repository}/git/ref/heads/develop`),
  ]);
  const developRuleset = rulesets.find(({ name }) => name === "develop governance");
  const ruleset = await request(`/repos/${repository}/rulesets/${developRuleset?.id}`);
  if (!hasReconciliationBypass(ruleset, installation.app_id)) {
    throw new Error("La GitHub App di riallineamento non è nella bypass list del ruleset develop.");
  }
  const main = await request(`/repos/${repository}/git/commits/${mainRef.object.sha}`);
  const develop = await request(`/repos/${repository}/git/commits/${developRef.object.sha}`);
  verifyReconciliation({
    main: mainRef.object.sha,
    develop: developRef.object.sha,
    parents: main.parents.map(({ sha }) => sha),
    mainTree: main.tree.sha,
    developTree: develop.tree.sha,
  });
  await request(`/repos/${repository}/git/refs/heads/develop`, {
    method: "PATCH",
    body: JSON.stringify({ sha: mainRef.object.sha, force: false }),
  });
  const readback = await request(`/repos/${repository}/git/ref/heads/develop`);
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
