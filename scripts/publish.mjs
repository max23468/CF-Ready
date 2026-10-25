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

// Le sessioni cloud non raggiungono GraphQL: PR, check, merge e release passano dalle
// API REST di GitHub, le stesse sul Mac e nel cloud.
function rest(path, { method = "GET", fields = {}, allowFailure = false } = {}) {
  const args = ["api", "-X", method, `repos/{owner}/{repo}${path && `/${path}`}`];
  for (const [name, value] of Object.entries(fields)) {
    args.push(typeof value === "string" ? "-f" : "-F", `${name}=${value}`);
  }
  return execute("gh", args, { allowFailure });
}

function restJson(path, options) {
  return JSON.parse(rest(path, options).stdout);
}

function restPages(path) {
  return json("gh", ["api", "--paginate", "--slurp", `repos/{owner}/{repo}/${path}`]);
}

export function parseTarget(args) {
  const index = args.indexOf("--target");
  const target = index >= 0 ? args[index + 1] : "";
  if (!new Set(["development", "production"]).has(target)) {
    throw new Error("Usa --target development oppure --target production.");
  }
  return target;
}

function pullRequestFromRest(pr) {
  const merged = Boolean(pr.merged_at);
  return {
    number: pr.number,
    state: merged ? "MERGED" : pr.state === "open" ? "OPEN" : "CLOSED",
    headRefOid: pr.head.sha,
    mergeCommit: merged ? { oid: pr.merge_commit_sha } : null,
    url: pr.html_url,
  };
}

// Stessi bucket di `gh pr checks`: check run dell'HEAD con il workflow che li ha creati,
// più gli status di commit.
export function checksFromRest({ checkRuns, workflowRuns, statuses }) {
  const workflows = new Map(workflowRuns.map((run) => [run.check_suite_id, run.name]));
  const bucket = ({ status, conclusion }) => {
    if (status !== "completed") return "pending";
    if (["success", "neutral", "skipped"].includes(conclusion)) return "pass";
    return conclusion === "cancelled" ? "cancel" : "fail";
  };
  return [
    ...checkRuns.map((run) => ({
      name: run.name,
      bucket: bucket(run),
      workflow: workflows.get(run.check_suite?.id) ?? "",
    })),
    ...statuses.map(({ context, state }) => ({
      name: context,
      bucket: state === "success" ? "pass" : state === "pending" ? "pending" : "fail",
      workflow: "",
    })),
  ];
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
  return restJson(`rules/branches/${branch}`)
    .filter(({ type }) => type === "required_status_checks")
    .flatMap(({ parameters }) => parameters.required_status_checks.map(({ context }) => context));
}

export function isPipelineBusy({ promotions, runs }) {
  return promotions.length > 0 || runs.some(({ status }) => status !== "completed");
}

export function isReconciled({ mainSha, developSha, mergeBase }) {
  return mainSha === developSha || mergeBase === mainSha;
}

let currentRepository;
function repository() {
  currentRepository ??= restJson("").full_name;
  return currentRepository;
}

function pullRequests(branch, base, state = "all") {
  const owner = repository().split("/")[0];
  const query = new URLSearchParams({ head: `${owner}:${branch}`, base, state, per_page: "20" });
  return restJson(`pulls?${query}`).map(pullRequestFromRest);
}

function pullRequest(number) {
  return pullRequestFromRest(restJson(`pulls/${number}`));
}

// Come `gh pr create --fill`: un commit dà titolo e corpo, più commit un elenco.
function filledPullRequest(base) {
  const commits = output("git", [
    "log",
    "--reverse",
    "--format=%s%x1f%b%x1e",
    `origin/${base}..HEAD`,
  ])
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split("\x1f"));
  if (commits.length === 0) throw new Error(`Nessun commit da proporre verso ${base}.`);
  const [[title, body = ""]] = commits;
  return {
    title,
    body:
      commits.length === 1 ? body.trim() : commits.map(([subject]) => `- ${subject}`).join("\n"),
  };
}

function createPullRequest({ branch, base, title, body }) {
  return pullRequestFromRest(
    restJson("pulls", { method: "POST", fields: { base, head: branch, title, body } }),
  );
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
// Nelle sessioni cloud il clone può essere superficiale o limitato a un branch: senza storia
// completa e senza origin/develop e origin/main, merge-base, diff e rebase falliscono.
function fetchBases() {
  const shallow = output("git", ["rev-parse", "--is-shallow-repository"]) === "true";
  execute("git", [
    "fetch",
    "--quiet",
    ...(shallow ? ["--unshallow"] : []),
    "origin",
    "+refs/heads/develop:refs/remotes/origin/develop",
    "+refs/heads/main:refs/remotes/origin/main",
  ]);
}

export function runLocalGate(branch, sourceSha, workingTree = false) {
  fetchBases();
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
  fetchBases();
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

function pullRequestChecks(sha) {
  return checksFromRest({
    checkRuns: restPages(`commits/${sha}/check-runs?per_page=100`).flatMap(
      ({ check_runs }) => check_runs,
    ),
    workflowRuns: restPages(`actions/runs?head_sha=${sha}&per_page=100`).flatMap(
      ({ workflow_runs }) => workflow_runs,
    ),
    statuses: restJson(`commits/${sha}/status`).statuses,
  });
}

async function waitForRequiredChecks({ number, headRefOid }, base, attempts = 720) {
  const required = requiredCheckNames(base);
  let announced = false;
  const deadline = Date.now() + attempts * Math.max(pollIntervalMs, 100);
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt += 1) {
    const outcome = checksOutcome(pullRequestChecks(headRefOid), required);
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
    const promotions = pullRequests("develop", "main", "open");
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
    current = createPullRequest({
      branch,
      base,
      ...(base === "develop" ? filledPullRequest(base) : { title, body }),
    });
  }
  // Dopo tre riallineamenti si unisce comunque: la CI di develop resta la rete di sicurezza.
  for (let round = 0; ; round += 1) {
    await waitForRequiredChecks(current, base);
    if (base !== "develop") break;
    await waitForIdlePipeline();
    if (round >= 2 || !mergeDevelop(branch)) break;
    current = await waitForPullRequestHead(current.number, gitSha("HEAD"));
  }
  await mergePullRequest(current, mergeMethod);
  return waitForMerge(current.number);
}

// Senza auto-merge, che esiste solo in GraphQL, si unisce dopo i check obbligatori e si
// riprova finché GitHub completa le altre regole del branch, come code scanning.
async function mergePullRequest({ number, headRefOid }, mergeMethod, attempts = 120) {
  const deadline = Date.now() + attempts * Math.max(pollIntervalMs, 100);
  let reason = "";
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt += 1) {
    const merged = rest(`pulls/${number}/merge`, {
      method: "PUT",
      fields: { merge_method: mergeMethod, sha: headRefOid },
      allowFailure: true,
    });
    if (merged.status === 0) return;
    reason = merged.stderr.trim();
    if (!/HTTP 405/.test(reason))
      throw new Error(`Merge della PR #${number} non riuscito: ${reason}`);
    const { mergeable_state: state } = restJson(`pulls/${number}`);
    if (state === "dirty") throw new Error(`La PR #${number} ha conflitti con la base.`);
    if (state === "draft") throw new Error(`La PR #${number} è in bozza: segnala che è pronta.`);
    await pollWait(attempt, deadline);
  }
  throw new Error(`La PR #${number} non è ancora unibile: ${reason}`);
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

function releaseByTag(tag) {
  const result = rest(`releases/tags/${tag}`, { allowFailure: true });
  if (result.status === 0) {
    const { html_url: url, tag_name: tagName } = JSON.parse(result.stdout);
    return { url, tagName };
  }
  if (/HTTP 404/.test(result.stderr)) return undefined;
  throw new Error(`Lettura della release ${tag} non riuscita: ${result.stderr.trim()}`);
}

function ensureRelease(version, mainSha) {
  const tag = `v${version}`;
  const existing = releaseByTag(tag);
  if (existing) {
    const ref = restJson(`git/ref/tags/${tag}`);
    if (ref.object?.sha !== mainSha) throw new Error(`${tag} esiste su un commit diverso.`);
    console.log(`Release ${tag} già verificata.`);
    return existing;
  }
  const created = restJson("releases", {
    method: "POST",
    fields: { tag_name: tag, target_commitish: mainSha, name: tag, generate_release_notes: true },
  });
  return { url: created.html_url, tagName: created.tag_name };
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

// In Actions la ricevuta va anche nel file che il workflow carica come artifact, persino
// dopo un errore: il comando che ha avviato il run la scarica e la conserva in locale.
function saveRecord(record, path) {
  const content = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(path, content);
  if (process.env.CF_READY_PUBLICATION_RECORD)
    writeFileSync(process.env.CF_READY_PUBLICATION_RECORD, content);
}

function startRecord(name, fields) {
  const record = { name, ...fields, phases: [], receipts: [] };
  const path = join(publicationsDirectory(), `${name}.json`);
  const save = () => saveRecord(record, path);
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
  return Boolean(releaseByTag(`v${version}`));
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
  const release = await measured("Release", () => ensureRelease(plan.version, mainSha));
  record.releaseUrl = release.url;
  return { mainSha, releaseUrl: release.url };
}

// Coordinatore: gira solo nel workflow `publish.yml`, sul branch già verificato e pubblicato
// dal comando che lo ha avviato (D-198).
export async function publish(target) {
  if (output("git", ["status", "--porcelain"])) {
    throw new Error("Il worktree deve essere pulito prima della pubblicazione.");
  }
  const branch = output("git", ["branch", "--show-current"]);
  if (!branch || branch === "main" || branch === "develop") {
    throw new Error("Avvia la pubblicazione dal branch della modifica.");
  }
  let sourceSha = gitSha("HEAD");
  const repositoryName = repository();
  const { record, path, measured } = startRecord(sourceSha, {
    sourceSha,
    branch,
    target,
    repository: repositoryName,
  });
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
  record.developSha = developSha;
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
    completeRecord(record, path);
    console.log(`Pubblicazione Development completata: ${developSha}.`);
    return { developSha };
  }
  const production = await promoteProduction({ developSha, record, measured, repositoryName });
  completeRecord(record, path);
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
  completeRecord(record, path);
  console.log(
    `Promozione Production completata: ${production.mainSha}${production.releaseUrl ? `, ${production.releaseUrl}` : ""}.`,
  );
  return production;
}

function completeRecord(record, path) {
  record.status = "complete";
  delete record.activePhase;
  saveRecord(record, path);
}

const operations = new Set(["development", "production", "promote"]);

export function coordinate(operation) {
  if (process.env.GITHUB_ACTIONS !== "true") {
    throw new Error("Il coordinatore gira solo nel workflow publish.yml: usa i comandi npm.");
  }
  if (!operations.has(operation)) throw new Error(`Operazione sconosciuta: ${operation}.`);
  return operation === "promote" ? promote() : publish(operation);
}

const publicationWorkflow = "publish.yml";

// Deve coincidere con `run-name` di publish.yml: è l'unico legame REST fra avvio e run.
export function publicationTitle({ operation, branch, sha }) {
  return `Pubblicazione ${operation} ${branch} ${sha}`;
}

export function matchingPublicationRun(runs, title, afterDatabaseId = 0) {
  return runs
    .filter((run) => run.displayTitle === title && run.databaseId > afterDatabaseId)
    .sort((left, right) => right.databaseId - left.databaseId)[0];
}

function publicationRuns() {
  return json("gh", [
    "run",
    "list",
    "--workflow",
    publicationWorkflow,
    "--limit",
    "20",
    "--json",
    "databaseId,displayTitle,status,conclusion,url",
  ]);
}

// Passo locale di `Pubblica`: gate sul tree, riallineamento e push del branch. Un merge di
// develop fatto dal coordinatore durante la CI arriva qui come avanzamento remoto.
function prepareBranch() {
  if (output("git", ["status", "--porcelain"])) {
    throw new Error("Il worktree deve essere pulito prima della pubblicazione.");
  }
  const branch = output("git", ["branch", "--show-current"]);
  if (!branch || branch === "main" || branch === "develop") {
    throw new Error("Avvia la pubblicazione dal branch della modifica.");
  }
  const remote = output("git", ["ls-remote", "--heads", "origin", branch]).split(/\s+/)[0];
  if (remote && remote !== gitSha("HEAD")) {
    execute("git", ["fetch", "--quiet", "origin", branch]);
    if (isAncestor("HEAD", remote)) execute("git", ["merge", "--ff-only", "--quiet", remote]);
  }
  const published = pullRequests(branch, "develop").some((pr) => pr.headRefOid === gitSha("HEAD"));
  if (!published) {
    rebaseOnDevelop(branch);
    runLocalGate(branch, gitSha("HEAD"));
    execute("git", ["push", "--set-upstream", "origin", branch], { interactive: true });
  }
  return { branch, sha: gitSha("HEAD") };
}

async function waitForPublicationRun(title, afterDatabaseId, attempts = 60) {
  const deadline = Date.now() + attempts * Math.max(pollIntervalMs, 100);
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt += 1) {
    const run = matchingPublicationRun(publicationRuns(), title, afterDatabaseId);
    if (run) return run;
    await pollWait(attempt, deadline);
  }
  throw new Error(`${publicationWorkflow} non registra ancora il run «${title}».`);
}

// Il workflow ha un timeout di sei ore; il controllo resta entro quel limite.
async function followPublicationRun(run, attempts = 2_200) {
  let last = "";
  let reported = 0;
  const deadline = Date.now() + attempts * Math.max(pollIntervalMs, 100);
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt += 1) {
    const current = json("gh", [
      "run",
      "view",
      String(run.databaseId),
      "--json",
      "status,conclusion,url,jobs",
    ]);
    if (current.status === "completed") return { ...run, ...current };
    const step = current.jobs
      .flatMap(({ steps = [] }) => steps)
      .find(({ status }) => status === "in_progress")?.name;
    const state = step ? `${current.status}, ${step}` : current.status;
    // Una riga ogni cinque minuti anche senza cambi, così chi segue sa che il run è vivo.
    if (state !== last || Date.now() - reported >= 300_000) {
      console.log(`Coordinatore: ${state}.`);
      last = state;
      reported = Date.now();
    }
    await pollWait(attempt, deadline);
  }
  throw new Error(`Timeout in attesa del coordinatore: ${run.url}.`);
}

function downloadPublicationRecord(run) {
  const directory = mkdtempSync(join(tmpdir(), "cf-ready-publication-"));
  try {
    const result = execute(
      "gh",
      [
        "run",
        "download",
        String(run.databaseId),
        "--name",
        "publication-record",
        "--dir",
        directory,
      ],
      { allowFailure: true },
    );
    if (result.status !== 0) return undefined;
    return JSON.parse(readFileSync(join(directory, "publication-record.json"), "utf8"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function describeRecord(record) {
  const lines = record.phases.map(
    ({ name, status = "success", milliseconds }) =>
      `- ${name}: ${status}, ${Math.round(milliseconds / 1000)} s`,
  );
  for (const receipt of record.receipts) {
    lines.push(
      `- ${receipt.environment} ${receipt.commit}: Worker ${receipt.worker.deploymentId}/${receipt.worker.versionId}, Shopify ${receipt.shopify.versionTag}`,
    );
  }
  if (record.releaseUrl) lines.push(`- Release: ${record.releaseUrl}`);
  return lines.join("\n");
}

async function runPublication(inputs, attempts) {
  const title = publicationTitle(inputs);
  const latest = matchingPublicationRun(publicationRuns(), title);
  // Un run fallito si ripete con un nuovo avvio; uno attivo o riuscito si riaggancia.
  let run = latest?.status === "completed" && latest.conclusion !== "success" ? undefined : latest;
  if (run?.status === "completed") console.log(`Run già concluso: ${run.url}.`);
  else if (run) console.log(`Riaggancio il coordinatore già avviato: ${run.url}.`);
  else {
    execute("gh", [
      "workflow",
      "run",
      publicationWorkflow,
      "--ref",
      "develop",
      "-f",
      `operation=${inputs.operation}`,
      "-f",
      `branch=${inputs.branch}`,
      "-f",
      `sha=${inputs.sha}`,
    ]);
    run = await waitForPublicationRun(title, latest?.databaseId ?? 0);
    console.log(`Coordinatore avviato in GitHub Actions: ${run.url}.`);
  }
  run = await followPublicationRun(run, attempts);
  // Gli artifact si scaricano da uno storage esterno che la rete cloud può bloccare: la
  // ricevuta è facoltativa, l'esito è quello del run letto via REST.
  const record = downloadPublicationRecord(run);
  const path = record && join(publicationsDirectory(), `${record.name}.json`);
  if (record) writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  if (run.conclusion !== "success") {
    const failed = execute("gh", ["run", "view", String(run.databaseId), "--log-failed"], {
      allowFailure: true,
    });
    const tail = failed.stdout.trim().split("\n").slice(-40).join("\n");
    if (tail) console.error(tail);
    throw new Error(
      `Coordinatore concluso con ${run.conclusion}${record?.activePhase ? ` nella fase ${record.activePhase}` : ""}: ${run.url}. Corretta la causa, rilancia lo stesso comando.`,
    );
  }
  if (record) console.log(describeRecord(record));
  else console.log(`Ricevuta non scaricabile: è nell'artifact publication-record di ${run.url}.`);
  return { record, path };
}

function mergedPullRequest(branch) {
  const merged = pullRequests(branch, "develop", "closed")
    .filter(({ state }) => state === "MERGED")
    .sort((left, right) => right.number - left.number)[0];
  return merged && { sourceSha: merged.headRefOid, developSha: merged.mergeCommit.oid };
}

export async function requestPublication(target) {
  const { branch, sha } = prepareBranch();
  const { record = {}, path } = await runPublication({ operation: target, branch, sha });
  const candidate = record.developSha ? record : mergedPullRequest(branch);
  // Il checkout del branch è qui, non sul runner: la pulizia resta locale.
  try {
    record.cleanup = candidate
      ? cleanupPublishedCheckout({ branch, ...candidate })
      : { status: "preserved", reason: "PR unita non trovata." };
  } catch {
    record.cleanup = {
      status: "preserved",
      reason: "Pulizia Git non conclusa; conservare il checkout residuo.",
    };
  }
  if (path) writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  console.log(
    `Pubblicazione ${target === "development" ? "Development" : "Production"} completata: ${candidate?.developSha ?? "commit non letto"}.${path ? ` Ricevuta del ciclo: ${path}.` : ""} Pulizia: ${record.cleanup.status}.`,
  );
  return record;
}

export async function requestPromotion() {
  fetchBases();
  const { record, path } = await runPublication({
    operation: "promote",
    branch: "develop",
    sha: gitSha("origin/develop"),
  });
  console.log(`Promozione Production completata.${path ? ` Ricevuta del ciclo: ${path}.` : ""}`);
  return record;
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  const args = process.argv.slice(2);
  const action = args.includes("--verify-only")
    ? Promise.resolve().then(() =>
        runLocalGate(output("git", ["branch", "--show-current"]), gitSha("HEAD"), true),
      )
    : args.includes("--coordinate")
      ? Promise.resolve().then(() => coordinate(args[args.indexOf("--coordinate") + 1]))
      : args.includes("--promote")
        ? requestPromotion()
        : requestPublication(parseTarget(args));
  action.catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
