import { beforeEach, expect, test, vi } from "vitest";
import { createAppContext } from "../app/context.server";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  queryContext: vi.fn(),
  startTrial: vi.fn(),
}));

vi.mock("../app/shopify.server", () => ({
  authenticate: { admin: mocks.authenticate },
}));

vi.mock("../app/billing.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/billing.server")>()),
  startTrial: mocks.startTrial,
}));

vi.mock("../app/validation.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/validation.server")>()),
  queryContext: mocks.queryContext,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({
    admin: {},
    session: { shop: "example.myshopify.com" },
  });
  mocks.queryContext.mockResolvedValue({
    shop: { shopAddress: { countryCodeV2: "IT" }, ianaTimezone: "Europe/Rome" },
  });
  mocks.startTrial.mockResolvedValue({ status: "expired" });
});

const request = () =>
  new Request("https://example.test/app", {
    method: "POST",
    body: new URLSearchParams({ intent: "start_trial" }),
  });

test.each([
  ["Home", () => import("../app/routes/app._index")],
  ["onboarding", () => import("../app/routes/app.onboarding")],
])("%s non dichiara avviata una prova già consumata", async (_name, route) => {
  const { action } = await route();
  const result = await action({
    request: request(),
    context: createAppContext({} as D1Database),
    params: {},
  } as never);

  expect(result).toEqual({ ok: false, errorCode: "trial_unavailable" });
});
