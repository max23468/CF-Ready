import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(readFileSync(path.join(root, "config/migration-policy.json"), "utf8"));

test("il registro rende immutabili e classifica tutte le migrazioni applicate", () => {
  const names = readdirSync(path.join(root, "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.equal(policy.schemaVersion, 1);
  assert.deepEqual(
    policy.migrations.map(({ name }) => name),
    names,
  );
  assert.deepEqual(
    names.map((name) => name.slice(0, 4)),
    names.map((_, index) => String(index + 1).padStart(4, "0")),
  );

  for (const migration of policy.migrations) {
    const sql = readFileSync(path.join(root, "migrations", migration.name));
    assert.equal(createHash("sha256").update(sql).digest("hex"), migration.sha256);
    assert.ok(migration.protects.length > 0, `${migration.name} non protegge alcun comportamento`);
    assert.equal(new Set(migration.protects).size, migration.protects.length);
  }
});

test("Wrangler applica le migrazioni in sequenza e il secondo passaggio è idempotente", () => {
  const persistenceDirectory = mkdtempSync(path.join(tmpdir(), "cf-ready-d1-migrations-"));
  const wrangler = path.join(root, "node_modules/wrangler/bin/wrangler.js");
  const run = () =>
    execFileSync(
      process.execPath,
      [
        wrangler,
        "d1",
        "migrations",
        "apply",
        "DB",
        "--local",
        `--persist-to=${persistenceDirectory}`,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
      },
    );

  try {
    const firstRun = run();
    for (const { name } of policy.migrations) assert.match(firstRun, new RegExp(name));
    assert.match(run(), /No migrations to apply/);

    const databasePath = readdirSync(persistenceDirectory, { recursive: true, encoding: "utf8" })
      .filter(
        (entry) =>
          entry.includes(`${path.sep}d1${path.sep}`) &&
          entry.endsWith(".sqlite") &&
          path.basename(entry) !== "metadata.sqlite",
      )
      .map((entry) => path.join(persistenceDirectory, entry));
    assert.equal(databasePath.length, 1);
    const database = new DatabaseSync(databasePath[0], { readOnly: true });
    try {
      assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
      assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(
        database.prepare("SELECT COUNT(*) AS count FROM d1_migrations").get().count,
        policy.migrations.length,
      );
    } finally {
      database.close();
    }
  } finally {
    rmSync(persistenceDirectory, { recursive: true, force: true });
  }
});
