import { expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  observedConfigHash: vi.fn(),
  readAddress2Declaration: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("../app/shopify.server", () => ({
  authenticate: { admin: mocks.authenticate },
}));

vi.mock("../app/validation.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/validation.server")>()),
  observedConfigHash: mocks.observedConfigHash,
  readAddress2Declaration: mocks.readAddress2Declaration,
  reconcile: mocks.reconcile,
}));

test("la pagina Regole carica l’entitlement autorevole per l’anteprima", async () => {
  const admin = { graphql: vi.fn() };
  const db = {};
  mocks.authenticate.mockResolvedValue({ admin, session: { shop: "example.myshopify.com" } });
  mocks.reconcile.mockResolvedValue({
    validationEnabled: true,
    validation: {
      id: "gid://shopify/Validation/1",
      title: "CF Ready",
      enabled: true,
      blockOnFailure: false,
      shopifyFunction: { handle: "cf-ready-validation" },
      metafield: { jsonValue: DEFAULT_CONFIG },
    },
    entitlement: { kind: "none", validThrough: null },
  });
  mocks.observedConfigHash.mockResolvedValue("hash");
  mocks.readAddress2Declaration.mockResolvedValue(null);

  const { loader } = await import("../app/routes/app.rules");
  const result = await loader({
    request: new Request("https://example.test/app/rules?locale=it"),
    context: { cloudflare: { env: { DB: db } } },
    params: {},
  } as never);

  expect(result).toMatchObject({ enabled: true, entitled: false });
  expect(mocks.reconcile).toHaveBeenCalledWith(admin, db, "example.myshopify.com");
});
