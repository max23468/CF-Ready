import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const QUERY = `
SELECT
  datetime('now') AS generated_at,
  COUNT(*) AS stores_total,
  COALESCE(SUM(CASE WHEN shops.installation_status = 'active' THEN 1 ELSE 0 END), 0) AS stores_active,
  COALESCE(SUM(CASE WHEN shops.installed_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) AS installs_7d,
  COALESCE(SUM(CASE WHEN shops.installed_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END), 0) AS installs_30d,
  COALESCE(SUM(CASE WHEN shops.installation_status = 'active'
    AND app_state.onboarding_status = 'completed' THEN 1 ELSE 0 END), 0) AS onboarding_completed,
  COALESCE(SUM(CASE WHEN shops.installation_status = 'active'
    AND app_state.validation_enabled = 1 THEN 1 ELSE 0 END), 0) AS validations_enabled,
  COALESCE(SUM(CASE WHEN shops.installation_status = 'active'
    AND app_state.last_error_code IS NOT NULL THEN 1 ELSE 0 END), 0) AS stores_with_open_error,
  COALESCE(SUM(CASE
    WHEN shops.installation_status = 'active'
      AND trials.status = 'active' AND trials.ends_at >= date('now')
    THEN 1 ELSE 0 END), 0) AS trials_active,
  COALESCE(SUM(CASE
    WHEN shops.installation_status = 'active'
      AND billing_accounts.entitlement_status IN ('active', 'ending')
      AND billing_accounts.plan_kind IN ('monthly', 'annual', 'one_time')
    THEN 1 ELSE 0 END), 0) AS paying_or_paid_stores,
  COALESCE(SUM(CASE WHEN shops.installation_status = 'active'
    AND complimentary_entitlements.status = 'active' THEN 1 ELSE 0 END), 0) AS complimentary_stores,
  (SELECT COUNT(*) FROM app_events
    WHERE event_class = 'error' AND occurred_at >= datetime('now', '-7 days')) AS error_events_7d,
  (SELECT COUNT(*) FROM webhook_events
    WHERE status = 'failed' AND received_at >= datetime('now', '-7 days')) AS failed_webhooks_7d
FROM shops
LEFT JOIN app_state ON app_state.shop_id = shops.id
LEFT JOIN trials ON trials.shop_id = shops.id
LEFT JOIN billing_accounts ON billing_accounts.shop_id = shops.id
LEFT JOIN complimentary_entitlements ON complimentary_entitlements.shop_id = shops.id;
`;

const METRICS = [
  "stores_total",
  "stores_active",
  "installs_7d",
  "installs_30d",
  "onboarding_completed",
  "validations_enabled",
  "stores_with_open_error",
  "trials_active",
  "paying_or_paid_stores",
  "complimentary_stores",
  "error_events_7d",
  "failed_webhooks_7d",
];

export function parseEnvironment(args) {
  const value = args.at(0);
  if (!value || args.length !== 1 || !["development", "production"].includes(value)) {
    throw new Error("Uso: npm run report:launch -- development|production");
  }
  return value;
}

export function commandFor(environment) {
  const args = [
    "exec",
    "--",
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--remote",
    "--json",
    "--config",
    "wrangler.json",
    "--command",
    QUERY,
  ];
  if (environment === "production") args.push("--env", "production");
  return args;
}

export function parseWranglerResult(stdout) {
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new Error("Wrangler non ha restituito JSON valido.");
  }

  const result = payload?.[0];
  const row = result?.results?.[0];
  if (!result?.success || !row || typeof row.generated_at !== "string") {
    throw new Error("Wrangler non ha restituito il report aggregato atteso.");
  }

  const report = { generated_at: row.generated_at };
  for (const metric of METRICS) {
    if (!Number.isInteger(row[metric]) || row[metric] < 0) {
      throw new Error(`Metrica non valida: ${metric}.`);
    }
    report[metric] = row[metric];
  }
  return report;
}

export function fetchReport(environment, { spawn = spawnSync } = {}) {
  const result = spawn("npm", commandFor(environment), {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error("La lettura aggregata D1 non è riuscita.");
  }
  return parseWranglerResult(result.stdout);
}

function main() {
  const environment = parseEnvironment(process.argv.slice(2));
  const report = fetchReport(environment);
  process.stdout.write(`${JSON.stringify({ environment, ...report }, null, 2)}\n`);
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main();
