import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  enableCheckoutLabels,
  readCheckoutLabelState,
} from "../../app/checkout-labels/repository.server";
import { DEFAULT_CONFIG } from "../../app/config";
import { acquireValidationLock } from "../../app/validation/lock.server";
import { claimWebhook } from "../../app/webhooks/webhook-ingress.server";
import { processWebhookJob } from "../../app/webhooks/webhook-jobs.server";
import { appState } from "../support/lifecycle";
import { eventsOfWebhook, merchant } from "../support/merchant";
import type { ShopifyAdminFake } from "../support/shopify-admin";

// Sessioni e client admin sono il confine di autenticazione; il resto è codice reale su D1.
const boundary = vi.hoisted(() => ({
  findOfflineSession: vi.fn(),
  storeSession: vi.fn(),
  admin: vi.fn(),
}));

vi.mock("../../app/shopify.server", () => ({
  findOfflineSession: boundary.findOfflineSession,
  sessionStorage: { storeSession: boundary.storeSession },
  unauthenticated: { admin: boundary.admin },
}));

let shop: string;
let shopify: ShopifyAdminFake;

beforeEach(async () => {
  ({ shop, shopify } = await merchant("esito"));
  vi.clearAllMocks();
  boundary.findOfflineSession.mockResolvedValue({ id: "offline", isOnline: false, scope: "old" });
  boundary.admin.mockResolvedValue({ admin: shopify.admin });
});

async function claimedJob(
  topic: string,
  { triggeredAt, ...payload }: { triggeredAt?: string; currentScopes?: string[] } = {},
) {
  const webhookId = `wh-${crypto.randomUUID()}`;
  const claim = await claimWebhook(env.DB, webhookId, topic, shop, { triggeredAt });
  if (!claim.acquired) throw new Error("claim non acquisito");
  return { webhookId, claimToken: claim.token, shop, ...payload };
}

async function webhookStatus(webhookId: string) {
  const row = await env.DB.prepare("SELECT status FROM webhook_events WHERE webhook_id = ?")
    .bind(webhookId)
    .first<{ status: string }>();
  return row?.status;
}

const shopRow = () =>
  env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?").bind(shop).first();

test("marca la stessa installazione come disinstallata", async () => {
  const job = await claimedJob("APP_UNINSTALLED", { triggeredAt: "2026-08-01T10:00:00.000Z" });

  await processWebhookJob(env.DB, job);

  expect(await appState(shop)).toMatchObject({ installation_status: "uninstalled" });
  expect(await webhookStatus(job.webhookId)).toBe("processed");
});

test("una disinstallazione senza installazione associata resta fail-open", async () => {
  // L'evento precede l'installazione corrente: appartiene a una vita precedente dello store.
  const job = await claimedJob("APP_UNINSTALLED", { triggeredAt: "2026-07-01T10:00:00.000Z" });

  await expect(processWebhookJob(env.DB, job)).resolves.toBeUndefined();

  expect(await appState(shop)).toMatchObject({ installation_status: "active" });
  expect(await webhookStatus(job.webhookId)).toBe("processed");
});

test("aggiorna la sessione offline quando Shopify invia gli scope", async () => {
  await enableCheckoutLabels(env.DB, shop, "partial");
  const offline = { id: "offline", isOnline: false, scope: "old" };
  boundary.findOfflineSession.mockResolvedValue(offline);
  const job = await claimedJob("APP_SCOPES_UPDATE", {
    currentScopes: ["read_products", "write_products"],
  });

  await processWebhookJob(env.DB, job);

  expect(offline.scope).toBe("read_products,write_products");
  expect(boundary.storeSession).toHaveBeenCalledWith(offline);
  expect(await readCheckoutLabelState(env.DB, shop)).toMatchObject({
    mode: "guided",
    lastErrorCode: "checkout_labels_scope_required",
  });
});

test("mantiene le etichette quando tutti gli scope opzionali restano concessi", async () => {
  await enableCheckoutLabels(env.DB, shop, "partial");
  const job = await claimedJob("APP_SCOPES_UPDATE", {
    currentScopes: ["write_translations", "read_locales", "read_markets"],
  });

  await processWebhookJob(env.DB, job);

  expect(await readCheckoutLabelState(env.DB, shop)).toMatchObject({
    mode: "partial",
    lastErrorCode: null,
  });
});

test.each([
  [undefined, ["read_products"]],
  [{ id: "offline", isOnline: false }, undefined],
] as const)("ignora un aggiornamento scope incompleto", async (session, currentScopes) => {
  boundary.findOfflineSession.mockResolvedValue(session);
  const job = await claimedJob("APP_SCOPES_UPDATE", {
    currentScopes: currentScopes ? [...currentScopes] : undefined,
  });

  await processWebhookJob(env.DB, job);

  expect(boundary.storeSession).not.toHaveBeenCalled();
  expect(await webhookStatus(job.webhookId)).toBe("processed");
});

test("rimuove i dati dello shop quando la redazione è applicabile", async () => {
  await env.DB.prepare("UPDATE shops SET installation_status = 'uninstalled' WHERE shop_domain = ?")
    .bind(shop)
    .run();
  const job = await claimedJob("SHOP_REDACT");

  await processWebhookJob(env.DB, job);

  expect(await shopRow()).toBeNull();
  expect((await eventsOfWebhook(job.webhookId)).map(({ name }) => name)).toEqual(["shop_redacted"]);
});

test("registra il motivo quando una redazione non può toccare un'installazione attiva", async () => {
  const job = await claimedJob("SHOP_REDACT");

  await processWebhookJob(env.DB, job);

  expect(await shopRow()).not.toBeNull();
  expect(await eventsOfWebhook(job.webhookId)).toEqual([
    {
      name: "shop_redact_skipped",
      class: "lifecycle",
      metadata: { topic: "SHOP_REDACT", reason: "installation_active" },
    },
  ]);
});

test.each(["CUSTOMERS_DATA_REQUEST", "CUSTOMERS_REDACT"])(
  "riconosce %s senza leggere dati cliente",
  async (topic) => {
    const job = await claimedJob(topic);

    await processWebhookJob(env.DB, job);

    expect(await eventsOfWebhook(job.webhookId)).toEqual([
      { name: "compliance_acknowledged", class: "lifecycle", metadata: { topic } },
    ]);
    expect(boundary.findOfflineSession).not.toHaveBeenCalled();
  },
);

describe.each([
  ["SHOP_UPDATE", "shop_updated", "lifecycle", { country_code: "IT", enabled: true }],
  ["APP_SUBSCRIPTIONS_UPDATE", "billing_updated", "billing", { reason: "active" }],
  ["APP_PURCHASES_ONE_TIME_UPDATE", "billing_updated", "billing", { reason: "active" }],
] as const)("riconcilia %s", (topic, name, eventClass, metadata) => {
  test("aggiorna lo stato tramite un contesto admin offline", async () => {
    shopify.addValidation(DEFAULT_CONFIG, true);
    shopify.state.subscriptions.push({
      id: `gid://shopify/AppSubscription/${crypto.randomUUID()}`,
      currentPeriodEnd: "2999-01-01T21:59:59Z",
    });
    const job = await claimedJob(topic);

    await processWebhookJob(env.DB, job);

    expect(boundary.admin).toHaveBeenCalledWith(shop);
    expect(shopify.callsTo("CfReadyContext").length).toBeGreaterThan(0);
    expect(await eventsOfWebhook(job.webhookId)).toEqual([{ name, class: eventClass, metadata }]);
    expect(await webhookStatus(job.webhookId)).toBe("processed");
  });
});

test.each([
  ["SHOP_UPDATE", "shop_update_skipped", "lifecycle"],
  ["APP_SUBSCRIPTIONS_UPDATE", "billing_update_skipped", "billing"],
] as const)("%s resta fail-open senza sessione offline", async (topic, name, eventClass) => {
  boundary.findOfflineSession.mockResolvedValue(undefined);
  const job = await claimedJob(topic);

  await processWebhookJob(env.DB, job);

  expect(boundary.admin).not.toHaveBeenCalled();
  expect(await eventsOfWebhook(job.webhookId)).toEqual([
    { name, class: eventClass, metadata: { error_code: "missing_admin_context" } },
  ]);
});

test("mantiene ritentabile una riconciliazione transitoria", async () => {
  // Il diritto scritto in Shopify non è più valido: serve una scrittura, ma la lease è occupata.
  shopify.addValidation(
    { ...DEFAULT_CONFIG, entitlement: { kind: "subscription", validThrough: "2999-01-01" } },
    true,
  );
  expect(await acquireValidationLock(env.DB, shop)).toEqual(expect.any(String));
  const job = await claimedJob("SHOP_UPDATE");

  await expect(processWebhookJob(env.DB, job)).rejects.toThrow("validation_locked");

  expect(await eventsOfWebhook(job.webhookId)).toEqual([]);
  expect(await webhookStatus(job.webhookId)).toBe("processing");
});

test("registra i dettagli operativi di SHOP_UPDATE", async () => {
  shopify.state.shop.shopAddress.countryCodeV2 = "FR";
  shopify.addValidation(DEFAULT_CONFIG, false);
  shopify.addValidation(DEFAULT_CONFIG, false);
  const job = await claimedJob("SHOP_UPDATE");

  await processWebhookJob(env.DB, job);

  expect(await eventsOfWebhook(job.webhookId)).toEqual([
    {
      name: "shop_updated",
      class: "lifecycle",
      metadata: { country_code: "FR", enabled: false, error_code: "duplicate_validations" },
    },
  ]);
});

test("registra i dettagli operativi di APP_SUBSCRIPTIONS_UPDATE", async () => {
  shopify.failNext("CfReadyBilling", new Error("Shopify non disponibile"));
  const job = await claimedJob("APP_SUBSCRIPTIONS_UPDATE");

  await processWebhookJob(env.DB, job);

  expect(await eventsOfWebhook(job.webhookId)).toEqual([
    {
      name: "billing_updated",
      class: "billing",
      metadata: { reason: "none", error_code: "billing_read_failed" },
    },
  ]);
});

test("rifiuta un topic non instradato mantenendo il claim ritentabile", async () => {
  const job = await claimedJob("UNKNOWN_TOPIC");

  await expect(processWebhookJob(env.DB, job)).rejects.toThrow("unsupported_webhook_topic");

  expect(await webhookStatus(job.webhookId)).toBe("processing");
});
