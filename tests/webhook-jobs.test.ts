import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import { processWebhookJob } from "../app/webhook-jobs.server";
import { claimWebhook } from "../app/webhooks.server";

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
}));

vi.mock("../app/shopify.server", () => ({
  sessionStorage: { findSessionsByShop: vi.fn(async () => [{ isOnline: false }]) },
  unauthenticated: { admin: vi.fn(async () => ({ admin: {} })) },
}));

vi.mock("../app/validation.server", () => ({ reconcile: mocks.reconcile }));

test("una lease Validation occupata lascia il webhook ritentabile", async () => {
  const shop = "webhook-validation-locked.example.myshopify.com";
  const webhookId = "wh-validation-locked";
  await env.DB.prepare(
    `INSERT INTO shops (shop_domain, installation_status, installed_at, created_at, updated_at)
     VALUES (?, 'active', '2026-08-01', '2026-08-01', '2026-08-01')`,
  )
    .bind(shop)
    .run();
  const claim = await claimWebhook(env.DB, webhookId, "SHOP_UPDATE", shop);
  if (!claim.acquired) throw new Error("claim non acquisito");
  mocks.reconcile.mockResolvedValue({ errorCode: "validation_locked" });

  await expect(
    processWebhookJob(env.DB, { webhookId, claimToken: claim.token, shop }),
  ).rejects.toThrow("validation_locked");
  expect(
    await env.DB.prepare("SELECT status FROM webhook_events WHERE webhook_id = ?")
      .bind(webhookId)
      .first(),
  ).toMatchObject({ status: "processing" });
});
