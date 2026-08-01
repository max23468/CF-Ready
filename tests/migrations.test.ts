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
