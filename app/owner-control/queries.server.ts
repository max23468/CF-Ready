import { planPrices, SHOPIFY_APP_FEES } from "../plans.server";
import { FUNNEL_QUERY, parseFunnel } from "../reporting/funnel";
import {
  PERFORMANCE_QUERY,
  PERFORMANCE_TIMING_QUERY,
  PERFORMANCE_WINDOW_DAYS,
  comparePerformanceVersions,
  parsePerformanceRows,
  parsePerformanceTimings,
} from "../reporting/performance";
import type { ShopsFilter } from "./model";

export const SHOPS_PAGE_SIZE = 8;

const UNRESOLVED_WEBHOOK_FILTER = `
  w.status = 'failed' AND NOT (
    w.topic = 'SHOP_UPDATE' AND (
      w.shop_domain IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM shops current_shop
         WHERE current_shop.shop_domain = w.shop_domain
           AND current_shop.installation_status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM webhook_events recovered
         WHERE recovered.topic = w.topic
           AND recovered.shop_domain = w.shop_domain
           AND recovered.status = 'processed'
           AND recovered.received_at > w.received_at
      )
    )
  )`;

const WEBHOOK_ISSUES_QUERY = `
  SELECT
    COUNT(*) FILTER (WHERE ${UNRESOLVED_WEBHOOK_FILTER}) AS unresolved,
    COUNT(*) FILTER (
      WHERE w.status = 'processing' AND w.received_at <= datetime('now', '-5 minutes')
    ) AS stale
  FROM webhook_events w`;

export type ShopRow = {
  id: number;
  shop_domain: string;
  display_name: string | null;
  installation_status: string;
  installed_at: string;
  country_code: string | null;
  onboarding_status: string | null;
  validation_enabled: number | null;
  config_schema_version: number | null;
  config_hash: string | null;
  validation_state_revision: number | null;
  last_sync_at: string | null;
  last_error_code: string | null;
  trial_status: string | null;
  trial_ends_at: string | null;
  entitlement_status: string | null;
  plan_kind: string | null;
  pricing_generation: "launch" | "balanced" | null;
  current_period_end: string | null;
  complimentary_status: string | null;
};

const SHOP_SELECT = `
  SELECT s.id, s.shop_domain, s.display_name, s.installation_status, s.installed_at,
    s.country_code, a.onboarding_status, a.validation_enabled, a.config_schema_version,
    a.config_hash, a.validation_state_revision, a.last_sync_at, a.last_error_code,
    t.status AS trial_status, t.ends_at AS trial_ends_at,
    b.entitlement_status, b.plan_kind, b.pricing_generation, b.current_period_end,
    c.status AS complimentary_status
  FROM shops s
  LEFT JOIN app_state a ON a.shop_id = s.id
  LEFT JOIN trials t ON t.shop_id = s.id
  LEFT JOIN billing_accounts b ON b.shop_id = s.id
  LEFT JOIN complimentary_entitlements c ON c.shop_id = s.id`;

export async function readDashboard(db: D1Database) {
  const [commercial, issues] = await Promise.all([
    db
      .prepare(
        `SELECT
          COUNT(*) FILTER (WHERE s.installation_status = 'active') AS active_shops,
          COUNT(*) FILTER (WHERE s.installation_status = 'active' AND a.onboarding_status = 'completed') AS onboarding_completed,
          COUNT(*) FILTER (WHERE s.installation_status = 'active' AND a.validation_enabled = 1) AS validation_active,
          COUNT(*) FILTER (WHERE s.installation_status = 'active' AND a.last_error_code IS NOT NULL) AS shops_with_error,
          COUNT(*) FILTER (WHERE s.installation_status = 'active' AND t.status = 'active' AND t.ends_at >= date('now')) AS trials_active,
          COUNT(*) FILTER (WHERE s.installation_status = 'active' AND b.entitlement_status = 'active' AND b.plan_kind = 'monthly') AS monthly,
          COUNT(*) FILTER (WHERE s.installation_status = 'active' AND b.entitlement_status = 'active' AND b.plan_kind = 'annual') AS annual,
          COUNT(*) FILTER (WHERE s.installation_status = 'active' AND b.entitlement_status = 'active' AND b.plan_kind = 'one_time') AS one_time,
          COUNT(*) FILTER (WHERE s.installation_status = 'active' AND c.status = 'active' AND COALESCE(b.entitlement_status, 'none') NOT IN ('active', 'ending')) AS complimentary,
          COUNT(*) FILTER (WHERE s.installation_status = 'active' AND b.entitlement_status = 'ending') AS ending
        FROM shops s
        LEFT JOIN app_state a ON a.shop_id = s.id
        LEFT JOIN trials t ON t.shop_id = s.id
        LEFT JOIN billing_accounts b ON b.shop_id = s.id
        LEFT JOIN complimentary_entitlements c ON c.shop_id = s.id`,
      )
      .first<Record<string, number>>(),
    readIssues(db),
  ]);
  return {
    ...commercial,
    open_issues: countOpenIssues(issues),
    unresolved_webhooks: Number(issues.webhooks?.unresolved),
    failed_notifications: Number(issues.notifications?.failed),
    partner_synced_at:
      typeof issues.partner?.synced_at === "string" ? issues.partner.synced_at : null,
  };
}

const FILTER_SQL: Record<ShopsFilter, string> = {
  all: "1 = 1",
  trial: "t.status = 'active' AND t.ends_at >= date('now')",
  paid: "b.entitlement_status IN ('active', 'ending') AND b.plan_kind != 'none'",
  validation_off: "s.installation_status = 'active' AND COALESCE(a.validation_enabled, 0) = 0",
  issues: "s.installation_status = 'active' AND a.last_error_code IS NOT NULL",
};

export async function readShops(db: D1Database, filter: ShopsFilter, page: number) {
  const where = FILTER_SQL[filter];
  const offset = page * SHOPS_PAGE_SIZE;
  const [{ results }, count] = await Promise.all([
    db
      .prepare(
        `${SHOP_SELECT} WHERE ${where}
         ORDER BY COALESCE(s.display_name, s.shop_domain) COLLATE NOCASE, s.id
         LIMIT ? OFFSET ?`,
      )
      .bind(SHOPS_PAGE_SIZE, offset)
      .all<ShopRow>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM shops s
         LEFT JOIN app_state a ON a.shop_id = s.id
         LEFT JOIN trials t ON t.shop_id = s.id
         LEFT JOIN billing_accounts b ON b.shop_id = s.id
         WHERE ${where}`,
      )
      .first<{ count: number }>(),
  ]);
  return { shops: results, count: count?.count ?? 0, page };
}

export function readShop(db: D1Database, id: number) {
  return db.prepare(`${SHOP_SELECT} WHERE s.id = ?`).bind(id).first<ShopRow>();
}

export async function findShops(db: D1Database, input: string) {
  const normalized = input
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const escaped = normalized.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
  const { results } = await db
    .prepare(
      `${SHOP_SELECT}
       WHERE lower(s.shop_domain) = ? OR lower(COALESCE(s.display_name, '')) = ?
          OR lower(s.shop_domain) LIKE ? ESCAPE '\\'
          OR lower(COALESCE(s.display_name, '')) LIKE ? ESCAPE '\\'
       ORDER BY CASE WHEN lower(s.shop_domain) = ? OR lower(COALESCE(s.display_name, '')) = ? THEN 0 ELSE 1 END,
                COALESCE(s.display_name, s.shop_domain) COLLATE NOCASE
       LIMIT 6`,
    )
    .bind(normalized, normalized, `%${escaped}%`, `%${escaped}%`, normalized, normalized)
    .all<ShopRow>();
  return results;
}

export async function readBilling(db: D1Database) {
  const [{ results }, complimentary, trials] = await Promise.all([
    db
      .prepare(
        `SELECT b.entitlement_status, b.plan_kind, b.pricing_generation, s.country_code,
                COUNT(*) AS count
         FROM billing_accounts b JOIN shops s ON s.id = b.shop_id
         WHERE s.installation_status = 'active'
         GROUP BY b.entitlement_status, b.plan_kind, b.pricing_generation, s.country_code`,
      )
      .all<{
        entitlement_status: string;
        plan_kind: string;
        pricing_generation: "launch" | "balanced";
        country_code: string | null;
        count: number;
      }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM complimentary_entitlements c
         JOIN shops s ON s.id = c.shop_id
         LEFT JOIN billing_accounts b ON b.shop_id = s.id
         WHERE s.installation_status = 'active' AND c.status = 'active'
           AND COALESCE(b.entitlement_status, 'none') NOT IN ('active', 'ending')`,
      )
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM trials t JOIN shops s ON s.id = t.shop_id
         WHERE s.installation_status = 'active' AND t.status = 'active'
           AND t.ends_at >= date('now')`,
      )
      .first<{ count: number }>(),
  ]);
  let mrr = 0;
  let netMrr = 0;
  let regulatoryUnknown = 0;
  for (const row of results) {
    if (row.entitlement_status !== "active") continue;
    const prices = planPrices(row.pricing_generation);
    const monthly =
      row.plan_kind === "monthly"
        ? prices.monthly
        : row.plan_kind === "annual"
          ? prices.annual / 12
          : null;
    if (monthly === null) continue;
    const regulatory: number | undefined = row.country_code
      ? SHOPIFY_APP_FEES.regulatoryOperating[row.country_code]
      : undefined;
    if (regulatory === undefined) regulatoryUnknown += row.count;
    const kept =
      1 - SHOPIFY_APP_FEES.revenueShare - SHOPIFY_APP_FEES.processing - (regulatory ?? 0);
    mrr += monthly * row.count;
    netMrr += monthly * kept * row.count;
  }
  return {
    rows: results,
    complimentary: complimentary?.count ?? 0,
    trials: trials?.count ?? 0,
    mrr,
    arr: mrr * 12,
    netMrr,
    netArr: netMrr * 12,
    regulatoryUnknown,
    shopifyFees: SHOPIFY_APP_FEES,
  };
}

export async function readTrials(db: D1Database, page: number) {
  const offset = page * SHOPS_PAGE_SIZE;
  const [{ results }, count, endingSoon] = await Promise.all([
    db
      .prepare(
        `SELECT s.id, s.shop_domain, s.display_name, t.ends_at,
                COALESCE(a.validation_enabled, 0) AS validation_enabled
         FROM trials t JOIN shops s ON s.id = t.shop_id
         LEFT JOIN app_state a ON a.shop_id = s.id
         WHERE s.installation_status = 'active' AND t.status = 'active'
           AND t.ends_at >= date('now')
         ORDER BY t.ends_at, s.id LIMIT ? OFFSET ?`,
      )
      .bind(SHOPS_PAGE_SIZE, offset)
      .all<{
        id: number;
        shop_domain: string;
        display_name: string | null;
        ends_at: string;
        validation_enabled: number;
      }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM trials t JOIN shops s ON s.id = t.shop_id
         WHERE s.installation_status = 'active' AND t.status = 'active'
           AND t.ends_at >= date('now')`,
      )
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM trials t JOIN shops s ON s.id = t.shop_id
         WHERE s.installation_status = 'active' AND t.status = 'active'
           AND t.ends_at BETWEEN date('now') AND date('now', '+7 days')`,
      )
      .first<{ count: number }>(),
  ]);
  return { trials: results, count: count?.count ?? 0, endingSoon: endingSoon?.count ?? 0, page };
}

export async function readShopActivity(db: D1Database, shopId: number) {
  const { results } = await db
    .prepare(
      `SELECT event_name, occurred_at FROM (
         SELECT event_name, occurred_at, id FROM app_events WHERE shop_id = ?
         UNION ALL
         SELECT 'billing_' || event_type || '_' || status, occurred_at, id
           FROM billing_events WHERE shop_id = ?
       ) ORDER BY occurred_at DESC, id DESC LIMIT 6`,
    )
    .bind(shopId, shopId)
    .all<{ event_name: string; occurred_at: string }>();
  return results;
}

export async function readFunnel(db: D1Database) {
  const { results } = await db.prepare(FUNNEL_QUERY).all();
  return parseFunnel(results);
}

export async function readPerformance(db: D1Database) {
  const [groupsResult, timingsResult, versionsResult] = await Promise.all([
    db.prepare(PERFORMANCE_QUERY).all(),
    db.prepare(PERFORMANCE_TIMING_QUERY).all(),
    db
      .prepare(
        `SELECT app_version, MAX(observed_at) AS last_observed_at
         FROM performance_samples
         WHERE observed_at >= datetime('now', '-${PERFORMANCE_WINDOW_DAYS} days')
           AND metric_name IN ('LCP', 'INP', 'CLS')
         GROUP BY app_version
         ORDER BY last_observed_at DESC, app_version DESC
         LIMIT 2`,
      )
      .all<{ app_version: string; last_observed_at: string }>(),
  ]);
  const groups = parsePerformanceRows(groupsResult.results);
  const timings = parsePerformanceTimings(timingsResult.results);
  const versions = versionsResult.results;
  const comparison =
    versions.length === 2
      ? comparePerformanceVersions(
          groups,
          timings,
          versions[1].app_version,
          versions[0].app_version,
        )
      : null;
  return { groups, comparison };
}

export async function readNotificationStatus(db: D1Database) {
  return db
    .prepare(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'processing') AS processing,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE status = 'sent' AND sent_at >= datetime('now', '-7 days')) AS sent_7d,
        MIN(CASE WHEN status = 'pending' THEN created_at END) AS oldest_pending_at,
        MAX(CASE WHEN status = 'sent' THEN sent_at END) AS last_sent_at,
        MAX(CASE WHEN status = 'failed' THEN updated_at END) AS last_failed_at,
        MAX(attempts) FILTER (WHERE status = 'failed') AS max_failed_attempts
       FROM owner_notifications`,
    )
    .first<Record<string, number | string | null>>();
}

export async function readIssues(db: D1Database) {
  const [[state, webhooks, notifications, control, partner], performance] = await Promise.all([
    db.batch([
      db.prepare(
        `SELECT COUNT(*) AS count FROM app_state a JOIN shops s ON s.id = a.shop_id WHERE s.installation_status = 'active' AND a.last_error_code IS NOT NULL`,
      ),
      db.prepare(WEBHOOK_ISSUES_QUERY),
      db.prepare(
        `SELECT COUNT(*) FILTER (WHERE status = 'failed') AS failed, COUNT(*) FILTER (WHERE status = 'pending' AND created_at <= datetime('now', '-15 minutes')) AS stale FROM owner_notifications`,
      ),
      db.prepare(`SELECT COUNT(*) AS failed FROM owner_control_updates WHERE status = 'failed'`),
      db.prepare(
        `SELECT state_value AS synced_at,
                CASE WHEN state_value IS NULL
                       OR datetime(state_value) < datetime('now', '-15 minutes')
                     THEN 1 ELSE 0 END AS stale
           FROM (SELECT (
             SELECT state_value FROM owner_notification_state
              WHERE state_key = 'partner_events_polled_at'
           ) AS state_value)`,
      ),
    ]),
    readPerformance(db),
  ]);
  return {
    stores: state.results[0] as Record<string, unknown> | undefined,
    webhooks: webhooks.results[0] as Record<string, unknown> | undefined,
    notifications: notifications.results[0] as Record<string, unknown> | undefined,
    control: control.results[0] as Record<string, unknown> | undefined,
    partner: partner.results[0] as Record<string, unknown> | undefined,
    performance: { regressions: performance.comparison?.alerts.length ?? 0 },
  };
}

export async function readErrors(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT error_code, SUM(count) AS count, MAX(last_at) AS last_at FROM (
         SELECT COALESCE(json_extract(metadata_json, '$.error_code'), event_name) AS error_code,
                COUNT(*) AS count, MAX(occurred_at) AS last_at
           FROM app_events WHERE event_class = 'error' AND occurred_at >= datetime('now', '-28 days')
           GROUP BY error_code
         UNION ALL
         SELECT last_error_code, COUNT(*), MAX(updated_at) FROM app_state
          WHERE last_error_code IS NOT NULL GROUP BY last_error_code
         UNION ALL
         SELECT error_code, COUNT(*), MAX(processed_at) FROM webhook_events
          WHERE status = 'failed' AND error_code IS NOT NULL GROUP BY error_code
         UNION ALL
         SELECT last_error_code, COUNT(*), MAX(updated_at) FROM owner_notifications
          WHERE status = 'failed' AND last_error_code IS NOT NULL GROUP BY last_error_code
         UNION ALL
         SELECT last_error_code, COUNT(*), MAX(updated_at) FROM owner_control_updates
          WHERE status = 'failed' AND last_error_code IS NOT NULL GROUP BY last_error_code
       ) GROUP BY error_code ORDER BY count DESC, last_at DESC LIMIT 20`,
    )
    .all<{ error_code: string; count: number; last_at: string }>();
  return results;
}

export async function readActivity(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT activity.event_name, activity.occurred_at, s.id AS shop_id,
              s.shop_domain, s.display_name
       FROM (
         SELECT event_name, occurred_at, shop_id, id FROM app_events
          WHERE event_class != 'error'
         UNION ALL
         SELECT 'billing_' || event_type || '_' || status, occurred_at, shop_id, id
           FROM billing_events
       ) activity
       LEFT JOIN shops s ON s.id = activity.shop_id
       ORDER BY activity.occurred_at DESC, activity.id DESC LIMIT 20`,
    )
    .all<{
      event_name: string;
      occurred_at: string;
      shop_id: number | null;
      shop_domain: string | null;
      display_name: string | null;
    }>();
  return results;
}

export async function readHealth(db: D1Database) {
  const [d1, partner, webhooks, notifications, inbound] = await db.batch([
    db.prepare("SELECT 1 AS ok"),
    db.prepare(
      `SELECT state_value AS synced_at,
              CASE WHEN state_value IS NULL
                     OR datetime(state_value) < datetime('now', '-15 minutes')
                   THEN 1 ELSE 0 END AS stale
         FROM (SELECT (
           SELECT state_value FROM owner_notification_state
            WHERE state_key = 'partner_events_polled_at'
         ) AS state_value)`,
    ),
    db.prepare(WEBHOOK_ISSUES_QUERY),
    db.prepare(`SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE status = 'processing') AS processing,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed,
      MIN(CASE WHEN status = 'pending' THEN created_at END) AS oldest_pending_at,
      MAX(sent_at) AS last_sent_at,
      MAX(CASE WHEN status = 'failed' THEN updated_at END) AS last_failed_at
      FROM owner_notifications`),
    db.prepare(
      `SELECT MAX(processed_at) AS last_processed_at, COUNT(*) FILTER (WHERE status = 'failed') AS failed FROM owner_control_updates`,
    ),
  ]);
  return {
    d1: d1.success,
    partner: partner.results[0] as Record<string, unknown> | undefined,
    webhooks: webhooks.results[0] as Record<string, unknown> | undefined,
    notifications: notifications.results[0] as Record<string, unknown> | undefined,
    inbound: inbound.results[0] as Record<string, unknown> | undefined,
  };
}

function countOpenIssues(data: Record<string, Record<string, unknown> | undefined>) {
  return (
    Number(data.stores?.count) +
    Number(data.webhooks?.unresolved) +
    Number(data.webhooks?.stale) +
    Number(data.notifications?.failed) +
    Number(data.notifications?.stale) +
    Number(data.control?.failed) +
    Number(data.partner?.stale) +
    Number(data.performance?.regressions)
  );
}
