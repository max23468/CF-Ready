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
import path from "node:path";
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
const print = (payload) => process.stdout.write(typeof payload === "string" ? payload : JSON.stringify(payload));
if (command === "git") {
  const joined = args.join(" ");
  if (joined === "status --porcelain") print("");
  else if (joined === "branch --show-current") print("codex/change\\n");
  else if (joined === "rev-parse HEAD") print("${sourceSha}\\n");
  else if (joined === "ls-remote origin refs/heads/develop") print("${developSha}\\trefs/heads/develop\\n");
  else if (joined === "show -s --format=%P ${mainSha}") print("${oldMainSha} ${developSha}\\n");
  else if (joined === "rev-parse ${mainSha}^{tree}" || joined === "rev-parse ${developSha}^{tree}") print("tree\\n");
  else if (joined === "rev-parse origin/main" || joined === "rev-parse origin/develop") print("${mainSha}\\n");
  else if (joined === "merge-base origin/main origin/develop") print("${mainSha}\\n");
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
  }
});
