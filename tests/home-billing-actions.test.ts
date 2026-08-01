import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  cancelSubscription: vi.fn(),
  readBilling: vi.fn(),
  recordEvent: vi.fn(),
  withValidationLock: vi.fn(),
}));

vi.mock("../app/shopify.server", () => ({
  authenticate: { admin: mocks.authenticate },
}));

vi.mock("../app/billing.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/billing.server")>()),
  cancelSubscription: mocks.cancelSubscription,
  readBilling: mocks.readBilling,
}));

vi.mock("../app/events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/events.server")>()),
  recordEvent: mocks.recordEvent,
}));

vi.mock("../app/validation.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/validation.server")>()),
  withValidationLock: mocks.withValidationLock,
}));

test("la cancellazione non compete con un acquisto una tantum pendente", async () => {
  const admin = {};
  const db = {};
  mocks.authenticate.mockResolvedValue({
    admin,
    session: { shop: "example.myshopify.com" },
  });
  mocks.readBilling.mockResolvedValue({
    subscription: { id: "gid://shopify/AppSubscription/1" },
    oneTime: null,
    pendingOneTime: true,
  });
  mocks.withValidationLock.mockImplementation(
    async (_db: D1Database, _shop: string, operation: () => Promise<unknown>) => ({
      acquired: true,
      result: await operation(),
    }),
  );

  const { action } = await import("../app/routes/app._index");
  const result = await action({
    request: new Request("https://example.test/app", {
      method: "POST",
      body: new URLSearchParams({ intent: "cancel" }),
    }),
    context: { cloudflare: { env: { DB: db } } },
    params: {},
  } as never);

  expect(result).toEqual({ ok: false, errorCode: "charge_pending" });
  expect(mocks.withValidationLock).toHaveBeenCalledWith(
    db,
    "example.myshopify.com",
    expect.any(Function),
  );
  expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  expect(mocks.recordEvent).not.toHaveBeenCalled();
});
