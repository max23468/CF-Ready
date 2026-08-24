import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import { localDate, startTrial, trialEnd } from "../../app/billing.server";
import {
  acquireValidationLock,
  reconcile,
  releaseValidationLockBestEffort,
} from "../../app/validation.server";
import {
  insertShop,
  FUSO,
  shopContext,
  SENZA_ADDEBITI,
  CONVERSIONE_UNA_TANTUM,
  adminStub,
  appState,
  clearBillingEvents,
} from "../support/lifecycle";

test("una cancellazione subscription fallita resta ritentabile", async () => {
  const shop = await insertShop("conversione-fallita.example.myshopify.com");
  const entitlement = { kind: "one_time", validThrough: null };
  const admin = adminStub([
    shopContext("IT", true, entitlement),
    CONVERSIONE_UNA_TANTUM,
    CONVERSIONE_UNA_TANTUM,
    { data: { appSubscriptionCancel: { userErrors: [{ message: "temporaneo" }] } } },
  ]);

  try {
    const state = await reconcile(admin, env.DB, shop);

    expect(state.errorCode).toBe("subscription_cancel_failed");
    expect(state.retryable).toBe(true);
    expect(admin.calls).toEqual(["context", "billing", "billing", "cancel"]);
  } finally {
    await clearBillingEvents(shop);
  }
});

test("i duplicati attivi restano visibili se fallisce anche la conversione billing", async () => {
  const shop = await insertShop("duplicati-conversione-fallita.example.myshopify.com");
  const context = shopContext("IT", true);
  context.data.validations.nodes.push({
    ...context.data.validations.nodes[0],
    id: "gid://shopify/Validation/2",
  });
  const admin = adminStub([
    context,
    { data: { validationUpdate: { userErrors: [] } } },
    { data: { validationUpdate: { userErrors: [] } } },
    context,
    CONVERSIONE_UNA_TANTUM,
    CONVERSIONE_UNA_TANTUM,
    { data: { appSubscriptionCancel: { userErrors: [{ message: "temporaneo" }] } } },
  ]);

  try {
    const state = await reconcile(admin, env.DB, shop);

    expect(state.validation).toBeUndefined();
    expect(state.errorCode).toBe("duplicate_validations_active");
    expect(state.retryable).toBe(true);
    expect(admin.calls).toEqual([
      "context",
      "update",
      "update",
      "context",
      "billing",
      "billing",
      "cancel",
    ]);
  } finally {
    await clearBillingEvents(shop);
  }
});

test("un errore durante il refresh della conversione billing resta ritentabile", async () => {
  const shop = await insertShop("conversione-refresh-fallito.example.myshopify.com");
  const admin = adminStub([
    shopContext("IT", true),
    CONVERSIONE_UNA_TANTUM,
    new Error("Shopify non disponibile"),
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.errorCode).toBe("billing_read_failed");
  expect(state.retryable).toBe(true);
  expect(admin.calls).toEqual(["context", "billing", "billing"]);
});

test("una conversione billing bloccata resta ritentabile", async () => {
  const shop = await insertShop("conversione-bloccata.example.myshopify.com");
  const lockToken = await acquireValidationLock(env.DB, shop);
  expect(lockToken).not.toBeNull();
  const entitlement = { kind: "one_time", validThrough: null };
  const admin = adminStub([shopContext("IT", true, entitlement), CONVERSIONE_UNA_TANTUM]);

  try {
    const state = await reconcile(admin, env.DB, shop);

    expect(state.errorCode).toBe("validation_locked");
    expect(state.retryable).toBe(true);
    expect(admin.calls).toEqual(["context", "billing"]);
  } finally {
    await releaseValidationLockBestEffort(env.DB, shop, lockToken!);
    await clearBillingEvents(shop);
  }
});

test("una conversione billing che perde la lease non cancella e resta ritentabile", async () => {
  vi.useFakeTimers();
  const shop = await insertShop("conversione-lease-persa.example.myshopify.com");
  const entitlement = { kind: "one_time", validThrough: null };
  const admin = adminStub([
    shopContext("IT", true, entitlement),
    CONVERSIONE_UNA_TANTUM,
    CONVERSIONE_UNA_TANTUM,
  ]);
  const graphql = admin.graphql;
  admin.graphql = async (query, options) => {
    const response = await graphql(query, options);
    if (admin.calls.length === 3) {
      await env.DB.prepare(
        `UPDATE validation_operation_locks
         SET owner_token = 'intruso', expires_at = ?
         WHERE shop_domain = ?`,
      )
        .bind(Date.now() + 60_000, shop)
        .run();
      await vi.advanceTimersByTimeAsync(20_000);
    }
    return response;
  };

  try {
    const state = await reconcile(admin, env.DB, shop);

    expect(state.errorCode).toBe("validation_locked");
    expect(state.retryable).toBe(true);
    expect(admin.calls).toEqual(["context", "billing", "billing"]);
  } finally {
    await env.DB.prepare("DELETE FROM validation_operation_locks WHERE shop_domain = ?")
      .bind(shop)
      .run();
    await clearBillingEvents(shop);
    vi.useRealTimers();
  }
});

test("il readback entitlement conserva lo stato attivo dei duplicati concorrenti", async () => {
  const shop = await insertShop("readback-entitlement-duplicato.example.myshopify.com");
  await startTrial(env.DB, shop, { eligible: true, today: localDate(FUSO) });
  const entitlement = { kind: "trial", validThrough: trialEnd(localDate(FUSO)) };
  const readback = shopContext("IT", true, entitlement);
  readback.data.validations.nodes.push({
    ...readback.data.validations.nodes[0],
    id: "gid://shopify/Validation/2",
    enabled: false,
  });
  const admin = adminStub([
    shopContext("IT", true),
    SENZA_ADDEBITI,
    shopContext("IT", true),
    { data: { validationUpdate: { userErrors: [] } } },
    readback,
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.validation).toBeUndefined();
  expect(state.validationEnabled).toBe(true);
  expect(state.errorCode).toBe("duplicate_validations_active");
  expect(state.retryable).toBe(true);
  expect(await appState(shop)).toMatchObject({
    validation_enabled: 1,
    last_error_code: "duplicate_validations_active",
  });
});

test("un duplicato attivo al readback prevale su un errore operativo precedente", async () => {
  const shop = await insertShop("readback-duplicato-con-errore.example.myshopify.com");
  const entitlementAttivo = { kind: "trial", validThrough: "2026-08-20" };
  const readback = shopContext("IT", true);
  readback.data.validations.nodes.push({
    ...readback.data.validations.nodes[0],
    id: "gid://shopify/Validation/2",
    enabled: false,
  });
  const admin = adminStub([
    shopContext("IT", true, entitlementAttivo),
    { errors: [{ message: "servizio billing non disponibile" }] },
    shopContext("IT", true, entitlementAttivo),
    { data: { validationUpdate: { userErrors: [] } } },
    readback,
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.validation).toBeUndefined();
  expect(state.validationEnabled).toBe(true);
  expect(state.errorCode).toBe("duplicate_validations_active");
  expect(await appState(shop)).toMatchObject({
    validation_enabled: 1,
    last_error_code: "duplicate_validations_active",
  });
});

test("un readback senza Validation non conserva lo stato attivo precedente", async () => {
  const shop = await insertShop("validation-rimossa.example.myshopify.com");
  // Con una prova in corso l'entitlement va riscritto: è la sequenza che porta al readback.
  await startTrial(env.DB, shop, { eligible: true, today: localDate(FUSO) });
  const admin = adminStub([
    shopContext("IT", true),
    SENZA_ADDEBITI,
    shopContext("IT", true),
    { data: { validationUpdate: { userErrors: [] } } },
    shopContext("IT", null),
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.validation).toBeUndefined();
  expect(state.validationEnabled).toBe(false);
  expect(await appState(shop)).toMatchObject({
    validation_gid: null,
    validation_enabled: 0,
  });
});

test("la concessione omaggio non nasconde un rinnovo quando il billing Shopify non risponde", async () => {
  const shop = await insertShop("omaggio.example.myshopify.com");
  const now = "2026-08-24T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO complimentary_entitlements
       (shop_id, status, granted_at, revoked_at, created_at, updated_at)
     SELECT id, 'active', ?, NULL, ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind(now, now, now, shop)
    .run();
  const admin = adminStub([
    shopContext("IT", true, { kind: "none", validThrough: null }),
    new Error("billing non disponibile"),
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.entitlement).toEqual({ kind: "none", validThrough: null });
  expect(state.complimentary).toMatchObject({ status: "active" });
  expect(state.errorCode).toBe("billing_read_failed");
  expect(state.retryable).toBe(true);
  expect(admin.calls).toEqual(["context", "billing"]);
});

test("la concessione omaggio cancella e rilegge l'abbonamento prima di diventare operativa", async () => {
  const shop = await insertShop("omaggio-con-abbonamento.example.myshopify.com");
  const now = "2026-08-24T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO complimentary_entitlements
       (shop_id, status, granted_at, revoked_at, created_at, updated_at)
     SELECT id, 'active', ?, NULL, ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind(now, now, now, shop)
    .run();
  const subscriptionOnly = structuredClone(CONVERSIONE_UNA_TANTUM);
  subscriptionOnly.data.currentAppInstallation.oneTimePurchases.nodes = [];
  const activeEntitlement = { kind: "one_time", validThrough: null };
  const admin = adminStub([
    shopContext("IT", true),
    subscriptionOnly,
    subscriptionOnly,
    { data: { appSubscriptionCancel: { userErrors: [] } } },
    SENZA_ADDEBITI,
    shopContext("IT", true),
    { data: { validationUpdate: { userErrors: [] } } },
    shopContext("IT", true, activeEntitlement),
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.entitlement).toEqual(activeEntitlement);
  expect(state.errorCode).toBeNull();
  expect(admin.calls).toEqual([
    "context",
    "billing",
    "billing",
    "cancel",
    "billing",
    "context",
    "update",
    "context",
  ]);
});

test("la concessione omaggio resta non operativa se la cancellazione fallisce", async () => {
  const shop = await insertShop("omaggio-cancellazione-fallita.example.myshopify.com");
  const now = "2026-08-24T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO complimentary_entitlements
       (shop_id, status, granted_at, revoked_at, created_at, updated_at)
     SELECT id, 'active', ?, NULL, ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind(now, now, now, shop)
    .run();
  const subscriptionOnly = structuredClone(CONVERSIONE_UNA_TANTUM);
  subscriptionOnly.data.currentAppInstallation.oneTimePurchases.nodes = [];
  const subscriptionEntitlement = { kind: "subscription", validThrough: "2026-08-31" };
  const admin = adminStub([
    shopContext("IT", true, subscriptionEntitlement),
    subscriptionOnly,
    subscriptionOnly,
    { data: { appSubscriptionCancel: { userErrors: [{ message: "temporaneo" }] } } },
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.entitlement).toEqual(subscriptionEntitlement);
  expect(state.errorCode).toBe("subscription_cancel_failed");
  expect(state.retryable).toBe(true);
  expect(admin.calls).toEqual(["context", "billing", "billing", "cancel"]);
});

test("una concessione revocata durante la riconciliazione non cancella l'abbonamento", async () => {
  const shop = await insertShop("omaggio-revocato-in-corsa.example.myshopify.com");
  const now = "2026-08-24T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO complimentary_entitlements
       (shop_id, status, granted_at, revoked_at, created_at, updated_at)
     SELECT id, 'active', ?, NULL, ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind(now, now, now, shop)
    .run();
  const subscriptionOnly = structuredClone(CONVERSIONE_UNA_TANTUM);
  subscriptionOnly.data.currentAppInstallation.oneTimePurchases.nodes = [];
  const subscriptionEntitlement = { kind: "subscription", validThrough: "2026-08-31" };
  const admin = adminStub([
    shopContext("IT", true, subscriptionEntitlement),
    subscriptionOnly,
    subscriptionOnly,
  ]);
  const graphql = admin.graphql;
  admin.graphql = async (query, options) => {
    const response = await graphql(query, options);
    if (admin.calls.length === 3) {
      await env.DB.prepare(
        `UPDATE complimentary_entitlements
         SET status = 'revoked', revoked_at = ?, updated_at = ?
         WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
      )
        .bind(now, now, shop)
        .run();
    }
    return response;
  };

  const state = await reconcile(admin, env.DB, shop);

  expect(state.entitlement).toEqual(subscriptionEntitlement);
  expect(state.errorCode).toBeNull();
  expect(admin.calls).toEqual(["context", "billing", "billing"]);
});
