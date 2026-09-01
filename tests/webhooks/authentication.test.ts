import { expect, test, vi } from "vitest";
import type { WebhookValidation } from "@shopify/shopify-api";
import { authenticateWebhookRequest, MAX_WEBHOOK_BODY_BYTES } from "../../app/webhook-auth.server";

const validWebhook = () =>
  ({
    valid: true,
    webhookType: "webhooks",
    hmac: "firma",
    topic: "SHOP_UPDATE",
    domain: "shop.myshopify.com",
    apiVersion: "2026-07",
    webhookId: "wh-valid",
  }) as WebhookValidation;

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

test("rifiuta la lunghezza webhook dichiarata oltre il limite prima dell'HMAC", async () => {
  const validate = vi.fn(async () => validWebhook());
  const request = new Request("https://example.test/webhooks/shop/update", {
    method: "POST",
    headers: { "content-length": String(MAX_WEBHOOK_BODY_BYTES + 1) },
    body: "{}",
  });

  await expect(authenticateWebhookRequest(request, validate)).rejects.toMatchObject({
    status: 413,
  });
  expect(validate).not.toHaveBeenCalled();
});

test("rifiuta Content-Length non decimali prima dell'HMAC", async () => {
  const validate = vi.fn(async () => validWebhook());
  const request = new Request("https://example.test/webhooks/shop/update", {
    method: "POST",
    headers: { "content-length": "1e6" },
    body: "{}",
  });

  await expect(authenticateWebhookRequest(request, validate)).rejects.toMatchObject({
    status: 413,
  });
  expect(validate).not.toHaveBeenCalled();
});

test("interrompe e cancella uno stream webhook oltre il limite", async () => {
  const validate = vi.fn(async () => validWebhook());
  const cancel = vi.fn();
  let reads = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      reads += 1;
      if (reads <= 3) {
        controller.enqueue(new Uint8Array(1024 * 1024));
        return;
      }
      controller.close();
    },
    cancel,
  });
  const request = new Request("https://example.test/webhooks/shop/update", {
    method: "POST",
    body,
  });

  await expect(authenticateWebhookRequest(request, validate)).rejects.toMatchObject({
    status: 413,
  });
  expect(reads).toBe(3);
  expect(cancel).toHaveBeenCalledOnce();
  expect(validate).not.toHaveBeenCalled();
});

test("non si fida di un Content-Length inferiore al corpo effettivo", async () => {
  const validate = vi.fn(async () => validWebhook());
  const request = new Request("https://example.test/webhooks/shop/update", {
    method: "POST",
    headers: { "content-length": "2" },
    body: new Uint8Array(MAX_WEBHOOK_BODY_BYTES + 1),
  });

  await expect(authenticateWebhookRequest(request, validate)).rejects.toMatchObject({
    status: 413,
  });
  expect(validate).not.toHaveBeenCalled();
});

test("accetta il corpo esattamente al limite", async () => {
  const prefix = '{"value":"';
  const suffix = '"}';
  const rawBody = `${prefix}${"a".repeat(MAX_WEBHOOK_BODY_BYTES - prefix.length - suffix.length)}${suffix}`;
  const validate = vi.fn(async ({ rawBody: received }: { rawBody: string }) => {
    expect(received).toBe(rawBody);
    return validWebhook();
  });

  await expect(
    authenticateWebhookRequest(
      new Request("https://example.test/webhooks/shop/update", {
        method: "POST",
        body: rawBody,
      }),
      validate,
    ),
  ).resolves.toMatchObject({ payload: { value: expect.any(String) } });
  expect(validate).toHaveBeenCalledOnce();
});

test("preserva UTF-8 diviso tra chunk e non impone un media type", async () => {
  const rawBody = '{"name":"caffè"}';
  const bytes = new TextEncoder().encode(rawBody);
  const split = bytes.indexOf(0xc3) + 1;
  const validate = vi.fn(async ({ rawBody: received }: { rawBody: string }) => {
    expect(received).toBe(rawBody);
    return validWebhook();
  });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, split));
      controller.enqueue(bytes.slice(split));
      controller.close();
    },
  });

  await expect(
    authenticateWebhookRequest(
      new Request("https://example.test/webhooks/shop/update", { method: "POST", body }),
      validate,
    ),
  ).resolves.toMatchObject({ payload: { name: "caffè" } });
});

test("rifiuta metodi diversi da POST prima di leggere il corpo", async () => {
  const validate = vi.fn(async () => validWebhook());

  await expect(
    authenticateWebhookRequest(new Request("https://example.test/webhooks"), validate),
  ).rejects.toMatchObject({ status: 405 });
  expect(validate).not.toHaveBeenCalled();
});

test("valida anche un corpo assente e poi rifiuta il payload incompleto", async () => {
  const validate = vi.fn(async () => validWebhook());

  await expect(
    authenticateWebhookRequest(
      new Request("https://example.test/webhooks", { method: "POST" }),
      validate,
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(validate).toHaveBeenCalledWith(expect.objectContaining({ rawBody: "" }));
});

test("rifiuta una validazione non HMAC non valida con Bad Request", async () => {
  const validate = vi.fn(async () => ({
    valid: false,
    reason: "missing_header",
  })) as unknown as Parameters<typeof authenticateWebhookRequest>[1];

  await expect(
    authenticateWebhookRequest(
      new Request("https://example.test/webhooks", { method: "POST", body: "{}" }),
      validate,
    ),
  ).rejects.toMatchObject({ status: 400, statusText: "Bad Request" });
});

test.each(["null", "[]", "42", '"testo"'])(
  "rifiuta il payload JSON non oggetto %s",
  async (body) => {
    await expect(
      authenticateWebhookRequest(
        new Request("https://example.test/webhooks", { method: "POST", body }),
        vi.fn(async () => validWebhook()),
      ),
    ).rejects.toMatchObject({ status: 400 });
  },
);

test("ignora in sicurezza un errore durante la cancellazione dello stream sovradimensionato", async () => {
  const validate = vi.fn(async () => validWebhook());
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_WEBHOOK_BODY_BYTES + 1));
    },
    cancel() {
      throw new Error("cancel_failed");
    },
  });

  await expect(
    authenticateWebhookRequest(
      new Request("https://example.test/webhooks", { method: "POST", body }),
      validate,
    ),
  ).rejects.toMatchObject({ status: 413 });
  expect(validate).not.toHaveBeenCalled();
});
