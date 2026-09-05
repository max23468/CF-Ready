import { pathToFileURL } from "node:url";

import {
  d1ReportCommand,
  fetchD1Report,
  parseReportEnvironment,
  parseWranglerJson,
} from "./d1-report.mjs";

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

// Solo coorti recenti: le evidenze evento sono soggette alla retention di 90 giorni.
export const FUNNEL_QUERY = `
WITH milestones AS (
  SELECT s.id, s.installed_at, s.installation_status,
    MIN(CASE WHEN e.event_name = 'rules_saved' THEN e.occurred_at END) AS rules_at,
    MIN(CASE WHEN e.event_name = 'trial_started' THEN e.occurred_at END) AS trial_at,
    MIN(CASE WHEN e.event_name = 'validation_enabled' THEN e.occurred_at END) AS enabled_at
  FROM shops s LEFT JOIN app_events e ON e.shop_id = s.id
    AND julianday(e.occurred_at) >= julianday(s.installed_at)
    AND e.event_name IN ('rules_saved', 'trial_started', 'validation_enabled')
  WHERE julianday(s.installed_at) >= julianday('now', '-28 days')
  GROUP BY s.id
)
SELECT strftime('%Y-%W', installed_at) AS cohort,
  COUNT(*) AS installed,
  SUM(rules_at IS NOT NULL) AS rules_observed,
  SUM(trial_at IS NOT NULL) AS trial_observed,
  SUM(enabled_at IS NOT NULL) AS activation_observed,
  SUM(rules_at IS NULL) AS rules_not_observed,
  SUM(rules_at IS NOT NULL AND enabled_at IS NULL) AS configured_without_activation,
  SUM(trial_at IS NOT NULL AND enabled_at IS NULL) AS trial_without_activation,
  SUM(installation_status = 'uninstalled' AND enabled_at IS NULL) AS uninstalled_before_observed_activation,
  SUM(enabled_at IS NOT NULL AND trial_at IS NULL) AS activation_without_observed_trial,
  AVG(CASE WHEN rules_at IS NOT NULL THEN (julianday(rules_at) - julianday(installed_at)) * 86400 END) AS seconds_to_rules,
  AVG(CASE WHEN trial_at IS NOT NULL THEN (julianday(trial_at) - julianday(installed_at)) * 86400 END) AS seconds_to_trial,
  AVG(CASE WHEN enabled_at IS NOT NULL THEN (julianday(enabled_at) - julianday(installed_at)) * 86400 END) AS seconds_to_activation
FROM milestones GROUP BY cohort ORDER BY cohort;
`;

export function parseFunnel(rows) {
  if (!Array.isArray(rows)) throw new Error("Coorti di attivazione mancanti.");
  const counts = [
    "installed",
    "rules_observed",
    "trial_observed",
    "activation_observed",
    "rules_not_observed",
    "configured_without_activation",
    "trial_without_activation",
    "uninstalled_before_observed_activation",
    "activation_without_observed_trial",
  ];
  return rows.map((row) => {
    if (
      !/^\d{4}-\d{2}$/.test(row.cohort) ||
      counts.some((key) => !Number.isInteger(row[key]) || row[key] < 0 || row[key] > row.installed)
    )
      throw new Error("Coorte di attivazione non valida.");
    const report = {
      cohort: row.cohort,
      ...Object.fromEntries(counts.map((key) => [key, row[key]])),
    };
    for (const key of ["seconds_to_rules", "seconds_to_trial", "seconds_to_activation"]) {
      if (row[key] !== null && (!Number.isFinite(row[key]) || row[key] < 0))
        throw new Error("Durata di attivazione non valida.");
      report[key] = row[key];
    }
    return {
      ...report,
      activation_rate: row.installed ? row.activation_observed / row.installed : null,
      evidence: row.installed < 10 ? "small_cohort" : "descriptive",
    };
  });
}

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
  return parseReportEnvironment(args, "Uso: npm run report:launch -- development|production");
}

export function commandFor(environment) {
  return d1ReportCommand(environment, QUERY + FUNNEL_QUERY);
}

export function parseWranglerResult(stdout) {
  const payload = parseWranglerJson(stdout);
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
  if (!payload[1]?.success) throw new Error("Coorti di attivazione mancanti.");
  return { ...report, activation_cohorts: parseFunnel(payload[1].results) };
}

export function fetchReport(environment, options = {}) {
  return fetchD1Report(environment, QUERY + FUNNEL_QUERY, parseWranglerResult, options);
}

function main() {
  const environment = parseEnvironment(process.argv.slice(2));
  const report = fetchReport(environment);
  process.stdout.write(
    `${JSON.stringify({ environment, ...report, funnel_note: "Milestones observed within the current installation, not a mandatory ordered funnel. Missing events are not proven abandonment; rules_saved is available only since this feature was deployed. Timings are means in seconds since installation; small cohorts are indicative." }, null, 2)}\n`,
  );
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main();
