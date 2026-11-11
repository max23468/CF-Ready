import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import { processWebhookJob } from "../app/webhooks/webhook-jobs.server";
import { claimWebhook } from "../app/webhooks/webhook-ingress.server";
import { insertShop } from "./support/lifecycle";

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
}));

vi.mock("../app/shopify.server", () => ({
  findOfflineSession: vi.fn(async () => ({ isOnline: false })),
  unauthenticated: { admin: vi.fn(async () => ({ admin: {} })) },
}));

vi.mock("../app/validation/reconcile.server", () => ({ reconcile: mocks.reconcile }));

test.each(["validation_locked", "duplicate_validations_active"])(
  "l'errore transitorio %s lascia il webhook ritentabile",
  async (errorCode) => {
    const shop = await insertShop(`webhook-${errorCode}.example.myshopify.com`);
    const webhookId = `wh-${errorCode}`;
    const claim = await claimWebhook(env.DB, webhookId, "SHOP_UPDATE", shop);
    if (!claim.acquired) throw new Error("claim non acquisito");
    mocks.reconcile.mockResolvedValue({ errorCode, retryable: true });

    await expect(
      processWebhookJob(env.DB, { webhookId, claimToken: claim.token, shop }),
    ).rejects.toThrow(errorCode);
    expect(
      await env.DB.prepare("SELECT status FROM webhook_events WHERE webhook_id = ?")
        .bind(webhookId)
        .first(),
    ).toMatchObject({ status: "processing" });
  },
);

// La riconciliazione reale accompagna ogni retry con un codice: il ripiego protegge da un
// esito futuro senza codice e si raggiunge solo simulandolo.
test("usa un codice stabile quando il retry non ne espone uno", async () => {
  const shop = await insertShop("webhook-senza-codice.example.myshopify.com");
  const webhookId = "wh-senza-codice";
  const claim = await claimWebhook(env.DB, webhookId, "APP_SUBSCRIPTIONS_UPDATE", shop);
  if (!claim.acquired) throw new Error("claim non acquisito");
  mocks.reconcile.mockResolvedValue({ retryable: true });

  await expect(
    processWebhookJob(env.DB, { webhookId, claimToken: claim.token, shop }),
  ).rejects.toThrow("reconciliation_retryable");
});

test("un errore operativo non ritentabile completa il webhook", async () => {
  const shop = await insertShop("webhook-operativo.example.myshopify.com");
  const webhookId = "wh-operativo";
  const claim = await claimWebhook(env.DB, webhookId, "SHOP_UPDATE", shop);
  if (!claim.acquired) throw new Error("claim non acquisito");
  mocks.reconcile.mockResolvedValue({ errorCode: "billing_read_failed", retryable: false });

  await expect(
    processWebhookJob(env.DB, { webhookId, claimToken: claim.token, shop }),
  ).resolves.toBeUndefined();
  expect(
    await env.DB.prepare("SELECT status FROM webhook_events WHERE webhook_id = ?")
      .bind(webhookId)
      .first(),
  ).toMatchObject({ status: "processed" });
});
