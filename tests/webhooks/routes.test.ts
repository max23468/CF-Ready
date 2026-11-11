import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateWebhook: vi.fn(),
  handleWebhook: vi.fn(),
  first: vi.fn(),
}));

vi.mock("../../app/webhooks/shopify-webhook.server", () => ({
  authenticateWebhook: mocks.authenticateWebhook,
}));
vi.mock("../../app/webhooks/webhook-ingress.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../app/webhooks/webhook-ingress.server")>()),
  handleWebhook: mocks.handleWebhook,
}));
vi.mock("../../app/shopify.server", () => ({ sessionStorage: {}, unauthenticated: {} }));

import productionManifest from "../../shopify.app.toml?raw";
import developmentManifest from "../../shopify.app.dev.toml?raw";
import { TOPIC_HANDLERS } from "../../app/webhooks/webhook-jobs.server";
import { handleWebhookRequest, WEBHOOK_PATHS } from "../../app/webhooks/webhook-request.server";
import { insertShop } from "../support/lifecycle";

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

test("non accoda gli aggiornamenti shop che conservano il Paese salvato in D1", async () => {
  const shop = await insertShop("unchanged.myshopify.com");
  await env.DB.prepare("UPDATE shops SET country_code = 'GB' WHERE shop_domain = ?")
    .bind(shop)
    .run();
  const deliver = (country_code: string) => {
    mocks.authenticateWebhook.mockResolvedValue({
      webhookId: `wh-country-${country_code}`,
      topic: "SHOP_UPDATE",
      shop,
      payload: { country_code },
    });
    return handleWebhookRequest("/webhooks/shop/update", request, env.DB, queue);
  };

  expect((await deliver("IT")).status).toBe(200);
  expect(mocks.handleWebhook).toHaveBeenCalledTimes(1);

  expect((await deliver("GB")).status).toBe(200);
  expect(mocks.handleWebhook).toHaveBeenCalledTimes(1);
});

test.each([{}, { country_code: "IT" }, { country_code: "GB" }])(
  "riconosce gli update dello store configurato senza D1 né coda: %j",
  async (payload) => {
    mocks.authenticateWebhook.mockResolvedValue({
      webhookId: "wh-ack-only",
      topic: "SHOP_UPDATE",
      shop: "route.myshopify.com",
      payload,
    });
    const response = await handleWebhookRequest(
      "/webhooks/shop/update",
      request,
      db,
      undefined,
      "route.myshopify.com",
    );
    expect(response.status).toBe(200);
    expect(mocks.authenticateWebhook).toHaveBeenCalledWith(request);
    expect(db.prepare).not.toHaveBeenCalled();
    expect(mocks.handleWebhook).not.toHaveBeenCalled();
  },
);

test("l'eccezione non riconosce una consegna non autenticata", async () => {
  const unauthorized = new Response(null, { status: 401 });
  mocks.authenticateWebhook.mockRejectedValueOnce(unauthorized);
  await expect(
    handleWebhookRequest("/webhooks/shop/update", request, db, queue, "route.myshopify.com"),
  ).rejects.toBe(unauthorized);
  expect(db.prepare).not.toHaveBeenCalled();
  expect(mocks.handleWebhook).not.toHaveBeenCalled();
});

test.each([
  ["/webhooks/shop/update", "other.myshopify.com", "SHOP_UPDATE"],
  ["/webhooks/app/uninstalled", "route.myshopify.com", "APP_UNINSTALLED"],
  ["/webhooks/app/billing", "route.myshopify.com", "APP_SUBSCRIPTIONS_UPDATE"],
  ["/webhooks/compliance", "route.myshopify.com", "SHOP_REDACT"],
  ["/webhooks/compliance", "route.myshopify.com", "SHOP_UPDATE"],
  ["/webhooks/shop/update", "route.myshopify.com", "APP_UNINSTALLED"],
])("non applica l'eccezione a %s / %s / %s", async (pathname, shop, topic) => {
  mocks.authenticateWebhook.mockResolvedValue({ webhookId: "wh-other", topic, shop, payload: {} });
  await handleWebhookRequest(pathname, request, db, queue, "route.myshopify.com");
  expect(mocks.handleWebhook).toHaveBeenCalledWith(
    db,
    expect.objectContaining({ webhookId: "wh-other" }),
    queue,
  );
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
    expect(mocks.handleWebhook).not.toHaveBeenCalled();

    // Finché la conferma vale, D1 non viene consultato: il suo nuovo esito resta invisibile.
    mocks.first.mockResolvedValue(null);
    vi.advanceTimersByTime(9 * 60 * 1000);
    expect((await callWebhook("/webhooks/shop/update")).status).toBe(200);
    expect(mocks.handleWebhook).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60 * 1000);
    await callWebhook("/webhooks/shop/update");
    expect(mocks.handleWebhook).toHaveBeenCalledTimes(1);

    mocks.first.mockResolvedValue({ 1: 1 });
    await callWebhook("/webhooks/shop/update");
    expect(mocks.handleWebhook).toHaveBeenCalledTimes(1);

    mocks.first.mockResolvedValue(null);
    mocks.authenticateWebhook.mockResolvedValue({
      webhookId: "wh-country-moved",
      topic: "SHOP_UPDATE",
      shop: "repeated.myshopify.com",
      payload: { country_code: "IT" },
    });
    await callWebhook("/webhooks/shop/update");
    expect(mocks.handleWebhook).toHaveBeenCalledTimes(2);

    // Dopo un Paese diverso la conferma precedente non vale più, anche se non è scaduta.
    mocks.authenticateWebhook.mockResolvedValue({
      webhookId: "wh-country-back",
      topic: "SHOP_UPDATE",
      shop: "repeated.myshopify.com",
      payload: { country_code: "GB" },
    });
    await callWebhook("/webhooks/shop/update");
    expect(mocks.handleWebhook).toHaveBeenCalledTimes(3);
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
  [["read_products", 42, "write_products"], { currentScopes: ["read_products", "write_products"] }],
  // Senza elenco il job non riceve scope e non riscrive la sessione.
  ["read_products", {}],
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
    expected,
  );
});

test("un ordine creato passa in coda soltanto il proprio ID", async () => {
  mocks.authenticateWebhook.mockResolvedValue({
    webhookId: "wh-order",
    topic: "ORDERS_CREATE",
    shop: "route.myshopify.com",
    payload: { admin_graphql_api_id: "gid://shopify/Order/1", email: "cliente@example.com" },
  });

  const response = await callWebhook("/webhooks/orders/create");

  expect(response.status).toBe(200);
  expect(mocks.handleWebhook).toHaveBeenCalledWith(
    db,
    expect.objectContaining({ webhookId: "wh-order" }),
    queue,
    { orderId: "gid://shopify/Order/1" },
  );
});

describe.each([
  ["shopify.app.toml", productionManifest],
  ["shopify.app.dev.toml", developmentManifest],
])("sottoscrizioni di %s", (_name, manifest) => {
  const subscriptions = manifest
    .split("[[webhooks.subscriptions]]")
    .slice(1)
    .map((entry) => {
      const block = entry.split(/^\[/m)[0];
      return {
        path: new URL(/uri = "([^"]+)"/.exec(block)?.[1] ?? "").pathname,
        // Il manifest scrive `app/uninstalled`, l'autenticazione Shopify restituisce APP_UNINSTALLED.
        topics: [...block.matchAll(/topics = \[([^\]]*)\]/g)].flatMap(([, list]) =>
          [...list.matchAll(/"([^"]+)"/g)].map(([, topic]) =>
            topic.toUpperCase().replaceAll("/", "_"),
          ),
        ),
      };
    });

  test("ogni URI ha una route webhook", () => {
    expect(subscriptions).toHaveLength(5);
    for (const { path } of subscriptions) expect(WEBHOOK_PATHS).toContain(path);
  });

  test("ogni topic ha un handler", () => {
    const topics = subscriptions.flatMap(({ topics }) => topics);
    expect(topics).toHaveLength(8);
    for (const topic of topics) expect([...TOPIC_HANDLERS.keys()]).toContain(topic);
  });
});

test("un ordine senza ID valido si accoda senza dettagli", async () => {
  mocks.authenticateWebhook.mockResolvedValue({
    webhookId: "wh-order-missing",
    topic: "ORDERS_CREATE",
    shop: "route.myshopify.com",
    payload: { admin_graphql_api_id: 1 },
  });

  await callWebhook("/webhooks/orders/create");

  expect(mocks.handleWebhook).toHaveBeenCalledWith(db, expect.anything(), queue, {});
});
