import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isReconciled, latestWorkflowRun, parseTarget, selectWorkflowRun } from "./publish.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceSha = "a".repeat(40);
const developSha = "b".repeat(40);
const mainSha = "c".repeat(40);
const oldMainSha = "d".repeat(40);

test("richiede un target di pubblicazione esplicito", () => {
  assert.equal(parseTarget(["--target", "development"]), "development");
  assert.equal(parseTarget(["--target", "production"]), "production");
  assert.throws(() => parseTarget([]), /--target/);
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
import { existsSync, writeFileSync } from "node:fs";
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
  else if (joined === "rev-parse HEAD") print("${sourceSha}\\n");
  else if (joined === "rev-parse ${mainSha}:site" || joined === "rev-parse ${mainSha}^1:site") print("site-tree\\n");
  else if (joined === "ls-remote origin refs/heads/develop") print((mode === "develop-advanced" ? "${sourceSha}" : "${developSha}") + "\\trefs/heads/develop\\n");
  else if (joined === "show -s --format=%P ${mainSha}") print("${oldMainSha} ${developSha}\\n");
  else if (joined === "rev-parse ${mainSha}^{tree}" || joined === "rev-parse ${developSha}^{tree}") print("tree\\n");
  else if (joined === "rev-parse origin/main") print("${mainSha}\\n");
  else if (joined === "rev-parse origin/develop") print((existsSync(marker("reconciled")) ? "${mainSha}" : "${developSha}") + "\\n");
  else if (joined === "merge-base origin/main origin/develop") {
    if (existsSync(marker("reconciled"))) print("${mainSha}\\n");
    else { writeFileSync(marker("reconciled"), "ok"); print("${oldMainSha}\\n"); }
  }
  else if (args[0] !== "fetch") process.exitCode = 2;
} else if (command === "gh") {
  if (args[0] === "repo") print({ nameWithOwner: "owner/repository" });
  else if (args[0] === "pr" && args[1] === "list") {
    const development = value("--head") === "codex/change";
    print([{ number: development ? 10 : 11, state: "MERGED", headRefOid: development ? "${sourceSha}" : "${developSha}", mergeCommit: { oid: development ? "${developSha}" : "${mainSha}" }, url: "https://github.test/pr" }]);
  } else if (args[0] === "run" && args[1] === "list") {
    const development = value("--workflow") === "deploy-development.yml";
    print([{ databaseId: development ? 20 : 21, status: "completed", conclusion: "success", headSha: development ? "${developSha}" : "${mainSha}", url: "https://github.test/run" }]);
  } else if (args[0] === "release" && args[1] === "view") print({ tagName: "v1.2.3", url: "https://github.test/release" });
  else if (args[0] === "api") print({ object: { sha: "${mainSha}" } });
  else process.exitCode = 2;
} else process.exitCode = 2;
`,
  );
  chmodSync(provider, 0o755);
  for (const command of ["git", "gh"]) {
    symlinkSync(provider, path.join(bin, command));
  }

  for (const target of ["development", "production"]) {
    const result = spawnSync(
      process.execPath,
      [path.join(root, "scripts", "publish.mjs"), "--target", target],
      {
        cwd: directory,
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
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
import { existsSync, writeFileSync } from "node:fs";
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
  else if (joined === "rev-parse HEAD") print("${sourceSha}\\n");
  else if (joined === "rev-parse ${mainSha}:site") print("site-tree-new\\n");
  else if (joined === "rev-parse ${mainSha}^1:site") print("site-tree-old\\n");
  else if (joined === "ls-remote origin refs/heads/develop") print((["develop-advanced", "workflow-advanced"].includes(mode) ? "${sourceSha}" : "${developSha}") + "\\trefs/heads/develop\\n");
  else if (joined === "ls-remote origin refs/heads/main") print("${mainSha}\\trefs/heads/main\\n");
  else if (joined === "show -s --format=%P ${mainSha}") print(mode === "bad-promotion" ? "${oldMainSha}\\n" : "${oldMainSha} ${developSha}\\n");
  else if (joined === "rev-parse ${mainSha}^{tree}" || joined === "rev-parse ${developSha}^{tree}") print("tree\\n");
  else if (joined === "rev-parse origin/main" || joined === "rev-parse origin/develop") print("${mainSha}\\n");
  else if (joined === "merge-base origin/main origin/develop") print("${mainSha}\\n");
  else if (args[0] !== "push" && args[0] !== "fetch") process.exitCode = 2;
} else if (command === "gh") {
  if (args[0] === "repo") print({ nameWithOwner: "owner/repository" });
  else if (args[0] === "pr" && args[1] === "list") print([]);
  else if (args[0] === "pr" && args[1] === "create") {
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
  } else if (args[0] === "run" && args[1] === "list") {
    const workflow = value("--workflow");
    const sha = workflow === "deploy-development.yml" ? "${developSha}" : "${mainSha}";
    const runMarker = marker("run-" + workflow);
    const polledMarker = marker("polled-" + workflow);
    if (mode === "workflow-advanced") print([]);
    else if (mode === "workflow-failed") print([{ databaseId: existsSync(marker("workflow-retried")) ? 21 : 20, status: "completed", conclusion: "failure", headSha: sha, url: "https://github.test/run" }]);
    else if (mode === "old-failed-run" && !existsSync(marker("old-run-seen"))) { writeFileSync(marker("old-run-seen"), "ok"); print([{ databaseId: 20, status: "completed", conclusion: "failure", headSha: sha, url: "https://github.test/run" }]); }
    else if (mode === "old-failed-run") print([{ databaseId: 21, status: "completed", conclusion: "success", headSha: sha, url: "https://github.test/run" }]);
    else if (!existsSync(runMarker)) print([]);
    else if (!existsSync(polledMarker)) { writeFileSync(polledMarker, "ok"); print([{ databaseId: 20, status: "queued", conclusion: "", headSha: sha, url: "https://github.test/run" }]); }
    else print([{ databaseId: 20, status: "completed", conclusion: "success", headSha: sha, url: "https://github.test/run" }]);
  } else if (args[0] === "workflow" && args[1] === "run") {
    writeFileSync(marker("run-" + args[2]), "ok");
    if (mode === "workflow-failed") writeFileSync(marker("workflow-retried"), "ok");
  } else if (args[0] === "release" && args[1] === "view") {
    if (existsSync(marker("release"))) print({ tagName: "v1.2.3", url: "https://github.test/release" });
    else process.exitCode = 1;
  } else if (args[0] === "release" && args[1] === "create") {
    writeFileSync(marker("release"), "ok");
  } else if (args[0] === "api") {
    print({ object: { sha: mode === "release-mismatch" ? "${sourceSha}" : "${mainSha}" } });
  } else process.exitCode = 2;
} else process.exitCode = 2;
`,
  );
  chmodSync(provider, 0o755);
  for (const command of ["git", "gh"]) symlinkSync(provider, path.join(bin, command));

  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "publish.mjs"), "--target", "production"],
    {
      cwd: directory,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /deploy-development\.yml: avviato/);
  assert.match(result.stdout, /deploy-production\.yml: avviato/);
  assert.match(result.stdout, /deploy-pages-production\.yml: avviato/);
  assert.match(result.stdout, /Pubblicazione Production completata/);

  const retried = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "publish.mjs"), "--target", "production"],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        FAIL_MODE: "old-failed-run",
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
    },
  );
  assert.equal(retried.status, 0, retried.stderr);

  for (const [mode, message] of [
    ["dirty", /worktree deve essere pulito/],
    ["main", /branch della modifica/],
    ["closed-pr", /La PR #10 è CLOSED/],
    ["workflow-advanced", /develop è avanzato prima dell'avvio/],
    ["workflow-failed", /deploy-development\.yml concluso con failure/],
    ["develop-advanced", /develop è avanzato/],
    ["bad-promotion", /merge Production non conserva/],
    ["release-mismatch", /v1\.2\.3 esiste su un commit diverso/],
  ]) {
    const failed = spawnSync(
      process.execPath,
      [path.join(root, "scripts", "publish.mjs"), "--target", "production"],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          FAIL_MODE: mode,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        },
      },
    );
    assert.equal(failed.status, 1, failed.stdout);
    assert.match(failed.stderr, message);
  }
});

test("l'entrypoint rende visibile un comando Git non eseguibile", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "cf-ready-publish-error-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "publish.mjs"), "--target", "development"],
    { cwd: directory, encoding: "utf8", env: { ...process.env, PATH: directory } },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /git status --porcelain non riuscito/);
});
