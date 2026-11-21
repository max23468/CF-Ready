import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BUDGET_MS,
  changedFiles,
  main,
  run,
  selectChecks,
  verifiedByLocalGate,
} from "./pre-push.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("il pre-push controlla solo ciò che il diff può rompere, con i tipi prima del lint", () => {
  assert.deepEqual(selectChecks(["docs/decisions.md"]), { prepare: [], checks: [] });
  assert.deepEqual(selectChecks(["app/root.tsx", "site/index.html", "site/menu.js"]), {
    prepare: [["npm", ["run", "typegen"]]],
    checks: [
      ["npx", ["oxfmt", "--check", "app/root.tsx", "site/menu.js"]],
      ["npx", ["oxlint", "app/root.tsx", "site/menu.js"]],
      ["npx", ["tsc", "--noEmit"]],
    ],
  });
  assert.deepEqual(selectChecks(["vitest.config.ts"]).checks[0], [
    "npx",
    ["oxfmt", "--check", "vitest.config.ts"],
  ]);
});

test("un controllo rosso o il budget superato fermano il push", async () => {
  const messages = [];
  const options = (statuses, elapsed, executed = []) => {
    let clock = 0;
    return {
      env: {},
      files: () => ["app/root.tsx"],
      verified: () => false,
      execute: async ([command, args]) => {
        executed.push(`${command} ${args[0]}`);
        return { command: `${command} ${args[0]}`, status: statuses.shift() ?? 0, output: "x" };
      },
      now: () => (clock += elapsed),
      log: (message) => messages.push(message),
      error: (message) => messages.push(message),
    };
  };
  const executed = [];
  assert.equal(await main(options([0, 0, 0, 0], 1_000, executed)), 0);
  assert.deepEqual(executed, ["npm run", "npx oxfmt", "npx oxlint", "npx tsc"]);
  assert.match(messages.pop(), /^pre-push verde in 1000 ms\.$/);
  assert.equal(await main(options([0, 0, 1, 0], 1_000)), 1);
  assert.match(messages.pop(), /✗ npx oxlint\nx/);
  // Senza tipi rigenerati lint e typecheck non partono.
  const stopped = [];
  assert.equal(await main(options([1], 1_000, stopped)), 1);
  assert.deepEqual(stopped, ["npm run"]);
  assert.equal(await main(options([0, 0, 0, 0], BUDGET_MS + 1)), 1);
  assert.match(messages.pop(), /oltre il budget: 9001 ms su 9000 ms/);
  assert.equal(await main({ env: { CI: "true" }, files: () => assert.fail() }), 0);
  const skipped = { env: {}, verified: () => true, files: () => assert.fail() };
  assert.equal(await main({ ...skipped, log: (message) => messages.push(message) }), 0);
  assert.match(messages.pop(), /già verificato dal gate locale/);
});

test("la ricevuta del gate locale vale solo per lo stesso tree", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "cf-ready-receipt-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) =>
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", ...args], {
      cwd: directory,
      encoding: "utf8",
    }).stdout.trim();
  git("init", "--quiet");
  writeFileSync(path.join(directory, "a.ts"), "1\n");
  git("add", "a.ts");
  git("commit", "--quiet", "-m", "a");
  assert.equal(verifiedByLocalGate(directory), false);
  const receipts = path.join(directory, ".git", "cf-ready-publications");
  mkdirSync(receipts);
  writeFileSync(path.join(receipts, `local-gate-${git("rev-parse", "HEAD^{tree}")}.json`), "{}");
  assert.equal(verifiedByLocalGate(directory), true);
  writeFileSync(path.join(directory, "a.ts"), "2\n");
  git("commit", "--quiet", "-am", "b");
  assert.equal(verifiedByLocalGate(directory), false);
});

test("i file cambiati partono da develop o, senza, dall'ultimo commit", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "cf-ready-changed-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) =>
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", ...args], {
      cwd: directory,
      encoding: "utf8",
    });
  git("init", "--quiet");
  writeFileSync(path.join(directory, "a.ts"), "1\n");
  git("add", "a.ts");
  git("commit", "--quiet", "-m", "a");
  git("update-ref", "refs/remotes/origin/develop", "HEAD");
  writeFileSync(path.join(directory, "b.ts"), "1\n");
  git("add", "b.ts");
  git("commit", "--quiet", "-m", "b");
  writeFileSync(path.join(directory, "c.ts"), "1\n");
  git("add", "c.ts");
  git("commit", "--quiet", "-m", "c");
  assert.deepEqual(changedFiles(directory), ["b.ts", "c.ts"]);
  git("update-ref", "-d", "refs/remotes/origin/develop");
  assert.deepEqual(changedFiles(directory), ["c.ts"]);

  const result = await run(["node", ["-e", "console.log('ok'); process.exit(3)"]]);
  assert.deepEqual(result, { command: "node -e", status: 3, output: "ok\n" });
});

test("l'hook versionato lancia il gate e npm install lo attiva", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "cf-ready-hooks-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const run = (command, args) =>
    spawnSync(command, args, { cwd: directory, encoding: "utf8", env: { ...process.env } });
  assert.equal(run("git", ["init", "--quiet"]).status, 0);
  assert.equal(run("node", [path.join(root, "scripts/install-hooks.mjs")]).status, 0);
  assert.equal(run("git", ["config", "--get", "core.hooksPath"]).stdout.trim(), ".githooks");

  // Fuori da un checkout Git l'installazione non fallisce e non scrive nulla.
  const plain = mkdtempSync(path.join(tmpdir(), "cf-ready-no-git-"));
  t.after(() => rmSync(plain, { recursive: true, force: true }));
  writeFileSync(path.join(plain, "package.json"), "{}");
  const outside = spawnSync("node", [path.join(root, "scripts/install-hooks.mjs")], {
    cwd: plain,
    env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(plain) },
  });
  assert.equal(outside.status, 0);

  const hook = spawnSync("sh", [path.join(root, ".githooks/pre-push")], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
  });
  assert.equal(hook.status, 0);
});
