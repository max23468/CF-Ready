import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FUNNEL_QUERY,
  parseFunnel,
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
    parseWranglerResult(
      JSON.stringify([
        { success: true, results: [empty] },
        { success: true, results: [] },
      ]),
    ),
    { ...empty, activation_cohorts: [] },
  );
});

test("accetta soltanto il risultato aggregato completo", () => {
  assert.deepEqual(
    parseWranglerResult(
      JSON.stringify([
        { success: true, results: [row] },
        { success: true, results: [] },
      ]),
    ),
    { ...row, activation_cohorts: [] },
  );
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

test("le coorti contano store, deduplicano eventi e distinguono riordino e disinstallazione", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE shops(id INTEGER, installed_at TEXT, installation_status TEXT);
      CREATE TABLE app_events(shop_id INTEGER, event_name TEXT, occurred_at TEXT);
      INSERT INTO shops VALUES (1, datetime('now', '-2 days'), 'active'), (2, datetime('now', '-2 days'), 'uninstalled'), (3, datetime('now', '-2 days'), 'active'), (4, datetime('now', '-40 days'), 'active');
      INSERT INTO app_events VALUES (1, 'trial_started', datetime('now', '-2 days', '+1 hour')), (1, 'rules_saved', datetime('now', '-2 days', '+2 hours')), (1, 'rules_saved', datetime('now', '-1 day')), (1, 'validation_enabled', datetime('now', '-2 days', '+3 hours')), (2, 'trial_started', datetime('now', '-2 days', '+1 hour')), (3, 'validation_enabled', datetime('now', '-3 days'));`);
    const report = parseFunnel(db.prepare(FUNNEL_QUERY).all());
    assert.equal(report.length, 1);
    assert.equal(report[0].installed, 3);
    assert.equal(report[0].rules_observed, 1);
    assert.equal(report[0].activation_observed, 1);
    assert.equal(report[0].rules_not_observed, 2);
    assert.equal(report[0].uninstalled_before_observed_activation, 1);
    assert.equal(report[0].trial_without_activation, 1);
    assert.ok(Math.abs(report[0].seconds_to_rules - 7200) < 1);
    assert.ok(Math.abs(report[0].seconds_to_activation - 10800) < 1);
    assert.equal(report[0].evidence, "small_cohort");
    assert.equal(JSON.stringify(report).includes("shop_id"), false);
  } finally {
    db.close();
  }
  assert.throws(() => parseFunnel(null));
  assert.throws(() => parseFunnel([{ cohort: "bad" }]));
});

test("le coorti complete mantengono l'incertezza dei tempi assenti e rifiutano contatori incoerenti", () => {
  const cohort = {
    cohort: "2026-35",
    installed: 10,
    rules_observed: 0,
    trial_observed: 0,
    activation_observed: 0,
    rules_not_observed: 10,
    configured_without_activation: 0,
    trial_without_activation: 0,
    uninstalled_before_observed_activation: 0,
    activation_without_observed_trial: 0,
    seconds_to_rules: null,
    seconds_to_trial: null,
    seconds_to_activation: null,
  };
  assert.equal(parseFunnel([cohort])[0].evidence, "descriptive");
  for (const patch of [
    { installed: -1 },
    { installed: 0.5 },
    { rules_observed: 11 },
    { seconds_to_rules: -1 },
    { seconds_to_trial: Infinity },
    { seconds_to_activation: undefined },
  ])
    assert.throws(() => parseFunnel([{ ...cohort, ...patch }]));
  assert.throws(() => parseWranglerResult(JSON.stringify([{ success: true, results: [row] }])));
});
