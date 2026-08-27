import { pathToFileURL } from "node:url";

const EXPECTED_RULESET_NAME = "develop governance";

export function reconciliationActorId(value) {
  if (!/^\d+$/.test(value ?? "")) {
    throw new Error("Manca l'actor ID valido per il riallineamento.");
  }
  const actorId = Number(value);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) {
    throw new Error("Manca l'actor ID valido per il riallineamento.");
  }
  return actorId;
}

export function verifyReconciliationRuleset(ruleset, expectedActorId) {
  const actors = ruleset?.bypass_actors;
  const actor = actors?.[0];
  if (
    ruleset?.name !== EXPECTED_RULESET_NAME ||
    ruleset.enforcement !== "active" ||
    ruleset.target !== "branch" ||
    !Array.isArray(actors) ||
    actors.length !== 1 ||
    actor.actor_id !== expectedActorId ||
    actor.actor_type !== "Integration" ||
    actor.bypass_mode !== "always"
  ) {
    throw new Error(
      "Il ruleset develop non espone la sola GitHub App di riallineamento come bypass.",
    );
  }
}

async function request(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return response.json();
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.RECONCILIATION_TOKEN;
  const actorId = reconciliationActorId(process.env.RECONCILIATION_ACTOR_ID);
  if (!repository || !token) {
    throw new Error("Mancano repository o token per verificare il ruleset develop.");
  }
  const rulesets = await request(`/repos/${repository}/rulesets`, token);
  const rulesetId = rulesets.find(({ name }) => name === EXPECTED_RULESET_NAME)?.id;
  if (!rulesetId) throw new Error("Il ruleset develop governance non è attivo nel repository.");
  const ruleset = await request(`/repos/${repository}/rulesets/${rulesetId}`, token);
  verifyReconciliationRuleset(ruleset, actorId);
  console.log("Ruleset develop verificato con un solo bypass Integration autorizzato.");
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (process.env.GITHUB_ACTIONS === "true" && isDirectExecution) {
  await main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
