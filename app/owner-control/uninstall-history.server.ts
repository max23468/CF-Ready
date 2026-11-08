import { BFS_PLAN_STATE_PREFIX } from "./bfs-state";
import { BILLING_STATUS_CATEGORY_SQL } from "./billing";
import { reviewStoreSql } from "./review-stores";

export const FIRST_UNINSTALL_SQL = `NOT EXISTS (
  SELECT 1 FROM app_events
  WHERE shop_id = s.id AND event_name = 'app_uninstalled' AND occurred_at >= s.installed_at
)`;
const BFS_DEVELOPMENT_SQL = `(json_extract(o.state_value, '$.classification') = 'development'
  AND json_extract(o.state_value, '$.installedAt') = s.installed_at)`;
const REVIEW_STORE_SQL = reviewStoreSql("s.display_name", "s.shop_domain", BFS_DEVELOPMENT_SQL);

export function uninstallHistoryStatement(
  db: D1Database,
  shopDomain: string,
  installationStartedAt: string,
  now: string,
) {
  return db
    .prepare(
      `INSERT INTO uninstall_history (
         uninstalled_on, installed_days, store_kind, billing_category,
         validation_enabled, onboarding_completed
       )
       SELECT date(?), MAX(0, CAST(julianday(?) - julianday(s.installed_at) AS INTEGER)),
              CASE WHEN ${REVIEW_STORE_SQL} THEN 'review' ELSE 'merchant' END,
              ${BILLING_STATUS_CATEGORY_SQL},
              coalesce(a.validation_enabled, 0),
              coalesce(a.onboarding_status = 'completed', 0)
       FROM shops s
       LEFT JOIN app_state a ON a.shop_id = s.id
       LEFT JOIN trials t ON t.shop_id = s.id
       LEFT JOIN billing_accounts b ON b.shop_id = s.id
       LEFT JOIN complimentary_entitlements c ON c.shop_id = s.id
       LEFT JOIN owner_control_state o ON o.state_key = '${BFS_PLAN_STATE_PREFIX}' || s.id
       WHERE s.shop_domain = ? AND s.installed_at = ? AND ${FIRST_UNINSTALL_SQL}`,
    )
    .bind(now, now, shopDomain, installationStartedAt);
}

export function uninstallCounterStatement(
  db: D1Database,
  shopDomain: string,
  installationStartedAt: string,
  now: string,
) {
  return db
    .prepare(
      `UPDATE owner_metric_counters
       SET value = value + 1,
           review_value = review_value + (
             SELECT CASE WHEN ${REVIEW_STORE_SQL} THEN 1 ELSE 0 END
             FROM shops s
             LEFT JOIN owner_control_state o
               ON o.state_key = '${BFS_PLAN_STATE_PREFIX}' || s.id
             WHERE s.shop_domain = ? AND s.installed_at = ?
           ),
           updated_at = ?
       WHERE metric = 'app_uninstalled' AND EXISTS (
         SELECT 1 FROM shops s
         WHERE s.shop_domain = ? AND s.installed_at = ? AND ${FIRST_UNINSTALL_SQL}
       )`,
    )
    .bind(shopDomain, installationStartedAt, now, shopDomain, installationStartedAt);
}
