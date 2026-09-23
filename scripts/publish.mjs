import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { changedFiles, classifyCiLane } from "./ci-lane.mjs";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
// I test sostituiscono GitHub con provider sintetici e non devono attendere i tempi reali.
const pollIntervalMs = Number(process.env.CF_READY_PUBLISH_POLL_MS) || 5_000;

function execute(command, args, { interactive = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: interactive ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} non riuscito: ${(result.stderr || result.stdout || "").trim()}`,
    );
  }
  return result;
}

function output(command, args) {
  return execute(command, args).stdout.trim();
}

function json(command, args) {
  return JSON.parse(output(command, args));
}

export function parseTarget(args) {
  const index = args.indexOf("--target");
  const target = index >= 0 ? args[index + 1] : "";
  if (!new Set(["development", "production"]).has(target)) {
    throw new Error("Usa --target development oppure --target production.");
  }
  return target;
}

export function selectWorkflowRun(runs, sha) {
  const latest = latestWorkflowRun(runs, sha);
  return latest?.conclusion === "success" || latest?.status !== "completed" ? latest : undefined;
}

export function latestWorkflowRun(runs, sha, afterDatabaseId = 0) {
  return runs
    .filter((run) => run.headSha === sha)
    .filter((run) => run.databaseId > afterDatabaseId)
    .sort((left, right) => right.databaseId - left.databaseId)[0];
}

export function localGateCommands(lane, baseSha, headSha) {
  if (lane === "docs") return [["npm", ["run", "check:docs"]]];
  return [
    ["npm", ["run", `check:ci-${lane}`]],
    ["npm", ["run", "coverage:check", "--", "--base-sha", baseSha, "--head-sha", headSha]],
  ];
}

// gh elenca solo i check già registrati: un job che parte tardi, come l'aggregato
// mutation, manca finché non inizia e va atteso secondo il ruleset.
export function checksOutcome(checks, required = []) {
  const failed = checks.filter(({ bucket }) => bucket === "fail" || bucket === "cancel");
  if (failed.length > 0) return { state: "failed", names: failed.map(({ name }) => name) };
  const reported = new Set(checks.map(({ name }) => name));
  const missing = required.filter((name) => !reported.has(name));
  if (
    checks.length === 0 ||
    missing.length > 0 ||
    checks.some(({ bucket }) => bucket === "pending")
  ) {
    return { state: "pending", names: missing };
  }
  return { state: "passed", names: [] };
}

function requiredCheckNames(branch) {
  return json("gh", ["api", `repos/{owner}/{repo}/rules/branches/${branch}`])
    .filter(({ type }) => type === "required_status_checks")
    .flatMap(({ parameters }) => parameters.required_status_checks.map(({ context }) => context));
}

export function isPipelineBusy({ promotions, runs }) {
  return promotions.length > 0 || runs.some(({ status }) => status !== "completed");
}

export function isReconciled({ mainSha, developSha, mergeBase }) {
  return mainSha === developSha || mergeBase === mainSha;
}

function repository() {
  return json("gh", ["repo", "view", "--json", "nameWithOwner"]).nameWithOwner;
}

function pullRequests(branch, base) {
  return json("gh", [
    "pr",
    "list",
    "--head",
    branch,
    "--base",
    base,
    "--state",
    "all",
    "--limit",
    "20",
    "--json",
    "number,state,headRefOid,mergeCommit,url",
  ]);
}

function pullRequest(number) {
  return json("gh", [
    "pr",
    "view",
    String(number),
    "--json",
    "number,state,headRefOid,mergeCommit,url",
  ]);
}

async function waitForMerge(number, attempts = 360) {
  let lastState = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = pullRequest(number);
    if (current.state === "MERGED" && current.mergeCommit?.oid) return current;
    if (current.state !== "OPEN") throw new Error(`La PR #${number} è ${current.state}.`);
    if (current.state !== lastState) {
      console.log(`PR #${number}: attendo gate, review e merge automatico.`);
      lastState = current.state;
    }
    await wait(pollIntervalMs);
  }
  throw new Error(`Timeout in attesa del merge della PR #${number}.`);
}

// Stessi comandi dei job verify e coverage della CI, prima che il push li renda remoti.
function runLocalGate(branch, sourceSha) {
  execute("git", ["fetch", "--quiet", "origin", "develop"]);
  const baseSha = output("git", ["merge-base", "origin/develop", sourceSha]);
  const { lane } = classifyCiLane(changedFiles(baseSha, sourceSha), {
    base: "develop",
    head: branch,
    eventName: "pull_request",
  });
  console.log(`Gate locale della corsia ${lane} prima del push.`);
  for (const [command, args] of localGateCommands(lane, baseSha, sourceSha)) {
    execute(command, args, { interactive: true });
  }
}

async function waitForRequiredChecks(number, base, attempts = 720) {
  const required = requiredCheckNames(base);
  let announced = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = execute(
      "gh",
      ["pr", "checks", String(number), "--required", "--json", "name,bucket"],
      { allowFailure: true },
    );
    // gh esce con 8 per i check pendenti, con 1 per quelli falliti o ancora non registrati.
    if (
      ![0, 1, 8].includes(result.status) ||
      (result.status === 1 &&
        !result.stdout.trim() &&
        !/no (?:required )?checks reported/i.test(result.stderr))
    ) {
      throw new Error(`gh pr checks ${number} non riuscito: ${result.stderr.trim()}`);
    }
    const outcome = checksOutcome(JSON.parse(result.stdout.trim() || "[]"), required);
    if (outcome.state === "passed") return;
    if (outcome.state === "failed") {
      throw new Error(`La PR #${number} ha check falliti: ${outcome.names.join(", ")}.`);
    }
    if (!announced) {
      console.log(`PR #${number}: attendo i check obbligatori.`);
      announced = true;
    }
    await wait(pollIntervalMs);
  }
  throw new Error(`Timeout in attesa dei check della PR #${number}.`);
}

// Un merge su develop durante il deploy o la promozione di un'altra pubblicazione
// fa avanzare develop sotto quel ciclo: si entra solo a pipeline libera.
async function waitForIdlePipeline(attempts = 720) {
  let announced = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const promotions = json("gh", [
      "pr",
      "list",
      "--head",
      "develop",
      "--base",
      "main",
      "--state",
      "open",
      "--json",
      "number",
    ]);
    const runs = [
      "deploy-development.yml",
      "deploy-production.yml",
      "deploy-pages-production.yml",
    ].flatMap((workflow) =>
      json("gh", ["run", "list", "--workflow", workflow, "--limit", "5", "--json", "status"]),
    );
    if (!isPipelineBusy({ promotions, runs })) return;
    if (!announced) {
      console.log("Attendo la fine della pubblicazione già in corso prima del merge.");
      announced = true;
    }
    await wait(pollIntervalMs);
  }
  throw new Error("Timeout in attesa che promozione e deploy in corso terminino.");
}

// Dopo il push GitHub aggiorna l'HEAD di una PR già aperta con qualche secondo di
// ritardo: non va ricreata, né letta sui check verdi del commit precedente.
async function pullRequestForHead(branch, base, sha, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidates = pullRequests(branch, base);
    const current = candidates.find((pr) => pr.headRefOid === sha);
    if (current) return current;
    if (!candidates.some((pr) => pr.state === "OPEN")) return undefined;
    await wait(pollIntervalMs);
  }
  throw new Error(`La PR aperta per ${branch} non riporta ancora l'HEAD ${sha}.`);
}

async function ensurePullRequest({ branch, base, sourceSha, mergeMethod, title, body }) {
  let current = pullRequests(branch, base).find((pr) => pr.headRefOid === sourceSha);
  if (current?.state === "MERGED") return current;
  if (!current && base === "develop") {
    execute("git", ["push", "--set-upstream", "origin", branch], { interactive: true });
    current = await pullRequestForHead(branch, base, sourceSha);
  }
  if (!current) {
    if (base === "develop") {
      const url = output("gh", ["pr", "create", "--base", base, "--head", branch, "--fill"]);
      current = pullRequest(url);
    } else {
      const url = output("gh", [
        "pr",
        "create",
        "--base",
        base,
        "--head",
        branch,
        "--title",
        title,
        "--body",
        body,
      ]);
      current = pullRequest(url);
    }
  }
  if (base === "develop") {
    await waitForRequiredChecks(current.number, base);
    await waitForIdlePipeline();
  }
  execute("gh", ["pr", "merge", String(current.number), "--auto", `--${mergeMethod}`]);
  return waitForMerge(current.number);
}

// gh pr merge --delete-branch cancellerebbe anche il branch locale e sposterebbe il
// checkout su develop: un retry dopo un deploy fallito non troverebbe più la modifica.
function deleteRemoteBranch(branch) {
  const remote = output("git", ["ls-remote", "--heads", "origin", branch]);
  if (remote) execute("git", ["push", "--quiet", "origin", "--delete", branch]);
}

function workflowRuns(workflow, branch, sha) {
  return json("gh", [
    "run",
    "list",
    "--workflow",
    workflow,
    "--branch",
    branch,
    "--commit",
    sha,
    "--limit",
    "20",
    "--json",
    "databaseId,status,conclusion,headSha,url",
  ]);
}

async function ensureWorkflow(
  { workflow, branch, sha, inputs = {}, fresh = false },
  attempts = 240,
) {
  const initialRuns = workflowRuns(workflow, branch, sha);
  // fresh ignora i run già riusciti: serve quando lo stato da verificare è cambiato
  // dopo quel run pur restando sullo stesso commit del branch.
  let run = fresh ? undefined : selectWorkflowRun(initialRuns, sha);
  let afterDatabaseId = 0;
  if (!run) {
    afterDatabaseId = latestWorkflowRun(initialRuns, sha)?.databaseId ?? 0;
    const remoteSha = output("git", ["ls-remote", "origin", `refs/heads/${branch}`]).split(
      /\s+/,
    )[0];
    if (remoteSha !== sha) {
      throw new Error(`${branch} è avanzato prima dell'avvio di ${workflow}.`);
    }
    execute("gh", [
      "workflow",
      "run",
      workflow,
      "--ref",
      branch,
      ...Object.entries(inputs).flatMap(([name, value]) => ["-f", `${name}=${value}`]),
    ]);
    console.log(`${workflow}: avviato per ${sha}.`);
  }
  let lastStatus = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    run = latestWorkflowRun(workflowRuns(workflow, branch, sha), sha, afterDatabaseId);
    if (run?.conclusion === "success") return run;
    if (run?.status === "completed") {
      throw new Error(`${workflow} concluso con ${run.conclusion}: ${run.url}`);
    }
    const status = run?.status ?? "in attesa di registrazione";
    if (status !== lastStatus) {
      console.log(`${workflow}: ${status}.`);
      lastStatus = status;
    }
    await wait(pollIntervalMs);
  }
  throw new Error(`Timeout in attesa di ${workflow} per ${sha}.`);
}

function gitSha(ref) {
  return output("git", ["rev-parse", ref]);
}

function gitTree(ref) {
  return output("git", ["rev-parse", `${ref}^{tree}`]);
}

function isAncestor(ancestor, descendant) {
  const result = execute("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
    allowFailure: true,
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`git merge-base --is-ancestor non riuscito: ${result.stderr.trim()}`);
}

function parentsOf(sha) {
  return output("git", ["show", "-s", "--format=%P", sha]).split(" ").filter(Boolean);
}

// Il riallineamento di una promozione senza deploy unisce main al commit distribuito
// in Development senza cambiarne il tree: si promuove quel merge, non un contenuto nuovo.
function isLinkedReconciliation(candidate, developSha, mainSha) {
  const parents = parentsOf(candidate);
  return (
    parents.length === 2 &&
    parents.includes(developSha) &&
    parents.includes(mainSha) &&
    gitTree(candidate) === gitTree(developSha)
  );
}

function promotedSource(mainSha, developSha) {
  const [previousMain, source, ...extra] = parentsOf(mainSha);
  if (!source || extra.length > 0) return undefined;
  return source === developSha || isLinkedReconciliation(source, developSha, previousMain)
    ? source
    : undefined;
}

async function promotionCandidate(developSha) {
  execute("git", ["fetch", "--quiet", "origin", "main", "develop"]);
  const mainSha = gitSha("origin/main");
  const promoted = promotedSource(mainSha, developSha);
  if (promoted) return promoted;
  let candidate = gitSha("origin/develop");
  if (candidate === developSha && isAncestor(mainSha, developSha)) return developSha;
  if (candidate === developSha) {
    console.log("main contiene una promozione senza deploy non collegata: riallineo develop.");
    await ensureWorkflow({
      workflow: "reconcile-develop.yml",
      branch: "main",
      sha: mainSha,
      inputs: { mode: "no-deploy-promotion" },
      fresh: true,
    });
    execute("git", ["fetch", "--quiet", "origin", "main", "develop"]);
    candidate = gitSha("origin/develop");
  }
  if (isLinkedReconciliation(candidate, developSha, mainSha)) return candidate;
  throw new Error("develop è avanzato dopo il deploy Development; serve un nuovo candidato.");
}

function gitPathTree(ref, path) {
  return output("git", ["rev-parse", `${ref}:${path}`]);
}

async function waitForReconciliation(attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    execute("git", ["fetch", "--quiet", "origin", "main", "develop"]);
    const mainSha = gitSha("origin/main");
    const developSha = gitSha("origin/develop");
    const mergeBase = output("git", ["merge-base", "origin/main", "origin/develop"]);
    if (
      isReconciled({
        mainSha,
        developSha,
        mergeBase,
      })
    ) {
      return;
    }
    await wait(pollIntervalMs);
  }
  throw new Error("develop non include ancora il merge Production verificato.");
}

function verifyPromotionCommit(mainSha, developSha) {
  execute("git", ["fetch", "--quiet", "origin", "main", "develop"]);
  const parents = output("git", ["show", "-s", "--format=%P", mainSha]).split(" ");
  if (
    parents.length !== 2 ||
    parents[1] !== developSha ||
    gitTree(mainSha) !== gitTree(developSha)
  ) {
    throw new Error("Il merge Production non conserva il parent e il tree di develop.");
  }
}

function ensureRelease(repositoryName, version, mainSha) {
  const tag = `v${version}`;
  const existing = execute("gh", ["release", "view", tag, "--json", "url,tagName"], {
    allowFailure: true,
  });
  if (existing.status === 0) {
    const ref = json("gh", ["api", `repos/${repositoryName}/git/ref/tags/${tag}`]);
    if (ref.object?.sha !== mainSha) throw new Error(`${tag} esiste su un commit diverso.`);
    console.log(`Release ${tag} già verificata.`);
    return JSON.parse(existing.stdout);
  }
  execute(
    "gh",
    ["release", "create", tag, "--target", mainSha, "--title", tag, "--generate-notes"],
    { interactive: true },
  );
  return json("gh", ["release", "view", tag, "--json", "url,tagName"]);
}

export async function publish(target) {
  if (output("git", ["status", "--porcelain"])) {
    throw new Error("Il worktree deve essere pulito prima della pubblicazione.");
  }
  const branch = output("git", ["branch", "--show-current"]);
  if (!branch || branch === "main" || branch === "develop") {
    throw new Error("Avvia la pubblicazione dal branch della modifica.");
  }
  const sourceSha = gitSha("HEAD");
  const repositoryName = repository();
  if (!pullRequests(branch, "develop").some((pr) => pr.headRefOid === sourceSha)) {
    runLocalGate(branch, sourceSha);
  }
  const developmentPr = await ensurePullRequest({
    branch,
    base: "develop",
    sourceSha,
    mergeMethod: "squash",
  });
  const developSha = developmentPr.mergeCommit.oid;
  deleteRemoteBranch(branch);
  await ensureWorkflow({
    workflow: "deploy-development.yml",
    branch: "develop",
    sha: developSha,
  });
  if (target === "development") {
    console.log(`Pubblicazione Development completata: ${developSha}.`);
    return { developSha };
  }

  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  const candidateSha = await promotionCandidate(developSha);
  const promotionPr = await ensurePullRequest({
    branch: "develop",
    base: "main",
    sourceSha: candidateSha,
    mergeMethod: "merge",
    title: `chore: promuovi CF Ready ${version}`,
    body: `Promuove in Production il tree Development verificato \`${candidateSha}\`.`,
  });
  const mainSha = promotionPr.mergeCommit.oid;
  verifyPromotionCommit(mainSha, candidateSha);
  await ensureWorkflow({
    workflow: "deploy-production.yml",
    branch: "main",
    sha: mainSha,
  });
  if (gitPathTree(mainSha, "site") !== gitPathTree(`${mainSha}^1`, "site")) {
    await ensureWorkflow({
      workflow: "deploy-pages-production.yml",
      branch: "main",
      sha: mainSha,
    });
  } else {
    console.log("Deploy Pages Production non necessario: il tree site/ è invariato.");
  }
  await waitForReconciliation();
  const release = ensureRelease(repositoryName, version, mainSha);
  console.log(`Pubblicazione Production completata: ${mainSha}, ${release.url}.`);
  return { developSha, mainSha, releaseUrl: release.url };
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  publish(parseTarget(process.argv.slice(2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
