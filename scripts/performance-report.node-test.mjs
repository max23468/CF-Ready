import assert from "node:assert/strict";
import { test } from "node:test";

import {
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
