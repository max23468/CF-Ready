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
       ) SELECT id, 'active', ?, ?, '2026-09-10', 'value', ?, ?
           FROM shops WHERE shop_domain = ?`,
    ).bind(now, now, now, now, shop),
    env.DB.prepare(
      `INSERT INTO billing_accounts (
         shop_id, entitlement_status, plan_kind, pricing_generation,
         last_reconciled_at, created_at, updated_at
       ) SELECT id, 'active', 'annual', 'value', ?, ?, ?
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
  });
});
