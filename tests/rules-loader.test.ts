import { expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import { createAppContext } from "../app/context.server";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  observedConfigHash: vi.fn(),
  readConfigurationHistory: vi.fn(async () => []),
  readAddress2Declaration: vi.fn(),
  readCheckoutLabelState: vi.fn(),
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
vi.mock("../app/checkout-labels/repository.server", () => ({
  readCheckoutLabelState: mocks.readCheckoutLabelState,
  saveAddress2FormMode: vi.fn(),
}));
vi.mock("../app/configuration-history.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/configuration-history.server")>()),
  readConfigurationHistory: mocks.readConfigurationHistory,
}));

test("la pagina Regole carica l’entitlement autorevole per l’anteprima", async () => {
  const admin = { graphql: vi.fn() };
  const db = {};
  mocks.authenticate.mockResolvedValue({
    admin,
    session: { shop: "example.myshopify.com" },
    scopes: { query: vi.fn(async () => ({ granted: [] })) },
  });
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
  mocks.readCheckoutLabelState.mockResolvedValue({
    mode: "off",
    address2Classification: "unknown",
  });

  const { headers, loader } = await import("../app/routes/app.rules");
  const result = await loader({
    request: new Request("https://example.test/app/rules?locale=it"),
    context: createAppContext(db as D1Database),
    params: {},
  } as never);

  expect(result.data).toMatchObject({ enabled: true, entitled: false });
  const serverTiming = new Headers(result.init?.headers).get("Server-Timing");
  expect(serverTiming).toMatch(/auth;dur=/);
  expect(serverTiming).toMatch(/d1_validation_state;dur=/);
  expect(serverTiming).toMatch(/d1_configuration_history;dur=/);
  expect(serverTiming).toMatch(/total;dur=/);
  expect(
    new Headers(
      headers({
        loaderHeaders: new Headers(result.init?.headers),
        parentHeaders: new Headers(),
      } as never),
    ).get("Server-Timing"),
  ).toBe(new Headers(result.init?.headers).get("Server-Timing"));
  expect(mocks.reconcile).toHaveBeenCalledWith(
    admin,
    db,
    "example.myshopify.com",
    expect.objectContaining({ prefetchBilling: true, reportTiming: expect.any(Function) }),
  );
});

test("la pagina Regole segnala la configurazione indeterminata dei duplicati", async () => {
  mocks.reconcile.mockResolvedValue({
    validationEnabled: true,
    validation: undefined,
    entitlement: { kind: "trial", validThrough: "2026-08-12" },
    errorCode: "duplicate_validations_active",
  });
  mocks.observedConfigHash.mockResolvedValue(null);
  mocks.readAddress2Declaration.mockResolvedValue(null);

  const { loader } = await import("../app/routes/app.rules");
  const result = await loader({
    request: new Request("https://example.test/app/rules?locale=it"),
    context: createAppContext({} as D1Database),
    params: {},
  } as never);

  expect(result.data.duplicateError).toBe("duplicate_validations_active");
});
