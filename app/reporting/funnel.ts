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

export function parseFunnel(rows: unknown) {
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
  ] as const;
  return rows.map((value) => {
    const row = value as Record<string, unknown>;
    if (
      typeof row.cohort !== "string" ||
      !/^\d{4}-\d{2}$/.test(row.cohort) ||
      !Number.isInteger(row.installed) ||
      (row.installed as number) < 0 ||
      counts.some(
        (key) =>
          !Number.isInteger(row[key]) ||
          (row[key] as number) < 0 ||
          (row[key] as number) > (row.installed as number),
      )
    ) {
      throw new Error("Coorte di attivazione non valida.");
    }
    const report: Record<string, unknown> = {
      cohort: row.cohort,
      ...Object.fromEntries(counts.map((key) => [key, row[key]])),
    };
    for (const key of ["seconds_to_rules", "seconds_to_trial", "seconds_to_activation"]) {
      if (row[key] !== null && (!Number.isFinite(row[key]) || (row[key] as number) < 0)) {
        throw new Error("Durata di attivazione non valida.");
      }
      report[key] = row[key];
    }
    return {
      ...report,
      activation_rate:
        (row.installed as number) > 0
          ? (row.activation_observed as number) / (row.installed as number)
          : null,
      evidence: (row.installed as number) < 10 ? "small_cohort" : "descriptive",
    };
  });
}
