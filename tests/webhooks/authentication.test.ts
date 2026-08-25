import { expect, test, vi } from "vitest";
import type { WebhookValidation } from "@shopify/shopify-api";
import { authenticateWebhookRequest } from "../../app/webhook-auth.server";

test("autentica una disinstallazione senza leggere o rinnovare la sessione dello store", async () => {
  const rawBody = JSON.stringify({ id: 123 });
  const validate = vi.fn(async ({ rawBody: received }: { rawBody: string }) => {
    expect(received).toBe(rawBody);
    return {
      valid: true,
      webhookType: "webhooks",
      hmac: "firma",
      topic: "APP_UNINSTALLED",
      domain: "revoked-session.myshopify.com",
      apiVersion: "2026-07",
      webhookId: "wh-revoked-session",
      triggeredAt: "2026-08-20T10:00:00.000Z",
    } as WebhookValidation;
  });

  const webhook = await authenticateWebhookRequest(
    new Request("https://example.test/webhooks/app/uninstalled", {
      method: "POST",
      body: rawBody,
    }),
    validate,
  );

  expect(validate).toHaveBeenCalledOnce();
  expect(webhook).toEqual({
    webhookId: "wh-revoked-session",
    topic: "APP_UNINSTALLED",
    shop: "revoked-session.myshopify.com",
    triggeredAt: "2026-08-20T10:00:00.000Z",
    payload: { id: 123 },
  });
});

test("rifiuta HMAC non valido e payload non JSON", async () => {
  const invalidHmac = vi.fn(async () => ({
    valid: false,
    reason: "invalid_hmac",
  })) as unknown as Parameters<typeof authenticateWebhookRequest>[1];
  await expect(
    authenticateWebhookRequest(
      new Request("https://example.test/webhooks/compliance", { method: "POST", body: "{}" }),
      invalidHmac,
    ),
  ).rejects.toMatchObject({ status: 401 });

  const valid = vi.fn(async () => ({
    valid: true,
    webhookType: "webhooks",
    hmac: "firma",
    topic: "SHOP_REDACT",
    domain: "shop.myshopify.com",
    apiVersion: "2026-07",
    webhookId: "wh-invalid-json",
  })) as unknown as Parameters<typeof authenticateWebhookRequest>[1];
  await expect(
    authenticateWebhookRequest(
      new Request("https://example.test/webhooks/compliance", {
        method: "POST",
        body: "not-json",
      }),
      valid,
    ),
  ).rejects.toMatchObject({ status: 400 });
});
