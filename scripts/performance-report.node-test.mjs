import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compareVersions,
  parseOptions,
  parseTimings,
  TIMING_QUERY,
  commandFor,
  fetchReport,
  parseEnvironment,
  parseWranglerResult,
} from "./performance-report.mjs";

test("richiede l'ambiente esplicito", () => {
  assert.equal(parseEnvironment(["development"]), "development");
  assert.equal(parseEnvironment(["production"]), "production");
  assert.throws(() => parseEnvironment([]), /development\|production/);
  assert.throws(() => parseEnvironment(["prod"]), /development\|production/);
});

test("esegue una sola SELECT aggregata e non espone lo store", () => {
  const development = commandFor("development");
  const production = commandFor("production");
  const command = development.join(" ");

  assert.match(command, /WITH recent AS/);
  assert.match(command, /ROW_NUMBER\(\) OVER/);
  assert.match(command, /metric_rank = CAST\(\(3 \* sample_count \+ 3\) \/ 4 AS INTEGER\)/);
  assert.doesNotMatch(command, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i);
  assert.doesNotMatch(command, /shop_domain|shop_id|metric_id|country_code|server_timing_json/);
  assert.deepEqual(production.slice(-2), ["--env", "production"]);
});

test("classifica p75, soglie e numerosità senza arrotondare il valore", () => {
  const groups = parseWranglerResult(
    JSON.stringify([
      {
        success: true,
        results: [
          {
            metric_name: "LCP",
            app_version: "1.1.0",
            app_route: "all",
            sample_count: 100,
            p75: 2499.75,
          },
          {
            metric_name: "INP",
            app_version: "1.1.0",
            app_route: "home",
            sample_count: 101,
            p75: 201,
          },
          {
            metric_name: "CLS",
            app_version: "all",
            app_route: "all",
            sample_count: 99,
            p75: 0.15,
          },
        ],
      },
    ]),
  );

  assert.deepEqual(groups, [
    {
      metric: "LCP",
      app_version: "1.1.0",
      app_route: "all",
      sample_count: 100,
      p75: 2499.75,
      threshold: 2500,
      status: "pass",
    },
    {
      metric: "INP",
      app_version: "1.1.0",
      app_route: "home",
      sample_count: 101,
      p75: 201,
      threshold: 200,
      status: "fail",
    },
    {
      metric: "CLS",
      app_version: "all",
      app_route: "all",
      sample_count: 99,
      p75: 0.15,
      threshold: 0.1,
      status: "insufficient_samples",
    },
  ]);
});

test("rifiuta output incompleto e non inoltra quello Wrangler in errore", () => {
  assert.throws(() => parseWranglerResult("no"), /JSON valido/);
  assert.throws(
    () => parseWranglerResult(JSON.stringify([{ success: false, results: [] }])),
    /report prestazioni/,
  );
  assert.throws(
    () =>
      parseWranglerResult(
        JSON.stringify([
          {
            success: true,
            results: [
              {
                metric_name: "FCP",
                app_version: "1.1.0",
                app_route: "home",
                sample_count: 100,
                p75: 100,
              },
            ],
          },
        ]),
      ),
    /non valida/,
  );
  assert.throws(
    () => fetchReport("production", { spawn: () => ({ status: 1, stdout: "segreto" }) }),
    /lettura aggregata D1/,
  );
});

test("confronta soltanto rotte omogenee con campioni sufficienti e doppia soglia", () => {
  const group = (app_version, p75, sample_count = 100, metric = "LCP") => ({
    app_version,
    app_route: "home",
    metric,
    sample_count,
    p75,
  });
  const previous = group("1.0.0", 1000);
  const current = group("1.1.0", 1300);
  assert.equal(compareVersions([previous, current], [], "1.0.0", "1.1.0").alerts.length, 1);
  assert.equal(
    compareVersions([previous, { ...current, sample_count: 99 }], [], "1.0.0", "1.1.0").alerts
      .length,
    0,
  );
  assert.equal(
    compareVersions([previous, { ...current, p75: 1199 }], [], "1.0.0", "1.1.0").alerts.length,
    0,
  );
  assert.equal(
    compareVersions([group("1.0.0", 100), group("1.1.0", 150)], [], "1.0.0", "1.1.0").alerts.length,
    0,
  );
  assert.equal(
    compareVersions([current], [], "1.0.0", "1.1.0").comparisons[0].status,
    "insufficient_samples",
  );
  assert.equal(
    compareVersions([previous, { ...current, app_route: "rules" }], [], "1.0.0", "1.1.0").alerts
      .length,
    0,
  );
  assert.equal(
    compareVersions(
      [group("1.0.0", 0, 100, "CLS"), group("1.1.0", 0.03, 100, "CLS")],
      [],
      "1.0.0",
      "1.1.0",
    ).alerts.length,
    1,
  );
  assert.throws(() => compareVersions([], [], "all", "1.0.0"));
  assert.deepEqual(parseOptions(["production", "--compare", "1.0.0", "1.1.0"]), {
    environment: "production",
    versions: ["1.0.0", "1.1.0"],
  });
  assert.deepEqual(parseOptions(["development"]), { environment: "development", versions: null });
  assert.throws(() => parseOptions(["production", "--compare", "same", "same"]));
});

test("le durate server sono aggregate una volta per documento LCP e allowlistate", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE performance_samples (app_version TEXT, app_route TEXT, metric_name TEXT, server_timing_json TEXT, observed_at TEXT);
      INSERT INTO performance_samples VALUES ('1.0.0','home','LCP','{"auth":100,"secret":9}',datetime('now')), ('1.0.0','home','INP','{"auth":100}',datetime('now')), ('1.0.0','home','LCP','{"auth":300}',datetime('now'));`);
    const timings = parseTimings(db.prepare(TIMING_QUERY).all());
    assert.deepEqual(timings, [
      { app_version: "1.0.0", app_route: "home", timing_name: "auth", sample_count: 2, p75: 300 },
    ]);
    assert.throws(() => parseTimings([{ ...timings[0], timing_name: "secret" }]));
  } finally {
    db.close();
  }
});

test("rifiuta durate e opzioni incomplete, distingue serie mancanti e associa solo i tempi pertinenti", () => {
  const base = {
    app_version: "old",
    app_route: "home",
    timing_name: "auth",
    sample_count: 100,
    p75: 100,
  };
  assert.throws(() => parseTimings(null));
  for (const patch of [
    { app_version: null },
    { app_route: null },
    { sample_count: 0 },
    { p75: -1 },
    { p75: Infinity },
  ])
    assert.throws(() => parseTimings([{ ...base, ...patch }]));
  for (const args of [
    [],
    ["production", "bad", "old", "new"],
    ["production", "--compare", "", "new"],
    ["production", "--compare", "old", ""],
    ["production", "--compare", "all", "new"],
  ])
    assert.throws(() => parseOptions(args));
  for (const [previous, current] of [
    ["", "new"],
    ["old", ""],
    ["same", "same"],
  ])
    assert.throws(() => compareVersions([], [], previous, current));
  const groups = [
    { app_version: "old", app_route: "home", metric: "INP", p75: 100, sample_count: 100 },
    { app_version: "new", app_route: "home", metric: "INP", p75: 150, sample_count: 100 },
  ];
  const report = compareVersions(
    groups,
    [base, { ...base, app_route: "rules" }, { ...base, app_version: "unrelated" }],
    "old",
    "new",
  );
  assert.deepEqual(report.comparisons[0].server_timings, [base]);
  assert.equal(report.alerts.length, 1);
  assert.equal(compareVersions([], [], "old", "new").status, "insufficient_samples");
});
