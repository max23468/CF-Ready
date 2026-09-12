import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { readSupportDiagnosticState } from "../app/support.server";
import { insertShop } from "./support/lifecycle";

test("la diagnostica legge solo lo stato D1 minimizzato e dà precedenza all'accesso attivo", async () => {
  const shop = await insertShop("support-diagnostics.example.myshopify.com");
  const now = "2026-08-29T10:00:00.000Z";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO app_state (
         shop_id, validation_enabled, config_schema_version, config_hash,
         last_sync_at, last_error_code, updated_at, validation_state_revision
       ) SELECT id, 1, 2, 'config-sha256', ?, 'validation_readback_failed', ?, 7
           FROM shops WHERE shop_domain = ?`,
    ).bind(now, now, shop),
    env.DB.prepare(
      `INSERT INTO trials (
         shop_id, status, eligible_at, started_at, ends_at, pricing_generation,
         created_at, updated_at
       ) SELECT id, 'active', ?, ?, '2026-09-10', 'launch', ?, ?
           FROM shops WHERE shop_domain = ?`,
    ).bind(now, now, now, now, shop),
    env.DB.prepare(
      `INSERT INTO billing_accounts (
         shop_id, entitlement_status, plan_kind, pricing_generation,
         last_reconciled_at, created_at, updated_at
       ) SELECT id, 'active', 'annual', 'launch', ?, ?, ?
           FROM shops WHERE shop_domain = ?`,
    ).bind(now, now, now, shop),
    env.DB.prepare(
      `INSERT INTO complimentary_entitlements (
         shop_id, status, granted_at, created_at, updated_at
       ) SELECT id, 'active', ?, ?, ? FROM shops WHERE shop_domain = ?`,
    ).bind(now, now, now, shop),
  ]);

  expect(await readSupportDiagnosticState(env.DB, shop)).toEqual({
    configHash: "config-sha256",
    configSchemaVersion: 2,
    entitlementKind: "complimentary",
    errorCode: "validation_readback_failed",
    lastSyncAt: now,
    validationEnabled: true,
    validationStateRevision: 7,
    checkoutLabelsEnabled: false,
    checkoutLabelsMode: "off",
    checkoutLabelsStatus: "unknown",
    address2Classification: "unknown",
    address2Decision: "pending",
    address2MarketOverride: false,
    checkoutLabelLocales: "",
    checkoutLabelMarketCount: 0,
    checkoutLabelsLastSyncAt: null,
    checkoutLabelsErrorCode: null,
  });
});

test("la diagnostica fallisce aperta su uno store senza stato operativo", async () => {
  const shop = await insertShop("support-empty.example.myshopify.com");

  expect(await readSupportDiagnosticState(env.DB, shop)).toEqual({
    configHash: null,
    configSchemaVersion: null,
    entitlementKind: "none",
    errorCode: null,
    lastSyncAt: null,
    validationEnabled: false,
    validationStateRevision: 0,
    checkoutLabelsEnabled: false,
    checkoutLabelsMode: "off",
    checkoutLabelsStatus: "unknown",
    address2Classification: "unknown",
    address2Decision: "pending",
    address2MarketOverride: false,
    checkoutLabelLocales: "",
    checkoutLabelMarketCount: 0,
    checkoutLabelsLastSyncAt: null,
    checkoutLabelsErrorCode: null,
  });
});

test("la diagnostica ignora un conflitto di Interno quando il campo è nascosto", async () => {
  const shop = await insertShop("support-hidden-address2.example.myshopify.com");
  const now = "2026-09-08T12:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO app_state (
       shop_id, checkout_labels_mode, checkout_labels_last_sync_at,
       address2_classification, address2_decision, address2_external_change_at,
       address2_form_mode, address2_form_hidden, updated_at
     ) SELECT id, 'automatic', ?, 'fiscal_conflict', 'pending', ?, 'required', 1, ?
         FROM shops WHERE shop_domain = ?`,
  )
    .bind(now, now, now, shop)
    .run();

  expect(await readSupportDiagnosticState(env.DB, shop)).toMatchObject({
    checkoutLabelsStatus: "synced",
    address2Classification: "fiscal_conflict",
  });
});

test("la diagnostica conserva come generico un errore persistito non ancora conosciuto", async () => {
  const shop = await insertShop("support-future-error.example.myshopify.com");
  await env.DB.prepare(
    `INSERT INTO app_state (shop_id, last_error_code, updated_at)
     SELECT id, 'future_validation_error', ? FROM shops WHERE shop_domain = ?`,
  )
    .bind("2026-09-02T10:00:00.000Z", shop)
    .run();

  expect((await readSupportDiagnosticState(env.DB, shop)).errorCode).toBe("generic");
});

test("la diagnostica distingue trial e account in chiusura anche senza piano", async () => {
  const now = "2026-09-02T10:00:00.000Z";
  const trialShop = await insertShop("support-trial.example.myshopify.com");
  await env.DB.prepare(
    `INSERT INTO trials (
       shop_id, status, eligible_at, started_at, ends_at, pricing_generation,
       created_at, updated_at
     ) SELECT id, 'active', ?, ?, '2026-09-10', 'balanced', ?, ?
         FROM shops WHERE shop_domain = ?`,
  )
    .bind(now, now, now, now, trialShop)
    .run();
  expect((await readSupportDiagnosticState(env.DB, trialShop)).entitlementKind).toBe("trial");

  const endingShop = await insertShop("support-ending.example.myshopify.com");
  await env.DB.prepare(
    `INSERT INTO billing_accounts (
       shop_id, entitlement_status, plan_kind, pricing_generation,
       last_reconciled_at, created_at, updated_at
     ) SELECT id, 'ending', 'none', 'balanced', ?, ?, ?
         FROM shops WHERE shop_domain = ?`,
  )
    .bind(now, now, now, endingShop)
    .run();
  expect((await readSupportDiagnosticState(env.DB, endingShop)).entitlementKind).toBe("none");
});
