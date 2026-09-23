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

export function checksOutcome(checks) {
  const failed = checks.filter(({ bucket }) => bucket === "fail" || bucket === "cancel");
  if (failed.length > 0) return { state: "failed", names: failed.map(({ name }) => name) };
  if (checks.length === 0 || checks.some(({ bucket }) => bucket === "pending")) {
    return { state: "pending", names: [] };
  }
  return { state: "passed", names: [] };
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

async function waitForRequiredChecks(number, attempts = 720) {
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
    const outcome = checksOutcome(JSON.parse(result.stdout.trim() || "[]"));
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

async function ensurePullRequest({ branch, base, sourceSha, mergeMethod, title, body }) {
  let current = pullRequests(branch, base).find((pr) => pr.headRefOid === sourceSha);
  if (current?.state === "MERGED") return current;
  if (!current && base === "develop") {
    execute("git", ["push", "--set-upstream", "origin", branch], { interactive: true });
    current = pullRequests(branch, base).find((pr) => pr.headRefOid === sourceSha);
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
    await waitForRequiredChecks(current.number);
    await waitForIdlePipeline();
  }
  execute("gh", [
    "pr",
    "merge",
    String(current.number),
    "--auto",
    `--${mergeMethod}`,
    ...(base === "develop" ? ["--delete-branch"] : []),
  ]);
  return waitForMerge(current.number);
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

async function ensureWorkflow({ workflow, branch, sha }, attempts = 240) {
  const initialRuns = workflowRuns(workflow, branch, sha);
  let run = selectWorkflowRun(initialRuns, sha);
  let afterDatabaseId = 0;
  if (!run) {
    afterDatabaseId = latestWorkflowRun(initialRuns, sha)?.databaseId ?? 0;
    const remoteSha = output("git", ["ls-remote", "origin", `refs/heads/${branch}`]).split(
      /\s+/,
    )[0];
    if (remoteSha !== sha) {
      throw new Error(`${branch} è avanzato prima dell'avvio di ${workflow}.`);
    }
    execute("gh", ["workflow", "run", workflow, "--ref", branch]);
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
  const remoteDevelopSha = output("git", ["ls-remote", "origin", "refs/heads/develop"]).split(
    /\s+/,
  )[0];
  if (remoteDevelopSha !== developSha) {
    throw new Error("develop è avanzato dopo il deploy Development; serve un nuovo candidato.");
  }
  const promotionPr = await ensurePullRequest({
    branch: "develop",
    base: "main",
    sourceSha: developSha,
    mergeMethod: "merge",
    title: `chore: promuovi CF Ready ${version}`,
    body: `Promuove in Production il tree Development verificato \`${developSha}\`.`,
  });
  const mainSha = promotionPr.mergeCommit.oid;
  verifyPromotionCommit(mainSha, developSha);
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
