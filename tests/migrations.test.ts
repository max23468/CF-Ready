import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { expect, test } from "vitest";

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
