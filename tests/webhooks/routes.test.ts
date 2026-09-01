import { beforeEach, describe, expect, test, vi } from "vitest";
import { databaseContext, webhookQueueContext } from "../../app/context.server";

const mocks = vi.hoisted(() => ({
  authenticateWebhook: vi.fn(),
  handleWebhook: vi.fn(),
}));

vi.mock("../../app/shopify.server", () => ({
  authenticateWebhook: mocks.authenticateWebhook,
}));
vi.mock("../../app/webhooks.server", () => ({ handleWebhook: mocks.handleWebhook }));

import { action as billingAction } from "../../app/routes/webhooks.app.billing";
import { action as scopesAction } from "../../app/routes/webhooks.app.scopes_update";
import { action as uninstalledAction } from "../../app/routes/webhooks.app.uninstalled";
import { action as complianceAction } from "../../app/routes/webhooks.compliance";
import { action as shopUpdateAction } from "../../app/routes/webhooks.shop.update";

const db = {} as D1Database;
const queue = {} as Queue;
const request = new Request("https://example.test/webhooks", { method: "POST" });
const context = {
  get: vi.fn((token: unknown) => {
    if (token === databaseContext) return db;
    if (token === webhookQueueContext) return queue;
    return undefined;
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateWebhook.mockResolvedValue({
    webhookId: "wh-route",
    topic: "SHOP_UPDATE",
    shop: "route.myshopify.com",
    payload: {},
  });
  mocks.handleWebhook.mockResolvedValue(new Response(null, { status: 200 }));
});

describe.each([
  ["billing", billingAction],
  ["disinstallazione", uninstalledAction],
  ["compliance", complianceAction],
  ["aggiornamento shop", shopUpdateAction],
] as const)("route webhook %s", (_name, action) => {
  test("autentica e inoltra la consegna alla coda", async () => {
    const response = await action({ request, context } as never);

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

  const response = await scopesAction({ request, context } as never);

  expect(response.status).toBe(200);
  expect(mocks.handleWebhook).toHaveBeenCalledWith(
    db,
    expect.objectContaining({ webhookId: "wh-scopes" }),
    queue,
    { currentScopes: expected },
  );
});
