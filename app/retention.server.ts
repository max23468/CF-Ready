import { EVENT_CLASSES } from "./events.server";
import { redactExpiredShops } from "./shop.server";

const DELETE_LIMIT = 1000;

type RetentionRule = {
  table: string;
  key: string;
  timestamp: string;
  days: number;
  filter?: string;
};

const NON_ERROR_EVENT_CLASSES = EVENT_CLASSES.filter((name) => name !== "error")
  .map((name) => `'${name}'`)
  .join(", ");

const RETENTION_RULES: RetentionRule[] = [
  { table: "webhook_events", key: "webhook_id", timestamp: "received_at", days: 90 },
  {
    table: "app_events",
    key: "id",
    timestamp: "occurred_at",
    days: 90,
    filter: "event_class = 'error'",
  },
  {
    table: "app_events",
    key: "id",
    timestamp: "occurred_at",
    days: 365,
    filter: `event_class IN (${NON_ERROR_EVENT_CLASSES})`,
  },
  { table: "billing_events", key: "id", timestamp: "occurred_at", days: 365 },
  { table: "owner_notifications", key: "id", timestamp: "created_at", days: 90 },
  { table: "owner_notification_redactions", key: "shop_hash", timestamp: "redacted_at", days: 365 },
  { table: "owner_control_updates", key: "update_id", timestamp: "updated_at", days: 7 },
  { table: "configuration_history", key: "id", timestamp: "created_at", days: 90 },
];

const UNINSTALLED_SHOP_RETENTION_DAYS = 90;

const PERFORMANCE_SAMPLES_RULE: RetentionRule = {
  table: "performance_samples",
  key: "id",
  timestamp: "observed_at",
  days: 90,
};

function deleteExpired(db: D1Database, rule: RetentionRule, now: Date) {
  const { table, key, timestamp, days, filter } = rule;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1_000).toISOString();
  return db
    .prepare(
      `DELETE FROM ${table} WHERE ${key} IN (
         SELECT ${key} FROM ${table} WHERE ${filter ? `${filter} AND ` : ""}${timestamp} <= ?
         ORDER BY ${timestamp} LIMIT ${DELETE_LIMIT}
       )`,
    )
    .bind(cutoff);
}

async function deleteExpiredPerformanceSamples(db: D1Database, now: Date) {
  let deleted = 0;
  for (;;) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    const result = await deleteExpired(db, PERFORMANCE_SAMPLES_RULE, now).run();
    deleted += result.meta.changes;
    if (result.meta.changes < DELETE_LIMIT) return deleted;
  }
}

export async function applyRetention(db: D1Database, now = new Date()) {
  const [deleted, performanceSamples, shops] = await Promise.all([
    db.batch(RETENTION_RULES.map((rule) => deleteExpired(db, rule, now))),
    deleteExpiredPerformanceSamples(db, now),
    redactExpiredShops(db, now, UNINSTALLED_SHOP_RETENTION_DAYS),
  ]);
  return {
    events: deleted.reduce((total, result) => total + result.meta.changes, performanceSamples),
    shops,
  };
}
