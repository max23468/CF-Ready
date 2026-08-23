import { expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import { createAppContext } from "../app/context.server";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  readHomeState: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("../app/shopify.server", () => ({
  authenticate: { admin: mocks.authenticate },
}));

vi.mock("../app/validation.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/validation.server")>()),
  readHomeState: mocks.readHomeState,
  reconcile: mocks.reconcile,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("la Home legge lo stato D1 in parallelo ed espone timing senza dati merchant", async () => {
  const db = {} as D1Database;
  const shop = "timing.example.myshopify.com";
  const homeState = deferred<{
    onboarding: {
      status: "not_started";
      step: number;
      errorCode: null;
      validationEnabled: boolean;
    };
    address2Declaration: string | null;
    enabledSince: string | null;
  }>();
  const reconciliation = deferred<{
    shopName: string;
    countryCode: string;
    today: string;
    eligible: boolean;
    validation: { metafield: { jsonValue: typeof DEFAULT_CONFIG } };
    validationEnabled: boolean;
    trial: null;
    account: null;
    entitlement: { kind: "none"; validThrough: null };
    creditEstimate: null;
    errorCode: null;
  }>();

  mocks.authenticate.mockResolvedValue({ admin: {}, session: { shop } });
  mocks.reconcile.mockImplementation(
    async (
      _admin: unknown,
      _db: D1Database,
      _shop: string,
      options: {
        prefetchBilling?: boolean;
        reportTiming: (name: "shopify_snapshot", durationMs: number) => void;
      },
    ) => {
      expect(options.prefetchBilling).toBe(true);
      options.reportTiming("shopify_snapshot", 12.34);
      return reconciliation.promise;
    },
  );
  mocks.readHomeState.mockReturnValue(homeState.promise);

  const { headers, loader } = await import("../app/routes/app._index");
  const pending = loader({
    request: new Request("https://example.test/app?locale=it"),
    context: createAppContext(db),
    params: {},
  } as never);

  await vi.waitFor(() => {
    expect(mocks.readHomeState).toHaveBeenCalledOnce();
    expect(mocks.readHomeState).toHaveBeenCalledWith(db, shop);
  });

  reconciliation.resolve({
    shopName: "Negozio di prova",
    countryCode: "IT",
    today: "2026-08-05",
    eligible: true,
    validation: {
      metafield: { jsonValue: DEFAULT_CONFIG },
    },
    validationEnabled: false,
    trial: null,
    account: null,
    entitlement: { kind: "none", validThrough: null },
    creditEstimate: null,
    errorCode: null,
  });
  homeState.resolve({
    onboarding: {
      status: "not_started",
      step: 1,
      errorCode: null,
      validationEnabled: false,
    },
    address2Declaration: null,
    enabledSince: null,
  });

  const result = await pending;
  const serverTiming = new Headers(result.init?.headers).get("Server-Timing");
  const parentHeaders = new Headers({ "X-Shopify-Test": "preserved" });
  const documentHeaders = new Headers(
    headers({ loaderHeaders: new Headers(result.init?.headers), parentHeaders } as never),
  );

  expect(result.data).toMatchObject({ onboarding: "not_started", address2Declared: false });
  expect(serverTiming).toContain("shopify_snapshot;dur=12.3");
  expect(serverTiming).toContain("d1_home;dur=");
  expect(serverTiming).toContain("total;dur=");
  expect(serverTiming).not.toContain(shop);
  expect(documentHeaders.get("Server-Timing")).toBe(serverTiming);
  expect(documentHeaders.get("X-Shopify-Test")).toBe("preserved");
});
