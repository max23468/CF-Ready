import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkVersionPolicy,
  compareVersions,
  nextVersions,
  packageManifest,
  runVersionPolicy,
} from "./version-policy.mjs";

const script = fileURLToPath(new URL("./version-policy.mjs", import.meta.url));

test("confronta versioni SemVer e ne calcola i passi successivi", () => {
  assert.ok(compareVersions("2.10.0", "2.9.9") > 0);
  assert.equal(compareVersions("2.2.16", "2.2.16"), 0);
  assert.deepEqual(nextVersions("2.2.15"), ["2.2.16", "2.3.0", "3.0.0"]);
  assert.throws(() => compareVersions("2.2", "2.2.0"), /SemVer non valida/);
});

test("il lotto non promosso porta una sola versione legata alle superfici distribuite", () => {
  const policy = (overrides) =>
    checkVersionPolicy({ promoted: "2.2.15", base: "2.2.15", head: "2.2.15", ...overrides });
  assert.equal(policy({ release: false }), "nessun bump");
  assert.equal(policy({ head: "2.2.16", release: true }), "bump 2.2.15 → 2.2.16");
  assert.equal(
    policy({ base: "2.2.16", head: "2.2.16", release: true }),
    "riusa 2.2.16 del lotto non promosso",
  );
  assert.equal(policy({ base: "2.2.16", head: "2.3.0", release: true }), "bump 2.2.15 → 2.3.0");
  assert.equal(policy({ release: true, dependencyUpdate: true }), "nessun bump");
  assert.throws(() => policy({ release: true }), /prepara il bump di 2\.2\.15/);
  assert.throws(() => policy({ head: "2.2.16", release: false }), /senza superfici distribuite/);
  assert.throws(
    () => policy({ base: "2.2.16", head: "2.2.17", release: true }),
    /un solo passo da 2\.2\.15/,
  );
  assert.throws(() => policy({ base: "2.2.16", head: "2.2.15", release: true }), /scende/);
});

test("il comando legge i manifest dai commit e dal worktree", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "cf-ready-version-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", ...args],
      { cwd: directory, encoding: "utf8" },
    ).trim();
  const commit = (version, files = {}) => {
    writeFileSync(path.join(directory, "package.json"), `${JSON.stringify({ version })}\n`);
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      writeFileSync(path.join(directory, file), content);
    }
    git("add", ".");
    git("commit", "--quiet", "-m", version);
    return git("rev-parse", "HEAD");
  };
  git("init", "--quiet", "--initial-branch", "main");
  const base = commit("1.0.0");
  git("switch", "--quiet", "-c", "develop");
  const runtime = commit("1.0.1", { "app/root.tsx": "export {};\n" });
  const run = (head, extra = []) =>
    spawnSync(
      process.execPath,
      [script, "--base-sha", base, "--head-sha", head, "--main-ref", "main", ...extra],
      { cwd: directory, encoding: "utf8" },
    );
  const bumped = run(runtime);
  assert.equal(bumped.status, 0, bumped.stderr);
  assert.match(bumped.stdout, /Versione: bump 1\.0\.0 → 1\.0\.1\./);
  const tooling = commit("1.0.2", { "scripts/task.mjs": "export {};\n" });
  const rejected = spawnSync(
    process.execPath,
    [script, "--base-sha", runtime, "--head-sha", tooling, "--main-ref", "main"],
    { cwd: directory, encoding: "utf8" },
  );
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /senza superfici distribuite/);

  writeFileSync(path.join(directory, "package.json"), `${JSON.stringify({ version: "1.0.0" })}\n`);
  assert.equal(
    runVersionPolicy({
      baseSha: base,
      headSha: tooling,
      files: ["scripts/task.mjs", "package.json"],
      mainRef: "main",
      workingTree: true,
      cwd: directory,
    }),
    "nessun bump",
  );
  assert.equal(packageManifest("missing-ref", { cwd: directory }), undefined);
  assert.throws(
    () => runVersionPolicy({ baseSha: base, headSha: "missing-ref", files: [], cwd: directory }),
    /Manifest package\.json non leggibile/,
  );
});
