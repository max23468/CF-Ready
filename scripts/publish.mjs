import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { changedFiles, classifyCiLane, parseChangedFiles, releaseSurface } from "./ci-lane.mjs";
import { packageManifest, runVersionPolicy } from "./version-policy.mjs";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
// I test sostituiscono GitHub con provider sintetici e non devono attendere i tempi reali.
const pollIntervalMs = Number(process.env.CF_READY_PUBLISH_POLL_MS) || 5_000;

export function pollingDelay(attempt, base = pollIntervalMs) {
  return Math.min(base * 2 ** Math.floor(attempt / 3), base < 100 ? base : 10_000);
}

async function pollWait(attempt, deadline) {
  await wait(Math.max(0, Math.min(pollingDelay(attempt), deadline - Date.now())));
}

function execute(command, args, { interactive = false, allowFailure = false, env } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
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

// Prima del push bastano controlli statici e test legati al diff: coverage, browser,
// build, dry-run e mutation restano alla CI, che li esegue in parallelo sul candidato.
export function localGateCommands(lane, baseSha, surface = "runtime", files = []) {
  if (lane === "docs" || surface === "metadata") return [["npm", ["run", "check:docs"]]];
  const commands = [["npm", ["run", "check:local"]]];
  if (surface === "runtime") commands.push(["npm", ["run", "test:changed", "--", baseSha]]);
  // Solo Chromium e solo i test browser collegati al diff: la suite completa resta alla CI.
  if (
    surface === "runtime" &&
    files.some((path) => path.startsWith("app/") || path.startsWith("tests/browser/"))
  )
    commands.push(["npm", ["run", "test:ui:changed", "--", baseSha]]);
  if (files.some((path) => path.startsWith("extensions/")))
    commands.push(["npm", ["run", "test:function"]]);
  if (
    files.some(
      (path) =>
        path.startsWith("scripts/") ||
        path.startsWith(".github/") ||
        path.startsWith("site/") ||
        path === "package.json" ||
        path === "app/routes.ts",
    )
  )
    commands.push(["npm", ["run", "test:operations"]], ["npm", ["run", "test:preflight"]]);
  return commands;
}

// gh elenca solo i check già registrati: un job che parte tardi, come l'aggregato
// mutation, manca finché non inizia e va atteso secondo il ruleset. Un job CI fallito
// interrompe subito anche se il check obbligatorio che lo aggrega è ancora in attesa.
export function checksOutcome(checks, required = []) {
  const blocking = ({ name, workflow }) =>
    required.length === 0 || required.includes(name) || workflow === "CI";
  const failed = checks.filter(
    (check) => (check.bucket === "fail" || check.bucket === "cancel") && blocking(check),
  );
  if (failed.length > 0) return { state: "failed", names: failed.map(({ name }) => name) };
  const gating =
    required.length === 0 ? checks : checks.filter(({ name }) => required.includes(name));
  const reported = new Set(gating.map(({ name }) => name));
  const missing = required.filter((name) => !reported.has(name));
  if (
    gating.length === 0 ||
    missing.length > 0 ||
    gating.some(({ bucket }) => bucket === "pending")
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
  const deadline = Date.now() + attempts * Math.max(pollIntervalMs, 100);
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt += 1) {
    const current = pullRequest(number);
    if (current.state === "MERGED" && current.mergeCommit?.oid) return current;
    if (current.state !== "OPEN") throw new Error(`La PR #${number} è ${current.state}.`);
    if (current.state !== lastState) {
      console.log(`PR #${number}: attendo gate, review e merge automatico.`);
      lastState = current.state;
    }
    await pollWait(attempt, deadline);
  }
  throw new Error(`Timeout in attesa del merge della PR #${number}.`);
}

// Controlli rapidi della corsia e politica di versione, prima che il push li renda remoti.
export function runLocalGate(branch, sourceSha, workingTree = false) {
  execute("git", ["fetch", "--quiet", "origin", "develop", "main"]);
  const baseSha = output("git", ["merge-base", "origin/develop", sourceSha]);
  const files = changedFiles(baseSha, sourceSha);
  if (workingTree) {
    files.push(
      ...parseChangedFiles(
        output("git", ["diff", "--name-status", "-z", "--find-renames", "HEAD"]),
      ),
    );
    files.push(
      ...output("git", ["ls-files", "--others", "--exclude-standard", "-z"])
        .split("\0")
        .filter(Boolean),
    );
  }
  const { lane, surface } = classifyCiLane(files, {
    base: "develop",
    head: branch,
    eventName: "pull_request",
  });
  console.log(`Gate locale della corsia ${lane} prima del push.`);
  console.log(
    `Versione: ${runVersionPolicy({ baseSha, headSha: sourceSha, files, headRef: branch, workingTree })}.`,
  );
  const evidence = {
    tree: workingTree ? workingTreeSnapshot() : gitTree(sourceSha),
    baseSha,
    commands: localGateCommands(lane, baseSha, surface, files),
  };
  // Stesso tree, stessa base e stessi comandi danno lo stesso esito: `verify:change`
  // già verde non si ripete al momento di `Pubblica`.
  const receipt = join(publicationsDirectory(), `local-gate-${evidence.tree}.json`);
  if (existsSync(receipt) && sameLocalGate(JSON.parse(readFileSync(receipt, "utf8")), evidence)) {
    console.log(`Gate locale già verde sul tree ${evidence.tree}: non lo ripeto.`);
    return;
  }
  for (const [command, args] of evidence.commands) {
    execute(command, args, { interactive: true });
  }
  writeFileSync(
    receipt,
    `${JSON.stringify({ ...evidence, completedAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

function sameLocalGate(receipt, { tree, baseSha, commands }) {
  return (
    JSON.stringify([receipt.tree, receipt.baseSha, receipt.commands]) ===
    JSON.stringify([tree, baseSha, commands])
  );
}

// Tree che avrebbe un commit di tutte le modifiche, file nuovi inclusi, senza toccare l'indice.
function workingTreeSnapshot() {
  const directory = mkdtempSync(join(tmpdir(), "cf-ready-index-"));
  try {
    const index = join(directory, "index");
    const current = resolve(output("git", ["rev-parse", "--git-path", "index"]));
    if (existsSync(current)) copyFileSync(current, index);
    execute("git", ["add", "--all"], { env: { GIT_INDEX_FILE: index } });
    return execute("git", ["write-tree"], { env: { GIT_INDEX_FILE: index } }).stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function publicationsDirectory() {
  const directory = join(
    resolve(output("git", ["rev-parse", "--git-common-dir"])),
    "cf-ready-publications",
  );
  mkdirSync(directory, { recursive: true });
  return directory;
}

// Il riuso della CI PR su develop vale solo se lo squash conserva il tree dell'HEAD PR:
// con un branch indietro la CI di develop riparte da zero e il deploy Development la attende.
function behindDevelop() {
  execute("git", ["fetch", "--quiet", "origin", "develop"]);
  return !isAncestor("origin/develop", "HEAD");
}

function rebaseOnDevelop(branch) {
  if (!behindDevelop()) return;
  const rebased = execute("git", ["rebase", "origin/develop"], { allowFailure: true });
  if (rebased.status !== 0) {
    execute("git", ["rebase", "--abort"], { allowFailure: true });
    throw new Error(`${branch} non si riallinea a develop senza conflitti: risolvili e rilancia.`);
  }
  if (output("git", ["ls-remote", "--heads", "origin", branch])) {
    execute("git", ["push", "--quiet", "--force-with-lease", "origin", branch]);
  }
  console.log(`${branch} riallineato a develop prima del push.`);
}

// Con la PR già aperta il merge evita di riscrivere commit pubblicati; lo squash finale
// lo assorbe comunque.
function mergeDevelop(branch) {
  if (!behindDevelop()) return false;
  const merged = execute("git", ["merge", "--no-edit", "origin/develop"], { allowFailure: true });
  if (merged.status !== 0) {
    execute("git", ["merge", "--abort"], { allowFailure: true });
    throw new Error(`${branch} non si unisce a develop senza conflitti: risolvili e rilancia.`);
  }
  execute("git", ["push", "--quiet", "origin", branch]);
  console.log(`develop è avanzato durante la CI: ${branch} lo include e la CI riparte.`);
  return true;
}

async function waitForPullRequestHead(number, sha, attempts = 60) {
  const deadline = Date.now() + attempts * Math.max(pollIntervalMs, 100);
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt += 1) {
    const current = pullRequest(number);
    if (current.headRefOid === sha) return current;
    await pollWait(attempt, deadline);
  }
  throw new Error(`La PR #${number} non riporta ancora l'HEAD ${sha}.`);
}

async function waitForRequiredChecks(number, base, attempts = 720) {
  const required = requiredCheckNames(base);
  let announced = false;
  const deadline = Date.now() + attempts * Math.max(pollIntervalMs, 100);
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt += 1) {
    const result = execute(
      "gh",
      ["pr", "checks", String(number), "--json", "name,bucket,workflow"],
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
    await pollWait(attempt, deadline);
  }
  throw new Error(`Timeout in attesa dei check della PR #${number}.`);
}

// Un merge su develop durante il deploy o la promozione di un'altra pubblicazione
// fa avanzare develop sotto quel ciclo: si entra solo a pipeline libera.
async function waitForIdlePipeline(attempts = 720) {
  let announced = false;
  const deadline = Date.now() + attempts * Math.max(pollIntervalMs, 100);
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt += 1) {
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
    await pollWait(attempt, deadline);
  }
  throw new Error("Timeout in attesa che promozione e deploy in corso terminino.");
}

// Dopo il push GitHub aggiorna l'HEAD di una PR già aperta con qualche secondo di
// ritardo: non va ricreata, né letta sui check verdi del commit precedente.
async function pullRequestForHead(branch, base, sha, attempts = 60) {
  const deadline = Date.now() + attempts * Math.max(pollIntervalMs, 100);
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt += 1) {
    const candidates = pullRequests(branch, base);
    const current = candidates.find((pr) => pr.headRefOid === sha);
    if (current) return current;
    if (!candidates.some((pr) => pr.state === "OPEN")) return undefined;
    await pollWait(attempt, deadline);
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
  // Dopo tre riallineamenti si unisce comunque: la CI di develop resta la rete di sicurezza.
  for (let round = 0; base === "develop"; round += 1) {
    await waitForRequiredChecks(current.number, base);
    await waitForIdlePipeline();
    if (round >= 2 || !mergeDevelop(branch)) break;
    current = await waitForPullRequestHead(current.number, gitSha("HEAD"));
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
  { workflow, branch, sha, inputs = {}, fresh = false, refreshSuccessful = false },
  attempts = 240,
) {
  const initialRuns = workflowRuns(workflow, branch, sha);
  // fresh ignora i run già riusciti: serve quando lo stato da verificare è cambiato
  // dopo quel run pur restando sullo stesso commit del branch.
  let run = fresh ? undefined : selectWorkflowRun(initialRuns, sha);
  if (refreshSuccessful && run?.conclusion === "success") run = undefined;
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
  const deadline = Date.now() + attempts * Math.max(pollIntervalMs, 100);
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt += 1) {
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
    await pollWait(attempt, deadline);
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
  if (promoted) return { candidate: promoted, previousMain: parentsOf(mainSha)[0] };
  let candidate = gitSha("origin/develop");
  if (candidate === developSha && isAncestor(mainSha, developSha))
    return { candidate, previousMain: mainSha };
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
  if (isLinkedReconciliation(candidate, developSha, mainSha))
    return { candidate, previousMain: mainSha };
  throw new Error("develop è avanzato dopo il deploy Development; serve un nuovo candidato.");
}

function surfaceBetween(base, head) {
  const files = changedFiles(base, head);
  return releaseSurface(files, { before: packageManifest(base), after: packageManifest(head) });
}

// Nessun file entra nel Worker o nell'app Shopify: documentazione, tooling, test e
// sito. Se il diff non si legge, si distribuisce come prima.
function needsDevelopmentDeploy(sha) {
  execute("git", ["fetch", "--quiet", "origin", "develop"]);
  const parent = execute("git", ["rev-parse", `${sha}^1`], { allowFailure: true });
  if (parent.status !== 0) return true;
  return surfaceBetween(parent.stdout.trim(), sha).deploy;
}

function versionAt(ref) {
  return JSON.parse(output("git", ["show", `${ref}:package.json`])).version;
}

// Una promozione porta una versione nuova solo se cambia una superficie distribuita;
// tooling, workflow e documentazione arrivano su main senza deploy né release.
function promotionPlan(previousMain, candidate) {
  if (gitTree(previousMain) === gitTree(candidate)) return undefined;
  const { deploy, release } = surfaceBetween(previousMain, candidate);
  const version = versionAt(candidate);
  const promoted = versionAt(previousMain);
  if (release && version === promoted) {
    throw new Error(
      `Il lotto cambia superfici distribuite ma resta ${promoted}: prepara il bump in una PR verso develop.`,
    );
  }
  if (!release && version !== promoted) {
    throw new Error(`La versione ${version} non ha superfici distribuite da rilasciare.`);
  }
  return {
    version,
    deploy,
    release,
    site: gitPathTree(candidate, "site") !== gitPathTree(previousMain, "site"),
  };
}

function gitPathTree(ref, path) {
  return output("git", ["rev-parse", `${ref}:${path}`]);
}

async function waitForReconciliation(attempts = 120) {
  const deadline = Date.now() + attempts * Math.max(pollIntervalMs, 100);
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt += 1) {
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
    await pollWait(attempt, deadline);
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

export function validatePublishReceipt(
  receipt,
  { environment, commit, tree, repositoryName, runId },
) {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.environment !== environment ||
    receipt.commit !== commit ||
    receipt.tree !== tree ||
    receipt.repository !== repositoryName ||
    receipt.workflowRun !== `https://github.com/${repositoryName}/actions/runs/${runId}` ||
    !/^[0-9a-f]{40}$/.test(receipt.providerSourceCommit ?? "") ||
    !receipt.worker?.deploymentId ||
    !receipt.worker.versionId ||
    receipt.worker.percentage !== 100 ||
    !receipt.shopify?.versionId ||
    !receipt.shopify.versionTag ||
    receipt.shopify.message !== `${environment} ${receipt.providerSourceCommit}` ||
    receipt.checks?.migrations !== "readback-green" ||
    receipt.checks.smoke !== "green" ||
    receipt.checks.providerReadback !== "green"
  )
    throw new Error(`Ricevuta ${environment} incompleta o diversa dal candidato.`);
  return receipt;
}

function readDeployReceipt(run, environment, commit, repositoryName) {
  const directory = mkdtempSync(join(tmpdir(), "cf-ready-receipt-"));
  try {
    const name = `deploy-receipt-${environment.toLowerCase()}-${commit}`;
    execute("gh", ["run", "download", String(run.databaseId), "--name", name, "--dir", directory]);
    const receipt = JSON.parse(
      readFileSync(join(directory, `deploy-receipt-${environment.toLowerCase()}.json`), "utf8"),
    );
    return validatePublishReceipt(receipt, {
      environment,
      commit,
      tree: gitTree(commit),
      repositoryName,
      runId: run.databaseId,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function cleanupPublishedCheckout(
  { branch, sourceSha, developSha, cwd = process.cwd() },
  run = output,
) {
  if (!branch.startsWith("codex/"))
    return { status: "preserved", reason: "Branch non temporaneo." };
  if (
    run("git", ["status", "--porcelain"]) ||
    run("git", ["rev-parse", `refs/heads/${branch}`]) !== sourceSha ||
    run("git", ["rev-parse", `${sourceSha}^{tree}`]) !==
      run("git", ["rev-parse", `${developSha}^{tree}`])
  ) {
    return { status: "preserved", reason: "Checkout avanzato, modificato o tree non equivalente." };
  }
  const root = run("git", ["rev-parse", "--show-toplevel"]);
  if (resolve(root) !== resolve(cwd))
    return { status: "preserved", reason: "Checkout diverso da quello pubblicato." };
  const common = resolve(cwd, run("git", ["rev-parse", "--git-common-dir"]));
  const managed = root.startsWith(
    resolve(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "worktrees") + sep,
  );
  const ignored = run("git", [
    "ls-files",
    "--others",
    "--ignored",
    "--exclude-standard",
    "--directory",
    "-z",
  ])
    .split("\0")
    .filter(Boolean);
  const generated =
    /^(?:node_modules\/|build\/|\.coverage\/|\.stryker-incremental\/|\.stryker-tmp\/|\.react-router\/|\.cloudflare\/|\.wrangler\/|\.vitest\/|extensions\/cf-ready-validation\/(?:dist|generated|node_modules)\/)/;
  run("git", ["switch", "--detach", "origin/develop"]);
  run("git", ["branch", "-D", branch]);
  if (!managed && dirname(common) !== root && ignored.every((file) => generated.test(file))) {
    run("git", ["-C", dirname(common), "worktree", "remove", root]);
    return { status: "removed", branch, worktree: root };
  }
  return {
    status: "branch-removed",
    branch,
    worktree: root,
    reason: managed
      ? "Worktree Codex gestito: archiviazione tramite l'host."
      : "Checkout principale o file ignorati da conservare.",
  };
}

function startRecord(name, fields) {
  const record = { ...fields, phases: [], receipts: [] };
  const path = join(publicationsDirectory(), `${name}.json`);
  const save = () => writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  const measured = async (phase, action) => {
    console.log(`Fase: ${phase}.`);
    const start = Date.now();
    record.activePhase = phase;
    record.status = "running";
    save();
    let status = "failed";
    try {
      const result = await action();
      status = "success";
      return result;
    } finally {
      record.status = status === "failed" ? "failed" : "running";
      record.phases.push({ name: phase, status, milliseconds: Date.now() - start });
      save();
    }
  };
  return { record, path, measured };
}

// Development resta verificato finché dopo l'ultimo deploy riuscito non cambia una
// superficie distribuita: la promozione di un lotto riusa quella ricevuta.
function lastSuccessfulRun(workflow, branch) {
  return json("gh", [
    "run",
    "list",
    "--workflow",
    workflow,
    "--branch",
    branch,
    "--status",
    "success",
    "--limit",
    "1",
    "--json",
    "databaseId,status,conclusion,headSha,url",
  ])[0];
}

function releaseExists(version) {
  return (
    execute("gh", ["release", "view", `v${version}`, "--json", "tagName"], { allowFailure: true })
      .status === 0
  );
}

// Il piano confronta main col merge precedente; una promozione interrotta lascia però deploy,
// sito o release mai completati su un commit già unito. Si riprendono confrontando main con
// l'ultimo run riuscito di ogni workflow e con le release esistenti.
function withPendingProductionWork(plan, mainSha) {
  const production = plan.deploy ? undefined : lastSuccessfulRun("deploy-production.yml", "main");
  const pages = plan.site ? undefined : lastSuccessfulRun("deploy-pages-production.yml", "main");
  return {
    ...plan,
    deploy:
      plan.deploy ||
      !production ||
      (production.headSha !== mainSha && surfaceBetween(production.headSha, mainSha).deploy),
    site:
      plan.site || !pages || gitPathTree(pages.headSha, "site") !== gitPathTree(mainSha, "site"),
    release: plan.release || !releaseExists(plan.version),
  };
}

async function developmentEvidence(developSha, repositoryName) {
  const latest = lastSuccessfulRun("deploy-development.yml", "develop");
  if (
    latest &&
    (latest.headSha === developSha ||
      (isAncestor(latest.headSha, developSha) &&
        !surfaceBetween(latest.headSha, developSha).deploy))
  ) {
    console.log(`Development già verificato su ${latest.headSha}.`);
    return readDeployReceipt(latest, "Development", latest.headSha, repositoryName);
  }
  const run = await ensureWorkflow({
    workflow: "deploy-development.yml",
    branch: "develop",
    sha: developSha,
  });
  return readDeployReceipt(run, "Development", developSha, repositoryName);
}

async function promoteProduction({ developSha, record, measured, repositoryName }) {
  const { candidate: candidateSha, previousMain } = await measured("Candidato Production", () =>
    promotionCandidate(developSha),
  );
  // La versione è quella del tree promosso: develop può essere avanzato oltre il branch locale.
  const planned = promotionPlan(previousMain, candidateSha);
  if (!planned) {
    console.log(`Niente da promuovere: main contiene già il tree di ${candidateSha}.`);
    const idle = { version: versionAt(previousMain), deploy: false, release: false, site: false };
    const pending = withPendingProductionWork(idle, previousMain);
    if (!pending.deploy && !pending.site && !pending.release) return { mainSha: previousMain };
    console.log("Riprendo le superfici Production non completate su main.");
    record.mainSha = previousMain;
    return completeProduction({
      mainSha: previousMain,
      plan: pending,
      record,
      measured,
      repositoryName,
    });
  }
  const promotionPr = await measured("Promozione e merge Production", () =>
    ensurePullRequest({
      branch: "develop",
      base: "main",
      sourceSha: candidateSha,
      mergeMethod: "merge",
      title: planned.release
        ? `chore: promuovi CF Ready ${planned.version}`
        : `chore: promuovi CF Ready ${planned.version} senza deploy`,
      body: `Promuove in Production il tree Development verificato \`${candidateSha}\`.`,
    }),
  );
  const mainSha = promotionPr.mergeCommit.oid;
  record.mainSha = mainSha;
  verifyPromotionCommit(mainSha, candidateSha);
  const plan = withPendingProductionWork(promotionPlan(parentsOf(mainSha)[0], mainSha), mainSha);
  return completeProduction({ mainSha, plan, record, measured, repositoryName });
}

async function completeProduction({ mainSha, plan, record, measured, repositoryName }) {
  record.plan = plan;
  if (plan.deploy) {
    const productionRun = await measured("Deploy e readback Production", () =>
      ensureWorkflow({
        workflow: "deploy-production.yml",
        branch: "main",
        sha: mainSha,
        refreshSuccessful: true,
      }),
    );
    record.receipts.push(
      await measured("Ricevuta Production", () =>
        readDeployReceipt(productionRun, "Production", mainSha, repositoryName),
      ),
    );
  } else {
    console.log("Deploy Production non necessario: Worker e app Shopify sono invariati.");
  }
  if (plan.site) {
    record.pages = await measured("Deploy e readback Pages", () =>
      ensureWorkflow({
        workflow: "deploy-pages-production.yml",
        branch: "main",
        sha: mainSha,
        refreshSuccessful: true,
      }),
    );
  } else {
    console.log("Deploy Pages Production non necessario: il tree site/ è invariato.");
  }
  if (plan.deploy || plan.site) {
    await measured("Riconciliazione", () => waitForReconciliation());
  } else {
    console.log(
      "Riallineamento di develop rinviato alla prossima promozione (no-deploy-promotion).",
    );
  }
  if (!plan.release) {
    console.log(`Release non necessaria: ${plan.version} resta la versione rilasciata.`);
    return { mainSha };
  }
  const release = await measured("Release", () =>
    ensureRelease(repositoryName, plan.version, mainSha),
  );
  record.releaseUrl = release.url;
  return { mainSha, releaseUrl: release.url };
}

export async function publish(target) {
  if (output("git", ["status", "--porcelain"])) {
    throw new Error("Il worktree deve essere pulito prima della pubblicazione.");
  }
  const branch = output("git", ["branch", "--show-current"]);
  if (!branch || branch === "main" || branch === "develop") {
    throw new Error("Avvia la pubblicazione dal branch della modifica.");
  }
  const published = pullRequests(branch, "develop").some((pr) => pr.headRefOid === gitSha("HEAD"));
  if (!published) rebaseOnDevelop(branch);
  let sourceSha = gitSha("HEAD");
  const repositoryName = repository();
  const { record, path, measured } = startRecord(sourceSha, {
    sourceSha,
    branch,
    target,
    repository: repositoryName,
  });
  if (!published) {
    await measured("Verifica locale", () => runLocalGate(branch, sourceSha));
  }
  const developmentPr = await measured("PR Development e merge", () =>
    ensurePullRequest({
      branch,
      base: "develop",
      sourceSha,
      mergeMethod: "squash",
    }),
  );
  // Un riallineamento durante la CI sposta l'HEAD unito oltre quello di partenza.
  sourceSha = developmentPr.headRefOid;
  record.sourceSha = sourceSha;
  const developSha = developmentPr.mergeCommit.oid;
  deleteRemoteBranch(branch);
  if (!needsDevelopmentDeploy(developSha)) {
    console.log(
      "Deploy Development non necessario: nessuna superficie Development distribuita è cambiata.",
    );
  } else {
    const run = await measured("Deploy e readback Development", () =>
      ensureWorkflow({
        workflow: "deploy-development.yml",
        branch: "develop",
        sha: developSha,
        refreshSuccessful: true,
      }),
    );
    record.receipts.push(
      await measured("Ricevuta Development", () =>
        readDeployReceipt(run, "Development", developSha, repositoryName),
      ),
    );
  }
  if (target === "development") {
    finishPublication(record, { branch, sourceSha, developSha }, path);
    console.log(`Pubblicazione Development completata: ${developSha}.`);
    return { developSha };
  }
  const production = await promoteProduction({ developSha, record, measured, repositoryName });
  finishPublication(record, { branch, sourceSha, developSha }, path);
  console.log(
    `Pubblicazione Production completata: ${production.mainSha}${production.releaseUrl ? `, ${production.releaseUrl}` : ""}.`,
  );
  return { developSha, ...production };
}

// Promuove il lotto già verificato su develop, senza un branch di modifica.
export async function promote() {
  execute("git", ["fetch", "--quiet", "origin", "main", "develop"]);
  const developSha = gitSha("origin/develop");
  const repositoryName = repository();
  const { record, path, measured } = startRecord(`promotion-${developSha}`, {
    developSha,
    target: "production",
    repository: repositoryName,
  });
  record.receipts.push(
    await measured("Prova Development", () => developmentEvidence(developSha, repositoryName)),
  );
  const production = await promoteProduction({ developSha, record, measured, repositoryName });
  record.status = "complete";
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  console.log(
    `Promozione Production completata: ${production.mainSha}${production.releaseUrl ? `, ${production.releaseUrl}` : ""}. Ricevuta del ciclo: ${path}.`,
  );
  return production;
}

function finishPublication(record, candidate, path) {
  // La ricevuta locale sta nei metadati Git, fuori dal tree distribuito e dai worktree rimossi.
  const start = Date.now();
  record.developSha = candidate.developSha;
  try {
    record.cleanup = cleanupPublishedCheckout(candidate);
  } catch {
    record.cleanup = {
      status: "preserved",
      reason: "Pulizia Git non conclusa; conservare il checkout residuo.",
    };
  }
  record.phases.push({ name: "Pulizia", milliseconds: Date.now() - start });
  record.status = "complete";
  record.activePhase = "Pulizia";
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`Ricevuta del ciclo: ${path}. Pulizia: ${record.cleanup.status}.`);
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  const action = process.argv.includes("--verify-only")
    ? Promise.resolve().then(() =>
        runLocalGate(output("git", ["branch", "--show-current"]), gitSha("HEAD"), true),
      )
    : process.argv.includes("--promote")
      ? promote()
      : publish(parseTarget(process.argv.slice(2)));
  action.catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
