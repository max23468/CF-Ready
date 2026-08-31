import { expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import { createAppContext } from "../app/context.server";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  readAddress2Declaration: vi.fn(),
  readOnboarding: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("../app/shopify.server", () => ({
  authenticate: { admin: mocks.authenticate },
}));

vi.mock("../app/validation.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/validation.server")>()),
  readAddress2Declaration: mocks.readAddress2Declaration,
  readOnboarding: mocks.readOnboarding,
  reconcile: mocks.reconcile,
}));

test("l’Onboarding riusa lo snapshot Shopify combinato", async () => {
  const admin = { graphql: vi.fn() };
  const db = {} as D1Database;
  const shop = "onboarding-snapshot.example.myshopify.com";
  mocks.authenticate.mockResolvedValue({ admin, session: { shop } });
  mocks.reconcile.mockResolvedValue({
    validationEnabled: false,
    validation: {
      id: "gid://shopify/Validation/1",
      title: "CF Ready",
      enabled: false,
      blockOnFailure: false,
      shopifyFunction: { handle: "cf-ready-validation" },
      metafield: { jsonValue: DEFAULT_CONFIG },
    },
    entitlement: { kind: "none", validThrough: null },
    trial: null,
  });
  mocks.readOnboarding.mockResolvedValue({ status: "in_progress", step: 2 });
  mocks.readAddress2Declaration.mockResolvedValue(null);

  const { loader } = await import("../app/routes/app.onboarding");
  const result = await loader({
    request: new Request("https://example.test/app/onboarding?locale=it"),
    context: createAppContext(db),
    params: {},
  } as never);

  expect(result).toMatchObject({ step: 2, completed: false, entitled: false });
  expect(mocks.reconcile).toHaveBeenCalledWith(admin, db, shop, {
    prefetchBilling: true,
  });
});
