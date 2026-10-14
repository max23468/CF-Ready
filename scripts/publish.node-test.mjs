import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  checksOutcome,
  isPipelineBusy,
  isReconciled,
  latestWorkflowRun,
  localGateCommands,
  parseTarget,
  selectWorkflowRun,
  pollingDelay,
  validatePublishReceipt,
  cleanupPublishedCheckout,
} from "./publish.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceSha = "a".repeat(40);
const developSha = "b".repeat(40);
const mainSha = "c".repeat(40);
const oldMainSha = "d".repeat(40);
const baseSha = "e".repeat(40);
const noDeployMainSha = "1".repeat(40);
const reconciledSha = "2".repeat(40);

test("l'attesa cresce senza superare dieci secondi", () => {
  assert.equal(pollingDelay(0, 5000), 5000);
  assert.equal(pollingDelay(3, 5000), 10000);
  assert.equal(pollingDelay(30, 5000), 10000);
  assert.equal(pollingDelay(30, 1), 1);
});

test("la ricevuta del ciclo verifica candidato, ambiente, run e readback", () => {
  const receipt = {
    schemaVersion: 1,
    environment: "Production",
    commit: mainSha,
    tree: sourceSha,
    repository: "owner/repo",
    workflowRun: "https://github.com/owner/repo/actions/runs/20",
    providerSourceCommit: mainSha,
    worker: { deploymentId: "d", versionId: "w", percentage: 100 },
    shopify: { versionId: "s", versionTag: "1.2.3", message: `Production ${mainSha}` },
    checks: { migrations: "readback-green", smoke: "green", providerReadback: "green" },
  };
  const expected = {
    environment: "Production",
    commit: mainSha,
    tree: sourceSha,
    repositoryName: "owner/repo",
    runId: 20,
  };
  assert.equal(validatePublishReceipt(receipt, expected), receipt);
  for (const change of [
    { environment: "Development" },
    { commit: sourceSha },
    { tree: developSha },
    { repository: "another/repo" },
    { workflowRun: "https://github.test/run" },
    { worker: {} },
    { shopify: {} },
    { checks: { ...receipt.checks, smoke: "failed" } },
  ]) {
    assert.throws(() => validatePublishReceipt({ ...receipt, ...change }, expected), /Ricevuta/);
  }
});

test("la pulizia conserva checkout avanzati, branch estranei e file ignorati non generati", () => {
  const calls = [];
  let dirty = false;
  let ignored = "node_modules/a\0";
  let branchSha = sourceSha;
  let root = "/checkout/task";
  const run = (_command, args) => {
    calls.push(args);
    const command = args.join(" ");
    if (command === "status --porcelain") return dirty ? " M file" : "";
    if (command === "rev-parse refs/heads/codex/change") return branchSha;
    if (command.endsWith("^{tree}")) return "same";
    if (command === "rev-parse --show-toplevel") return root;
    if (command === "rev-parse --git-common-dir") return "/checkout/.git";
    if (command.startsWith("ls-files")) return ignored;
    return "";
  };
  const input = { branch: "codex/change", sourceSha, developSha, cwd: "/checkout/task" };
  assert.equal(
    cleanupPublishedCheckout({ ...input, branch: "feature/user" }, run).status,
    "preserved",
  );
  dirty = true;
  assert.equal(cleanupPublishedCheckout(input, run).status, "preserved");
  dirty = false;
  branchSha = developSha;
  assert.equal(cleanupPublishedCheckout(input, run).status, "preserved");
  branchSha = sourceSha;
  assert.equal(cleanupPublishedCheckout({ ...input, cwd: "/other" }, run).status, "preserved");
  ignored = ".env\0";
  assert.equal(cleanupPublishedCheckout(input, run).status, "branch-removed");
  assert.ok(!calls.some((args) => args.includes("remove")));
  ignored = "node_modules/a\0";
  assert.equal(cleanupPublishedCheckout(input, run).status, "removed");
  assert.deepEqual(calls.at(-1), ["-C", "/checkout", "worktree", "remove", "/checkout/task"]);
  root = path.resolve(process.env.CODEX_HOME ?? path.join(homedir(), ".codex"), "worktrees/task");
  calls.length = 0;
  assert.equal(cleanupPublishedCheckout({ ...input, cwd: root }, run).status, "branch-removed");
  assert.ok(!calls.some((args) => args.includes("remove")));
});

test("richiede un target di pubblicazione esplicito", () => {
  assert.equal(parseTarget(["--target", "development"]), "development");
  assert.equal(parseTarget(["--target", "production"]), "production");
  assert.throws(() => parseTarget([]), /--target/);
});

test("la pulizia compatta directory ignorate grandi senza perdere la protezione dei file", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "cf-ready-cleanup-buffer-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: directory }).status, 0);
  writeFileSync(path.join(directory, ".gitignore"), "node_modules/\n.env\n");
  mkdirSync(path.join(directory, "node_modules"));
  for (let index = 0; index < 12; index++)
    writeFileSync(path.join(directory, "node_modules", `${index}-${"x".repeat(80)}`), "fixture");
  const args = ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"];
  assert.equal(spawnSync("git", args, { cwd: directory, maxBuffer: 256 }).error.code, "ENOBUFS");
  writeFileSync(path.join(directory, ".env"), "fixture sintetica");
  let inspected = false;
  const run = (_command, received) => {
    const command = received.join(" ");
    if (received[0] === "ls-files") {
      assert.ok(received.includes("--directory"));
      const result = spawnSync("git", received, {
        cwd: directory,
        encoding: "utf8",
        maxBuffer: 256,
      });
      assert.equal(result.status, 0);
      inspected = true;
      return result.stdout;
    }
    if (command === "status --porcelain") return "";
    if (command === "rev-parse refs/heads/codex/change") return sourceSha;
    if (command.endsWith("^{tree}")) return "same";
    if (command === "rev-parse --show-toplevel") return directory;
    if (command === "rev-parse --git-common-dir") return path.join(directory, ".git");
    assert.ok(!received.includes("remove"));
    return "";
  };
  assert.equal(
    cleanupPublishedCheckout({ branch: "codex/change", sourceSha, developSha, cwd: directory }, run)
      .status,
    "branch-removed",
  );
  assert.equal(inspected, true);
  assert.equal(existsSync(path.join(directory, ".env")), true);
});

test("riusa soltanto una run riuscita o ancora attiva dello stesso commit", () => {
  const sha = "a".repeat(40);
  assert.equal(
    selectWorkflowRun(
      [
        { databaseId: 1, headSha: sha, status: "completed", conclusion: "failure" },
        { databaseId: 2, headSha: sha, status: "completed", conclusion: "success" },
        { databaseId: 3, headSha: "b".repeat(40), status: "in_progress", conclusion: "" },
      ],
      sha,
    ).databaseId,
    2,
  );
  assert.equal(
    selectWorkflowRun(
      [
        { databaseId: 1, headSha: sha, status: "completed", conclusion: "success" },
        { databaseId: 2, headSha: sha, status: "completed", conclusion: "failure" },
      ],
      sha,
    ),
    undefined,
  );
});

test("dopo un retry ignora la run fallita precedente", () => {
  const sha = "a".repeat(40);
  const runs = [
    { databaseId: 10, headSha: sha, status: "completed", conclusion: "failure" },
    { databaseId: 11, headSha: sha, status: "queued", conclusion: "" },
  ];
  assert.equal(latestWorkflowRun(runs, sha, 10).databaseId, 11);
  assert.equal(latestWorkflowRun(runs.slice(0, 1), sha, 10), undefined);
});

test("il gate locale esegue controlli statici e test legati al diff", () => {
  assert.deepEqual(localGateCommands("docs", baseSha, "metadata"), [
    ["npm", ["run", "check:docs"]],
  ]);
  assert.deepEqual(localGateCommands("full", baseSha, "metadata", [".gitignore"]), [
    ["npm", ["run", "check:docs"]],
  ]);
  assert.deepEqual(localGateCommands("standard", baseSha, "runtime", ["app/root.tsx"]), [
    ["npm", ["run", "check:local"]],
    ["npm", ["run", "test:changed", "--", baseSha]],
  ]);
  assert.deepEqual(
    localGateCommands("full", baseSha, "runtime", ["extensions/x/src/run.ts", "package.json"]),
    [
      ["npm", ["run", "check:local"]],
      ["npm", ["run", "test:changed", "--", baseSha]],
      ["npm", ["run", "test:function"]],
      ["npm", ["run", "test:operations"]],
      ["npm", ["run", "test:preflight"]],
    ],
  );
  assert.deepEqual(localGateCommands("full", baseSha, "operations", [".github/workflows/ci.yml"]), [
    ["npm", ["run", "check:local"]],
    ["npm", ["run", "test:operations"]],
    ["npm", ["run", "test:preflight"]],
  ]);
});

test("classifica i check obbligatori e lo stato della pipeline", () => {
  assert.deepEqual(checksOutcome([]), { state: "pending", names: [] });
  assert.deepEqual(checksOutcome([{ name: "verify", bucket: "pass" }], ["verify", "mutation"]), {
    state: "pending",
    names: ["mutation"],
  });
  assert.equal(
    checksOutcome(
      [
        { name: "verify", bucket: "pass" },
        { name: "mutation", bucket: "pass" },
      ],
      ["verify", "mutation"],
    ).state,
    "passed",
  );
  assert.deepEqual(
    checksOutcome([
      { name: "verify", bucket: "pass" },
      { name: "coverage", bucket: "pending" },
    ]).state,
    "pending",
  );
  assert.deepEqual(
    checksOutcome([
      { name: "verify", bucket: "pass" },
      { name: "dependency-review", bucket: "skipping" },
    ]).state,
    "passed",
  );
  assert.deepEqual(
    checksOutcome([
      { name: "e2e", bucket: "cancel" },
      { name: "coverage", bucket: "fail" },
      { name: "verify", bucket: "pending" },
    ]),
    { state: "failed", names: ["e2e", "coverage"] },
  );
  assert.equal(isPipelineBusy({ promotions: [], runs: [{ status: "completed" }] }), false);
  assert.equal(isPipelineBusy({ promotions: [{ number: 1 }], runs: [] }), true);
  assert.equal(isPipelineBusy({ promotions: [], runs: [{ status: "queued" }] }), true);
});

test("riconosce la riconciliazione diretta o di sola ascendenza", () => {
  assert.equal(
    isReconciled({
      mainSha: "main",
      developSha: "main",
      mergeBase: "main",
    }),
    true,
  );
  assert.equal(
    isReconciled({
      mainSha: "main",
      developSha: "newer",
      mergeBase: "main",
    }),
    true,
  );
  assert.equal(
    isReconciled({
      mainSha: "main",
      developSha: "other",
      mergeBase: "base",
    }),
    false,
  );
});

test("riprende un ciclo già completato e verifica Development e Production", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "cf-ready-publish-"));
  const bin = path.join(directory, "bin");
  const provider = path.join(bin, "provider.mjs");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(bin);
  writeFileSync(path.join(directory, "package.json"), '{"version":"1.2.3"}\n');
  writeFileSync(
    provider,
    `#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const mode = process.env.FAIL_MODE || "";
const value = (name) => args[args.indexOf(name) + 1];
const marker = (name) => path.join(process.cwd(), "." + name);
const print = (payload) => process.stdout.write(typeof payload === "string" ? payload : JSON.stringify(payload));
if (command === "git") {
  const joined = args.join(" ");
  if (joined === "status --porcelain") print(mode === "dirty" ? " M file\\n" : "");
  else if (joined === "branch --show-current") print(mode === "main" ? "main\\n" : "codex/change\\n");
  else if (joined === "rev-parse HEAD" || joined === "rev-parse refs/heads/codex/change") print("${sourceSha}\\n");
  else if (joined === "rev-parse --git-common-dir") print(".git\\n");
  else if (/^rev-parse [0-9a-f]{40}:site$/.test(joined)) print("site-tree\\n");
  else if (joined === "ls-remote origin refs/heads/develop") print((mode === "develop-advanced" ? "${sourceSha}" : "${developSha}") + "\\trefs/heads/develop\\n");
  else if (joined === "ls-remote origin refs/heads/main") print("${mainSha}\\trefs/heads/main\\n");
  else if (joined === "ls-remote --heads origin codex/change") print("");
  else if (joined === "show -s --format=%P ${mainSha}") print("${oldMainSha} ${developSha}\\n");
  else if (joined === "rev-parse ${sourceSha}^{tree}") print("source-tree\\n");
  else if (joined === "rev-parse ${mainSha}^{tree}" || joined === "rev-parse ${developSha}^{tree}") print("tree\\n");
  else if (joined === "rev-parse ${oldMainSha}^{tree}") print("old-tree\\n");
  else if (joined === "show ${oldMainSha}:package.json") print('{"version":"1.2.2"}\\n');
  else if (/^show (${developSha}|${mainSha}|${baseSha}|origin\\/main):package\\.json$/.test(joined)) print('{"version":"1.2.3"}\\n');
  else if (mode === "docs" && joined === "rev-parse ${developSha}^1") print("${baseSha}\\n");
  else if (mode === "docs" && args[0] === "diff") process.stdout.write("M\\0docs/plans/note.md\\0");
  else if (mode === "verification" && args[0] === "diff") process.stdout.write("M\\0scripts/task.mjs\\0");
  else if (mode === "verification" && args[0] === "ls-files") process.stdout.write("scripts/new.mjs\\0");
  else if (mode === "verification" && args[0] === "merge-base") print("${baseSha}\\n");
  else if (args[0] === "diff") process.stdout.write("M\\0app/routes/app._index.tsx\\0");
  else if (joined === "rev-parse origin/main") print("${mainSha}\\n");
  else if (joined === "rev-parse origin/develop") print((existsSync(marker("reconciled")) ? "${mainSha}" : "${developSha}") + "\\n");
  else if (joined === "merge-base origin/main origin/develop") {
    if (existsSync(marker("reconciled"))) print("${mainSha}\\n");
    else { writeFileSync(marker("reconciled"), "ok"); print("${oldMainSha}\\n"); }
  }
  else if (args[0] !== "fetch") process.exitCode = 2;
} else if (command === "npm") {
  writeFileSync(marker("npm-verify"), args.join(" ") + "\\n", { flag: "a" });
} else if (command === "gh") {
  if (args[0] === "run" && args[1] === "download") {
    const environment = value("--name").includes("development") ? "Development" : "Production";
    const commit = environment === "Development" ? "${developSha}" : "${mainSha}";
    const receipt = { schemaVersion: 1, environment, commit, tree: "tree", repository: "owner/repository",
      providerSourceCommit: commit, workflowRun: "https://github.com/owner/repository/actions/runs/" + args[2],
      worker: { deploymentId: "deployment", versionId: "worker", percentage: 100 },
      shopify: { versionId: "shopify", versionTag: "1.2.3", message: environment + " " + commit },
      checks: { migrations: "readback-green", smoke: "green", providerReadback: "green" } };
    writeFileSync(path.join(value("--dir"), "deploy-receipt-" + environment.toLowerCase() + ".json"), JSON.stringify(receipt));
  }
  else if (args[0] === "repo") print({ nameWithOwner: "owner/repository" });
  else if (args[0] === "pr" && args[1] === "list") {
    const development = value("--head") === "codex/change";
    print([{ number: development ? 10 : 11, state: "MERGED", headRefOid: development ? "${sourceSha}" : "${developSha}", mergeCommit: { oid: development ? "${developSha}" : "${mainSha}" }, url: "https://github.test/pr" }]);
  } else if (args[0] === "run" && args[1] === "list") {
    const development = value("--workflow") === "deploy-development.yml";
    const file = marker("refresh-" + value("--workflow"));
    const fresh = existsSync(file) ? Number(readFileSync(file, "utf8")) : 0;
    print([{ databaseId: (development ? 20 : 21) + fresh, status: "completed", conclusion: "success", headSha: development ? "${developSha}" : "${mainSha}", url: "https://github.test/run" }]);
  } else if (args[0] === "workflow") {
    const file = marker("refresh-" + args[2]);
    writeFileSync(file, String((existsSync(file) ? Number(readFileSync(file, "utf8")) : 0) + 1));
  } else if (args[0] === "release" && args[1] === "view") print({ tagName: "v1.2.3", url: "https://github.test/release" });
  else if (args[0] === "api") print({ object: { sha: "${mainSha}" } });
  else process.exitCode = 2;
} else process.exitCode = 2;
`,
  );
  chmodSync(provider, 0o755);
  for (const command of ["git", "gh", "npm"]) {
    symlinkSync(provider, path.join(bin, command));
  }

  const docs = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "publish.mjs"), "--target", "development"],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        CF_READY_PUBLISH_POLL_MS: "1",
        FAIL_MODE: "docs",
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
    },
  );
  assert.equal(docs.status, 0, docs.stderr);
  assert.match(docs.stdout, /Deploy Development non necessario/);

  const verified = spawnSync(
    process.execPath,
    [path.join(root, "scripts/publish.mjs"), "--verify-only"],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        FAIL_MODE: "verification",
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
    },
  );
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(
    readFileSync(path.join(directory, ".npm-verify"), "utf8"),
    "run check:local\nrun test:operations\nrun test:preflight\n",
  );
  assert.match(verified.stdout, /Versione: nessun bump/);

  for (const target of ["development", "production"]) {
    const result = spawnSync(
      process.execPath,
      [path.join(root, "scripts", "publish.mjs"), "--target", target],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          CF_READY_PUBLISH_POLL_MS: "1",
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      new RegExp(
        `Pubblicazione ${target === "development" ? "Development" : "Production"} completata`,
      ),
    );
    if (target === "production") {
      assert.match(result.stdout, /Deploy Pages Production non necessario/);
      assert.doesNotMatch(result.stdout, /deploy-pages-production\.yml: avviato/);
    }
  }
});

test("crea e completa un nuovo ciclo Production con provider sintetici", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "cf-ready-publish-new-"));
  const bin = path.join(directory, "bin");
  const provider = path.join(bin, "provider.mjs");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(bin);
  writeFileSync(path.join(directory, "package.json"), '{"version":"1.2.3"}\n');
  writeFileSync(
    provider,
    `#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const mode = process.env.FAIL_MODE || "";
const value = (name) => args[args.indexOf(name) + 1];
const marker = (name) => path.join(process.cwd(), "." + name);
const print = (payload) => process.stdout.write(typeof payload === "string" ? payload : JSON.stringify(payload));
if (command === "git") {
  const joined = args.join(" ");
  if (joined === "status --porcelain") print(mode === "dirty" ? " M file\\n" : "");
  else if (joined === "branch --show-current") print(mode === "main" ? "main\\n" : "codex/change\\n");
  else if (joined === "rev-parse HEAD" || joined === "rev-parse refs/heads/codex/change") print("${sourceSha}\\n");
  else if (joined === "rev-parse --git-common-dir") print(".git\\n");
  else if (["${mainSha}", "${developSha}", "${reconciledSha}"].some((sha) => joined === "rev-parse " + sha + ":site")) print("site-tree-new\\n");
  else if (/^rev-parse [0-9a-f]{40}:site$/.test(joined)) print("site-tree-old\\n");
  else if (joined === "ls-remote origin refs/heads/develop") print((["develop-advanced", "workflow-advanced"].includes(mode) ? "${sourceSha}" : "${developSha}") + "\\trefs/heads/develop\\n");
  else if (joined === "ls-remote origin refs/heads/main") print((mode === "no-deploy-main" && !existsSync(marker("nd-promoted")) ? "${noDeployMainSha}" : "${mainSha}") + "\\trefs/heads/main\\n");
  else if (joined === "show -s --format=%P ${mainSha}") print(mode === "bad-promotion" ? "${oldMainSha}\\n" : mode === "no-deploy-main" ? "${noDeployMainSha} ${reconciledSha}\\n" : "${oldMainSha} ${developSha}\\n");
  else if (joined === "show -s --format=%P ${noDeployMainSha}" || joined === "show -s --format=%P ${oldMainSha}" || joined === "show -s --format=%P ${sourceSha}") print("${baseSha}\\n");
  else if (joined === "show -s --format=%P ${reconciledSha}") print("${developSha} ${noDeployMainSha}\\n");
  else if (["${mainSha}", "${developSha}", "${reconciledSha}"].some((sha) => joined === "rev-parse " + sha + "^{tree}")) print("tree\\n");
  else if (joined === "rev-parse ${sourceSha}^{tree}") print("source-tree\\n");
  else if (/^rev-parse [0-9a-f]{40}\\^\\{tree\\}$/.test(joined)) print("old-tree\\n");
  else if (["${developSha}", "${reconciledSha}", "${mainSha}", "${sourceSha}"].some((sha) => joined === "show " + sha + ":package.json")) print('{"version":"1.2.4"}\\n');
  else if (args[0] === "show" && args[1].endsWith(":package.json")) print('{"version":"1.2.3"}\\n');
  else if (joined === "merge-base --is-ancestor ${noDeployMainSha} ${developSha}") process.exitCode = 1;
  else if (args[0] === "merge-base" && args[1] === "--is-ancestor") process.exitCode = 0;
  else if (joined === "rev-parse origin/main") print((["develop-advanced", "bad-promotion"].includes(mode) ? "${oldMainSha}" : mode === "no-deploy-main" && !existsSync(marker("nd-promoted")) ? "${noDeployMainSha}" : "${mainSha}") + "\\n");
  else if (joined === "rev-parse origin/develop") print((mode === "develop-advanced" ? "${sourceSha}" : mode === "no-deploy-main" ? (existsSync(marker("run-reconcile-develop.yml")) ? "${reconciledSha}" : "${developSha}") : "${developSha}") + "\\n");
  else if (joined === "merge-base origin/main origin/develop") print("${mainSha}\\n");
  else if (joined === "merge-base origin/develop ${sourceSha}") print("${baseSha}\\n");
  else if (args[0] === "diff") print("M\\0app/routes/app._index.tsx\\0");
  else if (joined === "ls-remote --heads origin codex/change") print(existsSync(marker("remote-deleted")) ? "" : "${sourceSha}\\trefs/heads/codex/change\\n");
  else if (args[0] === "push") {
    writeFileSync(marker("git-push"), joined + "\\n", { flag: "a" });
    if (args.includes("--delete")) writeFileSync(marker("remote-deleted"), "ok");
  }
  else if (args[0] !== "fetch") process.exitCode = 2;
} else if (command === "npm") {
  writeFileSync(marker("npm-calls"), args.join(" ") + "\\n", { flag: "a" });
  if (mode === "gate-failed") process.exitCode = 1;
} else if (command === "gh") {
  if (args[0] === "run" && args[1] === "download") {
    const environment = value("--name").includes("development") ? "Development" : "Production";
    const commit = environment === "Development" ? "${developSha}" : "${mainSha}";
    const receipt = { schemaVersion: 1, environment, commit, tree: "tree", repository: "owner/repository",
      providerSourceCommit: commit, workflowRun: "https://github.com/owner/repository/actions/runs/" + args[2],
      worker: { deploymentId: "deployment", versionId: "worker", percentage: 100 },
      shopify: { versionId: "shopify", versionTag: "1.2.3", message: environment + " " + commit },
      checks: { migrations: "readback-green", smoke: "green", providerReadback: "green" } };
    writeFileSync(path.join(value("--dir"), "deploy-receipt-" + environment.toLowerCase() + ".json"), JSON.stringify(receipt));
  }
  else if (args[0] === "repo") print({ nameWithOwner: "owner/repository" });
  else if (args[0] === "pr" && args[1] === "list" && value("--head") === "develop" && value("--state") === "open") {
    if (mode === "busy" && !existsSync(marker("busy-seen"))) { writeFileSync(marker("busy-seen"), "ok"); print([{ number: 5 }]); }
    else print([]);
  } else if (args[0] === "pr" && args[1] === "list" && mode === "stale-head") {
    const calls = Number(existsSync(marker("stale-calls")) ? readFileSync(marker("stale-calls"), "utf8") : 0) + 1;
    writeFileSync(marker("stale-calls"), String(calls));
    const head = calls <= 3 ? "${oldMainSha}" : "${sourceSha}";
    print([{ number: 10, state: "OPEN", headRefOid: head, mergeCommit: null, url: "https://github.test/pr/10" }]);
  } else if (args[0] === "pr" && args[1] === "list") print([]);
  else if (args[0] === "pr" && args[1] === "checks") {
    if (!existsSync(marker("checks-seen"))) { writeFileSync(marker("checks-seen"), "ok"); process.stderr.write("no checks reported on the 'codex/change' branch"); process.exitCode = 1; }
    else if (!existsSync(marker("mutation-reported"))) { writeFileSync(marker("mutation-reported"), "ok"); print([{ name: "verify", bucket: mode === "checks-failed" ? "fail" : "pass" }]); }
    else { writeFileSync(marker("mutation-waited"), "ok"); print([{ name: "verify", bucket: mode === "checks-failed" ? "fail" : "pass" }, { name: "mutation", bucket: "pass" }]); }
  }
  else if (args[0] === "pr" && args[1] === "create") {
    if (mode === "stale-head") writeFileSync(marker("stale-created"), "ok");
    if (value("--base") === "main") writeFileSync(marker("promotion-title"), value("--title") + "\\n", { flag: "a" });
    print("https://github.test/pr/" + (value("--base") === "develop" ? 10 : 11) + "\\n");
  } else if (args[0] === "pr" && args[1] === "view") {
    const promotion = String(args[2]).endsWith("11");
    const number = promotion ? 11 : 10;
    const mergeMarker = marker("merge-" + number);
    const viewedMarker = marker("viewed-" + number);
    const merged = existsSync(mergeMarker) && existsSync(viewedMarker);
    if (existsSync(mergeMarker) && !existsSync(viewedMarker)) writeFileSync(viewedMarker, "ok");
    print({ number, state: mode === "closed-pr" ? "CLOSED" : merged ? "MERGED" : "OPEN", headRefOid: promotion ? "${developSha}" : "${sourceSha}", mergeCommit: merged ? { oid: promotion ? "${mainSha}" : "${developSha}" } : null, url: "https://github.test/pr/" + number });
  } else if (args[0] === "pr" && args[1] === "merge") {
    writeFileSync(marker("merge-" + args[2]), "ok");
    writeFileSync(marker("merge-args"), args.join(" ") + "\\n", { flag: "a" });
    if (mode === "no-deploy-main" && args[2] === "11") writeFileSync(marker("nd-promoted"), "ok");
  } else if (args[0] === "run" && args[1] === "list" && !args.includes("--commit")) {
    print([]);
  } else if (args[0] === "run" && args[1] === "list") {
    const workflow = value("--workflow");
    const sha = workflow === "deploy-development.yml" ? "${developSha}" : workflow === "reconcile-develop.yml" ? "${noDeployMainSha}" : "${mainSha}";
    const runMarker = marker("run-" + workflow);
    const polledMarker = marker("polled-" + workflow);
    const generation = marker("generation-" + workflow);
    const databaseId = 20 + Number(existsSync(generation) ? readFileSync(generation, "utf8") : 0);
    if (mode === "workflow-advanced") print([]);
    else if (mode === "workflow-failed") print([{ databaseId: existsSync(marker("workflow-retried")) ? 21 : 20, status: "completed", conclusion: "failure", headSha: sha, url: "https://github.test/run" }]);
    else if (mode === "old-failed-run" && !existsSync(marker("old-run-seen"))) { writeFileSync(marker("old-run-seen"), "ok"); print([{ databaseId: 20, status: "completed", conclusion: "failure", headSha: sha, url: "https://github.test/run" }]); }
    else if (mode === "old-failed-run") print([{ databaseId, status: "completed", conclusion: "success", headSha: sha, url: "https://github.test/run" }]);
    else if (!existsSync(runMarker)) print([]);
    else if (!existsSync(polledMarker)) { writeFileSync(polledMarker, "ok"); print([{ databaseId, status: "queued", conclusion: "", headSha: sha, url: "https://github.test/run" }]); }
    else print([{ databaseId, status: "completed", conclusion: "success", headSha: sha, url: "https://github.test/run" }]);
  } else if (args[0] === "workflow" && args[1] === "run") {
    const generation = marker("generation-" + args[2]);
    writeFileSync(generation, String(Number(existsSync(generation) ? readFileSync(generation, "utf8") : 0) + 1));
    writeFileSync(marker("run-" + args[2]), "ok");
    writeFileSync(marker("workflow-args"), args.join(" ") + "\\n", { flag: "a" });
    if (mode === "workflow-failed") writeFileSync(marker("workflow-retried"), "ok");
  } else if (args[0] === "release" && args[1] === "view") {
    if (existsSync(marker("release"))) print({ tagName: args[2], url: "https://github.test/release" });
    else process.exitCode = 1;
  } else if (args[0] === "release" && args[1] === "create") {
    writeFileSync(marker("release"), "ok");
    writeFileSync(marker("release-args"), args.join(" ") + "\\n", { flag: "a" });
  } else if (args[0] === "api" && args[1] === "repos/{owner}/{repo}/rules/branches/develop") {
    print([{ type: "pull_request" }, { type: "required_status_checks", parameters: { required_status_checks: [{ context: "verify" }, { context: "mutation" }] } }]);
  } else if (args[0] === "api") {
    print({ object: { sha: mode === "release-mismatch" ? "${sourceSha}" : "${mainSha}" } });
  } else process.exitCode = 2;
} else process.exitCode = 2;
`,
  );
  chmodSync(provider, 0o755);
  for (const command of ["git", "gh", "npm"]) symlinkSync(provider, path.join(bin, command));

  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "publish.mjs"), "--target", "production"],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        CF_READY_PUBLISH_POLL_MS: "1",
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /deploy-development\.yml: avviato/);
  assert.match(result.stdout, /deploy-production\.yml: avviato/);
  assert.match(result.stdout, /deploy-pages-production\.yml: avviato/);
  assert.match(result.stdout, /Pubblicazione Production completata/);
  // La versione viene dal candidato promosso, non dal worktree locale (1.2.3).
  assert.equal(
    readFileSync(path.join(directory, ".promotion-title"), "utf8"),
    "chore: promuovi CF Ready 1.2.4\n",
  );
  assert.match(
    readFileSync(path.join(directory, ".release-args"), "utf8"),
    /^release create v1\.2\.4 --target /m,
  );
  assert.match(result.stdout, /Gate locale della corsia standard prima del push/);
  assert.match(result.stdout, /PR #10: attendo i check obbligatori/);
  assert.ok(existsSync(path.join(directory, ".mutation-waited")));
  const mergeArgs = readFileSync(path.join(directory, ".merge-args"), "utf8");
  assert.match(mergeArgs, /^pr merge 10 --auto --squash$/m);
  assert.doesNotMatch(mergeArgs, /--delete-branch/);
  assert.equal(
    readFileSync(path.join(directory, ".git-push"), "utf8"),
    "push --set-upstream origin codex/change\npush --quiet origin --delete codex/change\n",
  );
  assert.equal(
    readFileSync(path.join(directory, ".npm-calls"), "utf8"),
    `run check:local\nrun test:changed -- ${baseSha}\n`,
  );

  const queued = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "publish.mjs"), "--target", "development"],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        CF_READY_PUBLISH_POLL_MS: "1",
        FAIL_MODE: "busy",
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
    },
  );
  assert.equal(queued.status, 0, queued.stderr);
  assert.match(queued.stdout, /Attendo la fine della pubblicazione già in corso/);

  const stale = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "publish.mjs"), "--target", "development"],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        CF_READY_PUBLISH_POLL_MS: "1",
        FAIL_MODE: "stale-head",
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
    },
  );
  assert.equal(stale.status, 0, stale.stderr);
  assert.equal(existsSync(path.join(directory, ".stale-created")), false);
  assert.equal(readFileSync(path.join(directory, ".stale-calls"), "utf8"), "4");

  const linked = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "publish.mjs"), "--target", "production"],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        CF_READY_PUBLISH_POLL_MS: "1",
        FAIL_MODE: "no-deploy-main",
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
    },
  );
  assert.equal(linked.status, 0, linked.stderr);
  assert.match(linked.stdout, /promozione senza deploy non collegata: riallineo develop/);
  assert.match(linked.stdout, /Pubblicazione Production completata/);
  assert.match(
    readFileSync(path.join(directory, ".workflow-args"), "utf8"),
    /^workflow run reconcile-develop\.yml --ref main -f mode=no-deploy-promotion$/m,
  );

  const retried = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "publish.mjs"), "--target", "production"],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        CF_READY_PUBLISH_POLL_MS: "1",
        FAIL_MODE: "old-failed-run",
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
    },
  );
  assert.equal(retried.status, 0, retried.stderr);

  for (const [mode, message] of [
    ["dirty", /worktree deve essere pulito/],
    ["gate-failed", /npm run check:local non riuscito/],
    ["checks-failed", /La PR #10 ha check falliti: verify/],
    ["main", /branch della modifica/],
    ["closed-pr", /La PR #10 è CLOSED/],
    ["workflow-advanced", /develop è avanzato prima dell'avvio/],
    ["workflow-failed", /deploy-development\.yml concluso con failure/],
    ["develop-advanced", /develop è avanzato/],
    ["bad-promotion", /merge Production non conserva/],
    ["release-mismatch", /v1\.2\.4 esiste su un commit diverso/],
  ]) {
    const failed = spawnSync(
      process.execPath,
      [path.join(root, "scripts", "publish.mjs"), "--target", "production"],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          CF_READY_PUBLISH_POLL_MS: "1",
          FAIL_MODE: mode,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        },
      },
    );
    assert.equal(failed.status, 1, failed.stdout);
    assert.match(failed.stderr, message);
    if (mode === "workflow-failed") {
      const record = JSON.parse(
        readFileSync(
          path.join(directory, ".git/cf-ready-publications", `${sourceSha}.json`),
          "utf8",
        ),
      );
      assert.equal(record.status, "failed");
      assert.equal(record.phases.at(-1).status, "failed");
      assert.equal(record.activePhase, "Deploy e readback Development");
    }
  }
});

test("promuove il lotto di develop secondo superficie e versione", (t) => {
  const deployedSha = "3".repeat(40);
  const promote = (mode) => {
    const directory = mkdtempSync(path.join(tmpdir(), `cf-ready-promote-${mode}-`));
    const bin = path.join(directory, "bin");
    const provider = path.join(bin, "provider.mjs");
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    mkdirSync(bin);
    writeFileSync(
      provider,
      `#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const joined = args.join(" ");
const mode = process.env.FAIL_MODE;
const value = (name) => args[args.indexOf(name) + 1];
const marker = (name) => path.join(process.cwd(), "." + name);
const print = (payload) => process.stdout.write(typeof payload === "string" ? payload : JSON.stringify(payload));
const tooling = ["tooling", "bump-only"].includes(mode);
const bumped = !["tooling", "no-bump"].includes(mode);
if (command === "git") {
  if (joined === "rev-parse --git-common-dir") print(".git\\n");
  else if (joined === "rev-parse origin/develop") print("${developSha}\\n");
  else if (joined === "rev-parse origin/main") print("${oldMainSha}\\n");
  else if (joined === "rev-parse ${oldMainSha}^{tree}") print(mode === "nothing" ? "tree\\n" : "old-tree\\n");
  else if (args[0] === "rev-parse" && joined.endsWith("^{tree}")) print("tree\\n");
  else if (args[0] === "rev-parse" && joined.endsWith(":site")) print("site-tree\\n");
  else if (joined === "show -s --format=%P ${oldMainSha}") print("${baseSha}\\n");
  else if (joined === "show -s --format=%P ${mainSha}") print("${oldMainSha} ${developSha}\\n");
  else if (joined === "show ${oldMainSha}:package.json") print('{"version":"1.2.3"}\\n');
  else if (args[0] === "show") print(bumped ? '{"version":"1.2.4"}\\n' : '{"version":"1.2.3"}\\n');
  else if (args[0] === "diff") print(tooling ? "M\\0scripts/task.mjs\\0" : "M\\0app/root.tsx\\0");
  else if (joined === "ls-remote origin refs/heads/develop") print("${developSha}\\trefs/heads/develop\\n");
  else if (joined === "ls-remote origin refs/heads/main") print("${mainSha}\\trefs/heads/main\\n");
  else if (joined === "merge-base origin/main origin/develop") print("${oldMainSha}\\n");
  else if (args[0] !== "fetch" && args[0] !== "merge-base") process.exitCode = 2;
} else if (command === "gh") {
  if (args[0] === "repo") print({ nameWithOwner: "owner/repository" });
  else if (args[0] === "run" && args[1] === "list" && args.includes("--status")) {
    print([{ databaseId: 30, status: "completed", conclusion: "success", headSha: mode === "stale" ? "${deployedSha}" : "${developSha}", url: "https://github.test/run" }]);
  } else if (args[0] === "run" && args[1] === "list") {
    const workflow = value("--workflow");
    print(existsSync(marker("run-" + workflow)) ? [{ databaseId: 40, status: "completed", conclusion: "success", headSha: value("--commit"), url: "https://github.test/run" }] : []);
  } else if (args[0] === "workflow") {
    writeFileSync(marker("run-" + args[2]), "ok");
  } else if (args[0] === "run" && args[1] === "download") {
    const name = value("--name");
    const environment = name.includes("development") ? "Development" : "Production";
    const commit = name.slice(-40);
    writeFileSync(path.join(value("--dir"), "deploy-receipt-" + environment.toLowerCase() + ".json"), JSON.stringify({
      schemaVersion: 1, environment, commit, tree: "tree", repository: "owner/repository", providerSourceCommit: commit,
      workflowRun: "https://github.com/owner/repository/actions/runs/" + args[2],
      worker: { deploymentId: "deployment", versionId: "worker", percentage: 100 },
      shopify: { versionId: "shopify", versionTag: "1.2.4", message: environment + " " + commit },
      checks: { migrations: "readback-green", smoke: "green", providerReadback: "green" } }));
  } else if (args[0] === "pr" && args[1] === "list") print([]);
  else if (args[0] === "pr" && args[1] === "create") {
    writeFileSync(marker("title"), value("--title"));
    print("https://github.test/pr/11\\n");
  } else if (args[0] === "pr" && args[1] === "view") {
    const merged = existsSync(marker("merged"));
    print({ number: 11, state: merged ? "MERGED" : "OPEN", headRefOid: "${developSha}", mergeCommit: merged ? { oid: "${mainSha}" } : null, url: "https://github.test/pr/11" });
  } else if (args[0] === "pr" && args[1] === "merge") writeFileSync(marker("merged"), "ok");
  else if (args[0] === "release" && args[1] === "view") {
    if (existsSync(marker("release"))) print({ tagName: args[2], url: "https://github.test/release" });
    else process.exitCode = 1;
  } else if (args[0] === "release" && args[1] === "create") writeFileSync(marker("release"), args[2]);
  else process.exitCode = 2;
} else process.exitCode = 2;
`,
    );
    chmodSync(provider, 0o755);
    for (const command of ["git", "gh"]) symlinkSync(provider, path.join(bin, command));
    const result = spawnSync(
      process.execPath,
      [path.join(root, "scripts/publish.mjs"), "--promote"],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          CF_READY_PUBLISH_POLL_MS: "1",
          FAIL_MODE: mode,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        },
      },
    );
    const read = (name) =>
      existsSync(path.join(directory, `.${name}`))
        ? readFileSync(path.join(directory, `.${name}`), "utf8")
        : undefined;
    return { ...result, read, directory };
  };

  const batch = promote("batch");
  assert.equal(batch.status, 0, batch.stderr);
  assert.match(batch.stdout, new RegExp(`Development già verificato su ${developSha}`));
  assert.equal(batch.read("run-deploy-development.yml"), undefined);
  assert.match(batch.stdout, /deploy-production\.yml: avviato/);
  assert.equal(batch.read("title"), "chore: promuovi CF Ready 1.2.4");
  assert.equal(batch.read("release"), "v1.2.4");
  assert.match(batch.stdout, /Promozione Production completata: .*https:\/\/github\.test\/release/);
  const record = JSON.parse(
    readFileSync(
      path.join(batch.directory, ".git/cf-ready-publications", `promotion-${developSha}.json`),
      "utf8",
    ),
  );
  assert.equal(record.status, "complete");
  assert.deepEqual(record.plan, { version: "1.2.4", deploy: true, release: true, site: false });
  assert.deepEqual(
    record.receipts.map(({ environment }) => environment),
    ["Development", "Production"],
  );

  const stale = promote("stale");
  assert.equal(stale.status, 0, stale.stderr);
  assert.match(stale.stdout, /deploy-development\.yml: avviato/);

  const tooling = promote("tooling");
  assert.equal(tooling.status, 0, tooling.stderr);
  assert.equal(tooling.read("title"), "chore: promuovi CF Ready 1.2.3 senza deploy");
  assert.match(tooling.stdout, /Deploy Production non necessario/);
  assert.match(tooling.stdout, /Riallineamento di develop rinviato/);
  assert.match(tooling.stdout, /Release non necessaria: 1\.2\.3/);
  assert.equal(tooling.read("run-deploy-production.yml"), undefined);
  assert.equal(tooling.read("release"), undefined);

  const nothing = promote("nothing");
  assert.equal(nothing.status, 0, nothing.stderr);
  assert.match(nothing.stdout, /Niente da promuovere/);
  assert.equal(nothing.read("title"), undefined);

  for (const [mode, message] of [
    ["no-bump", /resta 1\.2\.3: prepara il bump/],
    ["bump-only", /La versione 1\.2\.4 non ha superfici distribuite/],
  ]) {
    const failed = promote(mode);
    assert.equal(failed.status, 1, failed.stdout);
    assert.match(failed.stderr, message);
    assert.equal(failed.read("title"), undefined);
  }
});

test("l'entrypoint rende visibile un comando Git non eseguibile", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "cf-ready-publish-error-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "publish.mjs"), "--target", "development"],
    {
      cwd: directory,
      encoding: "utf8",
      env: { ...process.env, CF_READY_PUBLISH_POLL_MS: "1", PATH: directory },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /git status --porcelain non riuscito/);
});
