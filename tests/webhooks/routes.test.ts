import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateWebhook: vi.fn(),
  handleWebhook: vi.fn(),
  first: vi.fn(),
}));

vi.mock("../../app/shopify-webhook.server", () => ({
  authenticateWebhook: mocks.authenticateWebhook,
}));
vi.mock("../../app/webhook-ingress.server", () => ({ handleWebhook: mocks.handleWebhook }));

import { handleWebhookRequest } from "../../app/webhook-request.server";

const db = {
  prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first: mocks.first })) })),
} as unknown as D1Database;
const queue = {} as Queue;
const request = new Request("https://example.test/webhooks", { method: "POST" });

const callWebhook = (pathname: string) => handleWebhookRequest(pathname, request, db, queue);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.first.mockResolvedValue(null);
  mocks.authenticateWebhook.mockResolvedValue({
    webhookId: "wh-route",
    topic: "SHOP_UPDATE",
    shop: "route.myshopify.com",
    payload: {},
  });
  mocks.handleWebhook.mockResolvedValue(new Response(null, { status: 200 }));
});

test("non accoda gli aggiornamenti shop che conservano il Paese osservato", async () => {
  mocks.authenticateWebhook.mockResolvedValue({
    webhookId: "wh-country-unchanged",
    topic: "SHOP_UPDATE",
    shop: "unchanged.myshopify.com",
    payload: { country_code: "GB" },
  });
  mocks.first.mockResolvedValue({ 1: 1 });

  const response = await callWebhook("/webhooks/shop/update");

  expect(response.status).toBe(200);
  expect(db.prepare).toHaveBeenCalledWith(
    "SELECT 1 FROM shops WHERE shop_domain = ? AND country_code = ?",
  );
  expect(mocks.handleWebhook).not.toHaveBeenCalled();
});

test("riconosce senza D1 gli update ripetuti con il Paese già confermato", async () => {
  vi.useFakeTimers();
  try {
    mocks.authenticateWebhook.mockResolvedValue({
      webhookId: "wh-country-repeated",
      topic: "SHOP_UPDATE",
      shop: "repeated.myshopify.com",
      payload: { country_code: "GB" },
    });
    mocks.first.mockResolvedValue({ 1: 1 });

    expect((await callWebhook("/webhooks/shop/update")).status).toBe(200);
    vi.advanceTimersByTime(9 * 60 * 1000);
    const repeated = await callWebhook("/webhooks/shop/update");

    expect(repeated.status).toBe(200);
    expect(db.prepare).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60 * 1000);
    await callWebhook("/webhooks/shop/update");
    expect(db.prepare).toHaveBeenCalledTimes(2);

    mocks.first.mockResolvedValue(null);
    mocks.authenticateWebhook.mockResolvedValue({
      webhookId: "wh-country-moved",
      topic: "SHOP_UPDATE",
      shop: "repeated.myshopify.com",
      payload: { country_code: "IT" },
    });
    await callWebhook("/webhooks/shop/update");
    expect(mocks.handleWebhook).toHaveBeenCalledTimes(1);

    // Dopo un Paese diverso la conferma precedente non vale più, anche se non è scaduta.
    mocks.authenticateWebhook.mockResolvedValue({
      webhookId: "wh-country-back",
      topic: "SHOP_UPDATE",
      shop: "repeated.myshopify.com",
      payload: { country_code: "GB" },
    });
    await callWebhook("/webhooks/shop/update");
    expect(db.prepare).toHaveBeenCalledTimes(4);
  } finally {
    vi.useRealTimers();
  }
});

test("accoda gli aggiornamenti shop quando cambia il Paese osservato", async () => {
  mocks.authenticateWebhook.mockResolvedValue({
    webhookId: "wh-country-changed",
    topic: "SHOP_UPDATE",
    shop: "changed.myshopify.com",
    payload: { country_code: "IT" },
  });

  const response = await callWebhook("/webhooks/shop/update");

  expect(response.status).toBe(200);
  expect(mocks.handleWebhook).toHaveBeenCalledWith(
    db,
    expect.objectContaining({ webhookId: "wh-country-changed" }),
    queue,
  );
});

describe.each([
  ["billing", "/webhooks/app/billing"],
  ["disinstallazione", "/webhooks/app/uninstalled"],
  ["compliance", "/webhooks/compliance"],
  ["aggiornamento shop", "/webhooks/shop/update"],
] as const)("route webhook %s", (_name, pathname) => {
  test("autentica e inoltra la consegna alla coda", async () => {
    const response = await callWebhook(pathname);

    expect(response.status).toBe(200);
    expect(mocks.authenticateWebhook).toHaveBeenCalledWith(request);
    expect(mocks.handleWebhook).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ webhookId: "wh-route" }),
      queue,
    );
  });
});

test.each([
  [
    ["read_products", 42, "write_products"],
    ["read_products", "write_products"],
  ],
  ["read_products", []],
] as const)("normalizza gli scope correnti %j", async (current, expected) => {
  mocks.authenticateWebhook.mockResolvedValue({
    webhookId: "wh-scopes",
    topic: "APP_SCOPES_UPDATE",
    shop: "scopes.myshopify.com",
    payload: { current },
  });

  const response = await callWebhook("/webhooks/app/scopes_update");

  expect(response.status).toBe(200);
  expect(mocks.handleWebhook).toHaveBeenCalledWith(
    db,
    expect.objectContaining({ webhookId: "wh-scopes" }),
    queue,
    { currentScopes: expected },
  );
});
