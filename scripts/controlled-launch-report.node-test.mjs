import assert from "node:assert/strict";
import { test } from "node:test";

import {
  commandFor,
  fetchReport,
  parseEnvironment,
  parseWranglerResult,
} from "./controlled-launch-report.mjs";

const row = {
  generated_at: "2026-08-25 12:00:00",
  stores_total: 3,
  stores_active: 2,
  installs_7d: 1,
  installs_30d: 2,
  onboarding_completed: 2,
  validations_enabled: 1,
  stores_with_open_error: 0,
  trials_active: 1,
  paying_or_paid_stores: 1,
  complimentary_stores: 1,
  error_events_7d: 0,
  failed_webhooks_7d: 0,
};

test("richiede una scelta esplicita tra Development e Production", () => {
  assert.equal(parseEnvironment(["development"]), "development");
  assert.equal(parseEnvironment(["production"]), "production");
  assert.throws(() => parseEnvironment([]), /development\|production/);
  assert.throws(() => parseEnvironment(["prod"]), /development\|production/);
  assert.throws(() => parseEnvironment(["production", "extra"]), /development\|production/);
});

test("esegue soltanto una SELECT aggregata sul database remoto scelto", () => {
  const development = commandFor("development");
  const production = commandFor("production");

  assert.deepEqual(development.slice(0, 8), [
    "exec",
    "--",
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--remote",
    "--json",
  ]);
  assert.match(development.join(" "), /SELECT[\s\S]*COUNT/);
  assert.doesNotMatch(development.join(" "), /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i);
  assert.doesNotMatch(development.join(" "), /shop_domain|metadata_json/);
  assert.doesNotMatch(development.join(" "), /SELECT[\s\S]*last_error_code\s+AS/i);
  assert.match(development.join(" "), /trials\.status = 'active'/);
  assert.match(development.join(" "), /trials\.ends_at >= date\('now'\)/);
  assert.equal(development.join(" ").match(/shops\.installation_status = 'active'/g)?.length, 7);
  assert.match(development.join(" "), /LEFT JOIN trials ON trials\.shop_id = shops\.id/);
  assert.equal(development.join(" ").match(/COALESCE\(SUM\(/g)?.length, 9);
  assert.deepEqual(production.slice(-2), ["--env", "production"]);
});

test("produce conteggi a zero quando il database non contiene store", () => {
  const empty = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, key === "generated_at" ? value : 0]),
  );

  assert.deepEqual(
    parseWranglerResult(JSON.stringify([{ success: true, results: [empty] }])),
    empty,
  );
});

test("accetta soltanto il risultato aggregato completo", () => {
  assert.deepEqual(parseWranglerResult(JSON.stringify([{ success: true, results: [row] }])), row);
  assert.throws(() => parseWranglerResult("no"), /JSON valido/);
  assert.throws(
    () => parseWranglerResult(JSON.stringify([{ success: false, results: [] }])),
    /report aggregato/,
  );
  assert.throws(
    () =>
      parseWranglerResult(
        JSON.stringify([{ success: true, results: [{ ...row, stores_total: -1 }] }]),
      ),
    /stores_total/,
  );
});

test("non inoltra l'output Wrangler quando la lettura fallisce", () => {
  assert.throws(
    () => fetchReport("production", { spawn: () => ({ status: 1, stdout: "", stderr: "secret" }) }),
    /lettura aggregata D1/,
  );
});
