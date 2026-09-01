import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { expect, test } from "vitest";

type MigrationEnvironment = Env & {
  MIGRATION_DB: D1Database;
  MIGRATION_CORE_DB: D1Database;
  MIGRATION_PRIVACY_DB: D1Database;
  MIGRATION_NOTIFICATION_DB: D1Database;
  MIGRATION_ENTITLEMENT_DB: D1Database;
  MIGRATION_REVISION_DB: D1Database;
  MIGRATION_FULL_DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};

const migrationEnvironment = () => env as MigrationEnvironment;

async function applyThrough(db: D1Database, migrations: D1Migration[], lastName: string) {
  const lastIndex = migrations.findIndex(({ name }) => name === lastName);
  expect(lastIndex).toBeGreaterThanOrEqual(0);
  await applyD1Migrations(db, migrations.slice(0, lastIndex + 1));
}

function migrationAfter(migrations: D1Migration[], previousName: string) {
  const previousIndex = migrations.findIndex(({ name }) => name === previousName);
  expect(previousIndex).toBeGreaterThanOrEqual(0);
  return migrations[previousIndex + 1];
}

async function insertShop(db: D1Database, domain = "migration.example.myshopify.com") {
  await db
    .prepare(
      `INSERT INTO shops
         (id, shop_domain, installation_status, installed_at, created_at, updated_at)
       VALUES (1, ?, 'active', '2026-07-01', '2026-07-01', '2026-07-01')`,
    )
    .bind(domain)
    .run();
}

test("0001-0006 creano il nucleo persistente con vincoli, indici e cascade", async () => {
  const { MIGRATION_CORE_DB: db, TEST_MIGRATIONS: migrations } = migrationEnvironment();
  await applyThrough(db, migrations, "0006_billing.sql");
  await insertShop(db);

  await db
    .prepare(
      `INSERT INTO shopify_sessions
         (id, shop_id, is_online, session_payload_ciphertext, created_at, updated_at)
       VALUES ('offline_migration', 1, 0, 'ciphertext', '2026-07-01', '2026-07-01')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO validation_operation_locks (shop_domain, owner_token, expires_at)
       VALUES ('migration.example.myshopify.com', 'owner', 42)`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO app_state (shop_id, validation_enabled, updated_at)
       VALUES (1, 0, '2026-07-01')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO webhook_events (webhook_id, topic, status, received_at)
       VALUES ('webhook-core', 'APP_UNINSTALLED', 'processing', '2026-07-01')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
       VALUES (1, 'installed', 'lifecycle', '2026-07-01')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO trials
         (shop_id, status, eligible_at, pricing_generation, created_at, updated_at)
       VALUES (1, 'not_started', '2026-07-01', 'launch', '2026-07-01', '2026-07-01')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO trial_ledger (shop_hash, pricing_generation, recorded_at)
       VALUES ('shop-hash', 'launch', '2026-07-01')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO billing_accounts
         (shop_id, entitlement_status, plan_kind, pricing_generation, created_at, updated_at)
       VALUES (1, 'none', 'none', 'launch', '2026-07-01', '2026-07-01')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO billing_events
         (shop_id, shopify_resource_gid, event_type, status, occurred_at, created_at)
       VALUES (1, 'gid://shopify/AppSubscription/1', 'activated', 'active', '2026-07-01', '2026-07-01')`,
    )
    .run();

  await expect(
    db
      .prepare(
        `INSERT INTO shops
           (id, shop_domain, installation_status, installed_at, created_at, updated_at)
         VALUES (2, 'invalid.example.myshopify.com', 'unknown', 'x', 'x', 'x')`,
      )
      .run(),
  ).rejects.toThrow();
  await expect(
    db
      .prepare(
        `INSERT INTO billing_events
           (shop_id, shopify_resource_gid, event_type, status, occurred_at, created_at)
         VALUES (1, 'gid://shopify/AppSubscription/1', 'activated', 'duplicate', 'x', 'x')`,
      )
      .run(),
  ).rejects.toThrow();

  const indexes = await db
    .prepare(
      `SELECT name FROM sqlite_schema
       WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'
       ORDER BY name`,
    )
    .all<{ name: string }>();
  expect(indexes.results.map(({ name }) => name)).toEqual([
    "app_events_shop_id_occurred_at_idx",
    "billing_events_resource_type_idx",
    "shopify_sessions_shop_id_idx",
  ]);

  await db.prepare("DELETE FROM shops WHERE id = 1").run();
  for (const table of [
    "shopify_sessions",
    "validation_operation_locks",
    "app_state",
    "app_events",
    "trials",
    "billing_accounts",
    "billing_events",
  ]) {
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first("count")).toBe(0);
  }
  expect(await db.prepare("SELECT COUNT(*) AS count FROM trial_ledger").first("count")).toBe(1);
});

test("0007 e 0008 aggiornano lo schema precedente conservando i dati", async () => {
  const { MIGRATION_DB: db, TEST_MIGRATIONS: migrations } = env as Env & {
    MIGRATION_DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  };
  const onboardingIndex = migrations.findIndex(({ name }) => name === "0007_onboarding.sql");
  const claimsIndex = migrations.findIndex(
    ({ name }) => name === "0008_webhook_claim_ownership.sql",
  );
  expect(onboardingIndex).toBeGreaterThan(0);
  expect(claimsIndex).toBe(onboardingIndex + 1);
  const previousMigrations = migrations.slice(0, onboardingIndex);
  const onboardingMigration = migrations[onboardingIndex];
  const claimsMigration = migrations[claimsIndex];

  await applyD1Migrations(db, previousMigrations);
  await db
    .prepare(
      `INSERT INTO shops
         (id, shop_domain, installation_status, installed_at, created_at, updated_at)
       VALUES (1, 'upgrade.example.myshopify.com', 'active', '2026-07-31', '2026-07-31', '2026-07-31')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO app_state
         (shop_id, validation_gid, validation_enabled, config_schema_version, config_hash, updated_at)
       VALUES (1, 'gid://shopify/Validation/1', 1, 2, 'hash-precedente', '2026-07-31')`,
    )
    .run();

  await applyD1Migrations(db, [onboardingMigration]);

  expect(await db.prepare("SELECT * FROM app_state WHERE shop_id = 1").first()).toMatchObject({
    validation_gid: "gid://shopify/Validation/1",
    validation_enabled: 1,
    config_schema_version: 2,
    config_hash: "hash-precedente",
    onboarding_status: "not_started",
    onboarding_step: 0,
    setup_checklist_dismissed_at: null,
    address2_conflict_declared_at: null,
  });

  await db
    .prepare(
      `INSERT INTO webhook_events
         (webhook_id, shop_domain, topic, status, received_at)
       VALUES ('webhook-upgrade', 'upgrade.example.myshopify.com', 'SHOP_UPDATE', 'processing', '2026-07-31')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO app_events
         (id, shop_id, event_name, event_class, occurred_at)
       VALUES (1, 1, 'shop_updated', 'lifecycle', '2026-07-31')`,
    )
    .run();

  await applyD1Migrations(db, [claimsMigration]);

  expect(
    await db.prepare("SELECT * FROM webhook_events WHERE webhook_id = 'webhook-upgrade'").first(),
  ).toMatchObject({
    shop_domain: "upgrade.example.myshopify.com",
    topic: "SHOP_UPDATE",
    status: "processing",
    claim_token: null,
    installation_started_at: null,
  });
  expect(await db.prepare("SELECT * FROM app_events WHERE id = 1").first()).toMatchObject({
    shop_id: 1,
    event_name: "shop_updated",
    webhook_id: null,
  });

  await db.prepare("UPDATE app_events SET webhook_id = 'webhook-upgrade' WHERE id = 1").run();
  await expect(
    db
      .prepare(
        `INSERT INTO app_events
           (shop_id, webhook_id, event_name, event_class, occurred_at)
         VALUES (1, 'webhook-upgrade', 'shop_updated', 'lifecycle', '2026-08-01')`,
      )
      .run(),
  ).rejects.toThrow();
});

test("0011 crea l'outbox owner e conserva la transizione billing precedente", async () => {
  const { TEST_MIGRATIONS: migrations } = env as Env & {
    TEST_MIGRATIONS: D1Migration[];
  };
  const notificationIndex = migrations.findIndex(
    ({ name }) => name === "0011_owner_notifications.sql",
  );
  expect(notificationIndex).toBeGreaterThan(0);

  const columns = await env.DB.prepare("PRAGMA table_info(owner_notifications)").all<{
    name: string;
  }>();

  expect(columns.results.map(({ name }) => name)).not.toContain("shop_id");
  const redactionColumns = await env.DB.prepare(
    "PRAGMA table_info(owner_notification_redactions)",
  ).all<{ name: string }>();
  expect(redactionColumns.results.map(({ name }) => name)).toEqual(["shop_hash", "redacted_at"]);
  const billingColumns = await env.DB.prepare("PRAGMA table_info(billing_events)").all<{
    name: string;
  }>();
  expect(billingColumns.results.map(({ name }) => name)).toEqual(
    expect.arrayContaining(["previous_entitlement_status", "previous_plan_kind"]),
  );
  expect(columns.results.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "dedupe_key",
      "notification_kind",
      "shop_domain",
      "body_text",
      "status",
      "attempts",
    ]),
  );
});

test("0009 e 0010 preservano i dati ammessi e applicano l'hardening privacy", async () => {
  const { MIGRATION_PRIVACY_DB: db, TEST_MIGRATIONS: migrations } = migrationEnvironment();
  await applyThrough(db, migrations, "0009_shop_retention.sql");
  await insertShop(db);
  await db
    .prepare(
      `INSERT INTO shopify_sessions
         (id, shop_id, is_online, online_user_id, session_payload_ciphertext, created_at, updated_at)
       VALUES ('offline_privacy', 1, 0, '12345', 'payload-preservato', '2026-07-01', '2026-07-01')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO trial_ledger (shop_hash, pricing_generation, recorded_at)
       VALUES ('hash-da-eliminare', 'launch', '2026-07-01')`,
    )
    .run();

  const retentionIndex = await db
    .prepare("SELECT sql FROM sqlite_schema WHERE name = 'shops_uninstalled_at_idx'")
    .first<string>("sql");
  expect(retentionIndex).toContain("WHERE installation_status = 'uninstalled'");

  await applyD1Migrations(db, [migrationAfter(migrations, "0009_shop_retention.sql")]);

  expect(await db.prepare("SELECT COUNT(*) AS count FROM trial_ledger").first("count")).toBe(0);
  expect(
    await db.prepare("SELECT session_payload_ciphertext FROM shopify_sessions").first(),
  ).toEqual({ session_payload_ciphertext: "payload-preservato" });
  const sessionColumns = await db.prepare("PRAGMA table_info(shopify_sessions)").all<{
    name: string;
  }>();
  expect(sessionColumns.results.map(({ name }) => name)).not.toContain("online_user_id");
  const indexes = await db
    .prepare(
      `SELECT name FROM sqlite_schema
       WHERE name IN (
         'webhook_events_received_at_idx',
         'app_events_class_occurred_at_idx',
         'billing_events_occurred_at_idx'
       ) ORDER BY name`,
    )
    .all<{ name: string }>();
  expect(indexes.results.map(({ name }) => name)).toEqual([
    "app_events_class_occurred_at_idx",
    "billing_events_occurred_at_idx",
    "webhook_events_received_at_idx",
  ]);
});

test("0011 conserva gli eventi billing e vincola outbox e deduplicazione", async () => {
  const { MIGRATION_NOTIFICATION_DB: db, TEST_MIGRATIONS: migrations } = migrationEnvironment();
  await applyThrough(db, migrations, "0010_privacy_hardening.sql");
  await insertShop(db);
  await db
    .prepare(
      `INSERT INTO billing_events
         (id, shop_id, shopify_resource_gid, event_type, status, occurred_at, created_at)
       VALUES (7, 1, 'gid://shopify/AppSubscription/7', 'activated', 'active', '2026-07-01', '2026-07-01')`,
    )
    .run();

  await applyD1Migrations(db, [migrationAfter(migrations, "0010_privacy_hardening.sql")]);

  expect(await db.prepare("SELECT * FROM billing_events WHERE id = 7").first()).toMatchObject({
    shopify_resource_gid: "gid://shopify/AppSubscription/7",
    previous_entitlement_status: null,
    previous_plan_kind: null,
  });
  const insertNotification = (dedupeKey: string, status = "pending") =>
    db
      .prepare(
        `INSERT INTO owner_notifications
           (dedupe_key, notification_kind, shop_domain, subject, body_text,
            source_occurred_at, status, available_at, created_at, updated_at)
         VALUES (?, 'billing', 'migration.example.myshopify.com', 'Piano', 'Attivato',
                 '2026-07-01', ?, '2026-07-01', '2026-07-01', '2026-07-01')`,
      )
      .bind(dedupeKey, status)
      .run();
  await insertNotification("billing:7");
  await expect(insertNotification("billing:7")).rejects.toThrow();
  await expect(insertNotification("billing:8", "unknown")).rejects.toThrow();
});

test("0012 crea le concessioni omaggio senza fingere una charge Shopify", async () => {
  const columns = await env.DB.prepare("PRAGMA table_info(complimentary_entitlements)").all<{
    name: string;
  }>();
  expect(columns.results.map(({ name }) => name)).toEqual(
    expect.arrayContaining(["shop_id", "status", "granted_at", "revoked_at"]),
  );
});

test("0013 crea campioni performance minimizzati e idempotenti", async () => {
  const columns = await env.DB.prepare("PRAGMA table_info(performance_samples)").all<{
    name: string;
  }>();
  expect(columns.results.map(({ name }) => name)).toEqual([
    "id",
    "shop_id",
    "metric_id",
    "metric_name",
    "metric_value",
    "country_code",
    "app_version",
    "app_route",
    "server_timing_json",
    "observed_at",
  ]);
  const indexes = await env.DB.prepare("PRAGMA index_list(performance_samples)").all<{
    name: string;
  }>();
  expect(indexes.results.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "performance_samples_metric_observed_idx",
      "performance_samples_version_route_metric_idx",
    ]),
  );
});

test("0012 e 0013 applicano vincoli, deduplicazione e cascade sui dati operativi", async () => {
  const { MIGRATION_ENTITLEMENT_DB: db, TEST_MIGRATIONS: migrations } = migrationEnvironment();
  await applyThrough(db, migrations, "0013_performance_samples.sql");
  await insertShop(db);
  await db
    .prepare(
      `INSERT INTO complimentary_entitlements
         (shop_id, status, granted_at, created_at, updated_at)
       VALUES (1, 'active', '2026-07-01', '2026-07-01', '2026-07-01')`,
    )
    .run();
  const insertSample = (
    metricId: string,
    metricName: string,
    value: number,
    timing: string | null,
  ) =>
    db
      .prepare(
        `INSERT INTO performance_samples
           (shop_id, metric_id, metric_name, metric_value, country_code,
            app_version, app_route, server_timing_json, observed_at)
         VALUES (1, ?, ?, ?, 'IT', '1.1.4', 'home', ?, '2026-07-01')`,
      )
      .bind(metricId, metricName, value, timing)
      .run();
  await insertSample("metric-1", "LCP", 1200, '{"db":4}');
  await expect(insertSample("metric-1", "LCP", 1300, null)).rejects.toThrow();
  await expect(insertSample("metric-2", "UNKNOWN", 1, null)).rejects.toThrow();
  await expect(insertSample("metric-3", "CLS", -1, null)).rejects.toThrow();
  await expect(insertSample("metric-4", "INP", 1, "not-json")).rejects.toThrow();
  await expect(
    db
      .prepare(
        `INSERT INTO complimentary_entitlements
           (shop_id, status, granted_at, created_at, updated_at)
         VALUES (2, 'unknown', 'x', 'x', 'x')`,
      )
      .run(),
  ).rejects.toThrow();

  await db.prepare("DELETE FROM shops WHERE id = 1").run();
  expect(
    await db.prepare("SELECT COUNT(*) AS count FROM complimentary_entitlements").first("count"),
  ).toBe(0);
  expect(await db.prepare("SELECT COUNT(*) AS count FROM performance_samples").first("count")).toBe(
    0,
  );
});

test("0014 aggiunge il fence monotono allo stato Validation", async () => {
  const columns = await env.DB.prepare("PRAGMA table_info(app_state)").all<{
    name: string;
    dflt_value: string | null;
  }>();
  expect(columns.results).toContainEqual(
    expect.objectContaining({ name: "validation_state_revision", dflt_value: "0" }),
  );
});

test("0015 aggiunge il nome pubblico dello store senza ricostruire l'outbox", async () => {
  const { TEST_MIGRATIONS: migrations } = env as Env & {
    TEST_MIGRATIONS: D1Migration[];
  };
  const detailsIndex = migrations.findIndex(
    ({ name }) => name === "0015_owner_notification_details.sql",
  );
  expect(detailsIndex).toBeGreaterThan(0);
  expect(migrations[detailsIndex - 1].name).toBe("0014_validation_state_revision.sql");

  const shopColumns = await env.DB.prepare("PRAGMA table_info(shops)").all<{ name: string }>();
  expect(shopColumns.results.map(({ name }) => name)).toContain("display_name");
});

test("0014 e 0015 aggiornano snapshot esistenti senza perdere stato", async () => {
  const { MIGRATION_REVISION_DB: db, TEST_MIGRATIONS: migrations } = migrationEnvironment();
  await applyThrough(db, migrations, "0013_performance_samples.sql");
  await insertShop(db);
  await db
    .prepare(
      `INSERT INTO app_state
         (shop_id, validation_gid, validation_enabled, config_schema_version, config_hash,
          onboarding_status, onboarding_step, updated_at)
       VALUES (1, 'gid://shopify/Validation/15', 1, 2, 'hash-15', 'completed', 4, '2026-07-01')`,
    )
    .run();

  await applyD1Migrations(db, [migrationAfter(migrations, "0013_performance_samples.sql")]);
  expect(await db.prepare("SELECT * FROM app_state WHERE shop_id = 1").first()).toMatchObject({
    validation_gid: "gid://shopify/Validation/15",
    validation_enabled: 1,
    config_hash: "hash-15",
    onboarding_status: "completed",
    validation_state_revision: 0,
  });
  await expect(
    db.prepare("UPDATE app_state SET validation_state_revision = -1 WHERE shop_id = 1").run(),
  ).rejects.toThrow();

  await applyD1Migrations(db, [migrationAfter(migrations, "0014_validation_state_revision.sql")]);
  expect(await db.prepare("SELECT * FROM shops WHERE id = 1").first()).toMatchObject({
    shop_domain: "migration.example.myshopify.com",
    display_name: null,
  });
});

test("l'intera sequenza produce uno schema integro con tutti gli indici dichiarati", async () => {
  const { MIGRATION_FULL_DB: db, TEST_MIGRATIONS: migrations } = migrationEnvironment();
  expect(migrations.map(({ name }) => name)).toEqual([
    "0001_initial.sql",
    "0002_validation_operation_locks.sql",
    "0003_app_state_webhooks_events.sql",
    "0004_trials.sql",
    "0005_trial_ledger.sql",
    "0006_billing.sql",
    "0007_onboarding.sql",
    "0008_webhook_claim_ownership.sql",
    "0009_shop_retention.sql",
    "0010_privacy_hardening.sql",
    "0011_owner_notifications.sql",
    "0012_complimentary_entitlements.sql",
    "0013_performance_samples.sql",
    "0014_validation_state_revision.sql",
    "0015_owner_notification_details.sql",
  ]);
  await applyD1Migrations(db, migrations);

  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  const tables = await db
    .prepare(
      `SELECT name FROM sqlite_schema
       WHERE type = 'table'
         AND name NOT LIKE '_cf_%'
         AND name NOT LIKE 'sqlite_%'
         AND name != 'd1_migrations'
       ORDER BY name`,
    )
    .all<{ name: string }>();
  expect(tables.results.map(({ name }) => name)).toEqual([
    "app_events",
    "app_state",
    "billing_accounts",
    "billing_events",
    "complimentary_entitlements",
    "owner_notification_redactions",
    "owner_notification_state",
    "owner_notifications",
    "performance_samples",
    "shopify_sessions",
    "shops",
    "trial_ledger",
    "trials",
    "validation_operation_locks",
    "webhook_events",
  ]);
  const indexes = await db
    .prepare(
      `SELECT name FROM sqlite_schema
       WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'
       ORDER BY name`,
    )
    .all<{ name: string }>();
  expect(indexes.results.map(({ name }) => name)).toEqual([
    "app_events_class_occurred_at_idx",
    "app_events_shop_id_occurred_at_idx",
    "app_events_webhook_name_idx",
    "billing_events_occurred_at_idx",
    "billing_events_resource_type_idx",
    "owner_notification_redactions_retention_idx",
    "owner_notifications_created_at_idx",
    "owner_notifications_delivery_idx",
    "owner_notifications_shop_domain_idx",
    "performance_samples_metric_observed_idx",
    "performance_samples_version_route_metric_idx",
    "shopify_sessions_shop_id_idx",
    "shops_uninstalled_at_idx",
    "webhook_events_received_at_idx",
  ]);
});
