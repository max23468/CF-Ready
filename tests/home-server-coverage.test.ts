import { beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import { createAppContext } from "../app/context.server";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  authenticate: vi.fn(),
  cancelSubscription: vi.fn(),
  completeOnboardingAutomatically: vi.fn(),
  createCharge: vi.fn(),
  dismissMerchantCheckIn: vi.fn(),
  persistShopDisplayName: vi.fn(),
  planFor: vi.fn(),
  queryContext: vi.fn(),
  readBilling: vi.fn(),
  readBillingAccount: vi.fn(),
  readComplimentaryEntitlement: vi.fn(),
  readHomeState: vi.fn(),
  reconcile: vi.fn(),
  recordEvent: vi.fn(),
  requestedRecurringPlanIsActive: vi.fn(),
  returnUrlFor: vi.fn(),
  startTrial: vi.fn(),
  syncBillingAccount: vi.fn(),
  syncTrial: vi.fn(),
  withValidationLock: vi.fn(),
  writeValidation: vi.fn(),
}));

vi.mock("../app/admin-auth.server", () => ({
  authenticateAdmin: mocks.authenticateAdmin,
}));

vi.mock("../app/shopify.server", () => ({
  authenticate: { admin: mocks.authenticate },
}));

vi.mock("../app/billing.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/billing.server")>()),
  cancelSubscription: mocks.cancelSubscription,
  createCharge: mocks.createCharge,
  readBilling: mocks.readBilling,
  readBillingAccount: mocks.readBillingAccount,
  readComplimentaryEntitlement: mocks.readComplimentaryEntitlement,
  requestedRecurringPlanIsActive: mocks.requestedRecurringPlanIsActive,
  returnUrlFor: mocks.returnUrlFor,
  startTrial: mocks.startTrial,
  syncBillingAccount: mocks.syncBillingAccount,
  syncTrial: mocks.syncTrial,
}));

vi.mock("../app/events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/events.server")>()),
  dismissMerchantCheckIn: mocks.dismissMerchantCheckIn,
  recordEvent: mocks.recordEvent,
}));

vi.mock("../app/plans.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/plans.server")>()),
  planFor: mocks.planFor,
}));

vi.mock("../app/shop-profile.server", () => ({
  persistShopDisplayName: mocks.persistShopDisplayName,
}));

vi.mock("../app/validation.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/validation.server")>()),
  completeOnboardingAutomatically: mocks.completeOnboardingAutomatically,
  queryContext: mocks.queryContext,
  readHomeState: mocks.readHomeState,
  reconcile: mocks.reconcile,
  withValidationLock: mocks.withValidationLock,
  writeValidation: mocks.writeValidation,
}));

const shop = "coverage.example.myshopify.com";
const admin = { graphql: vi.fn() };
const db = {} as D1Database;

function actionRequest(intent: string, extra: Record<string, string> = {}) {
  return {
    request: new Request("https://example.test/app", {
      method: "POST",
      body: new URLSearchParams({ intent, ...extra }),
    }),
    context: createAppContext(db),
    params: {},
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({ admin, session: { shop } });
  mocks.authenticateAdmin.mockResolvedValue({ admin, session: { shop } });
  mocks.readComplimentaryEntitlement.mockResolvedValue(null);
  mocks.queryContext.mockResolvedValue({
    shop: {
      name: "Negozio coverage",
      shopAddress: { countryCodeV2: "IT" },
      ianaTimezone: "Europe/Rome",
    },
  });
  mocks.syncTrial.mockResolvedValue(null);
  mocks.readBillingAccount.mockResolvedValue(null);
  mocks.syncBillingAccount.mockResolvedValue(null);
  mocks.readBilling.mockResolvedValue({ oneTime: null, pendingOneTime: false, subscription: null });
  mocks.requestedRecurringPlanIsActive.mockReturnValue(false);
  mocks.returnUrlFor.mockReturnValue("https://admin.shopify.com/store/coverage/apps/cf-ready");
  mocks.planFor.mockReturnValue({
    name: "CF Ready Monthly",
    amount: 2.99,
    currency: "EUR",
    interval: "EVERY_30_DAYS",
  });
  mocks.createCharge.mockResolvedValue({ confirmationUrl: "https://shopify.test/approve" });
  mocks.withValidationLock.mockImplementation(
    async (_db: D1Database, _shop: string, operation: () => Promise<unknown>) => ({
      acquired: true,
      result: await operation(),
    }),
  );
});

test("la Home completa automaticamente un onboarding già effettivo", async () => {
  mocks.reconcile.mockResolvedValue({
    shopName: "Negozio coverage",
    countryCode: "IT",
    today: "2026-09-02",
    eligible: true,
    validation: {
      metafield: {
        jsonValue: {
          ...DEFAULT_CONFIG,
          rules: { ...DEFAULT_CONFIG.rules, taxCode: "required_validated" },
        },
      },
    },
    validationEnabled: true,
    trial: { status: "active", ends_at: "2026-09-10" },
    account: { plan_kind: "monthly", entitlement_status: "active", current_period_end: null },
    entitlement: { kind: "trial", validThrough: "2026-09-10" },
    complimentary: { status: "active" },
    creditEstimate: null,
    errorCode: null,
    partnerDevelopment: false,
  });
  mocks.readHomeState.mockResolvedValue({
    onboarding: { status: "in_progress", step: 4 },
    address2Declaration: "address2",
    enabledSince: "2026-08-01T00:00:00.000Z",
    merchantCheckInDismissed: false,
  });
  mocks.completeOnboardingAutomatically.mockResolvedValue(true);

  const { loader } = await import("../app/features/home/home.server");
  const result = await loader({
    request: new Request("https://example.test/app?locale=en"),
    context: createAppContext(db),
    params: {},
  } as never);

  expect(result.data).toMatchObject({
    onboarding: "completed",
    address2Declared: true,
    complimentary: true,
    showMerchantCheckIn: true,
  });
  expect(mocks.recordEvent).toHaveBeenCalledWith(
    db,
    expect.objectContaining({ name: "onboarding_auto_completed" }),
  );
});

test.each([
  [false, { ok: false, errorCode: "generic" }],
  [new Error("D1 non disponibile"), { ok: false, errorCode: "generic" }],
])("il check-in fallito resta recuperabile", async (outcome, expected) => {
  if (outcome instanceof Error) mocks.dismissMerchantCheckIn.mockRejectedValue(outcome);
  else mocks.dismissMerchantCheckIn.mockResolvedValue(outcome);
  const { action } = await import("../app/features/home/home.server");
  await expect(action(actionRequest("dismiss_checkin"))).resolves.toEqual(expected);
});

test.each([
  [
    { errorCode: "duplicate_validations_active" },
    { ok: false, errorCode: "duplicate_validations_active" },
  ],
  [new Error("Shopify non disponibile"), { ok: false, errorCode: "validation_write_failed" }],
])("la riparazione espone un esito azionabile", async (outcome, expected) => {
  if (outcome instanceof Error) mocks.reconcile.mockRejectedValue(outcome);
  else mocks.reconcile.mockResolvedValue(outcome);
  const { action } = await import("../app/features/home/home.server");
  await expect(action(actionRequest("repair"))).resolves.toEqual(expected);
});

test("la prova distingue omaggio, store non supportato, indisponibilità e successo", async () => {
  const { action } = await import("../app/features/home/home.server");

  mocks.readComplimentaryEntitlement.mockResolvedValueOnce({ status: "active" });
  await expect(action(actionRequest("start_trial"))).resolves.toEqual({
    ok: false,
    errorCode: "one_time_already_active",
  });

  mocks.startTrial.mockResolvedValueOnce(null);
  await expect(action(actionRequest("start_trial"))).resolves.toEqual({
    ok: false,
    errorCode: "store_not_supported",
  });

  mocks.startTrial.mockResolvedValueOnce({ status: "expired" });
  await expect(action(actionRequest("start_trial"))).resolves.toEqual({
    ok: false,
    errorCode: "trial_unavailable",
  });

  mocks.startTrial.mockResolvedValueOnce({ status: "active" });
  await expect(action(actionRequest("start_trial"))).resolves.toEqual({ ok: true });
  expect(mocks.persistShopDisplayName).toHaveBeenCalledWith(db, shop, "Negozio coverage");
});

test("l'attivazione e la disattivazione registrano soltanto scritture riuscite", async () => {
  const { action } = await import("../app/features/home/home.server");
  mocks.writeValidation.mockResolvedValueOnce({ ok: false, errorCode: "validation_locked" });
  await expect(action(actionRequest("enable"))).resolves.toEqual({
    ok: false,
    errorCode: "validation_locked",
  });

  mocks.writeValidation.mockResolvedValueOnce({ ok: true, enabled: false });
  await expect(action(actionRequest("disable"))).resolves.toEqual({ ok: true });
  expect(mocks.recordEvent).toHaveBeenLastCalledWith(db, {
    shopDomain: shop,
    name: "validation_disabled",
    class: "validation",
    metadata: { enabled: false, schema_version: 2 },
  });

  mocks.writeValidation.mockResolvedValueOnce({ ok: true, enabled: true });
  await expect(action(actionRequest("enable"))).resolves.toEqual({ ok: true });
  expect(mocks.recordEvent).toHaveBeenLastCalledWith(
    db,
    expect.objectContaining({
      name: "validation_enabled",
      metadata: { enabled: true, schema_version: 2 },
    }),
  );

  await expect(action(actionRequest("intent_sconosciuto"))).resolves.toEqual({
    ok: false,
    errorCode: "generic",
  });
});

test("l'acquisto rifiuta gli stati incompatibili prima di creare l'addebito", async () => {
  const { action } = await import("../app/features/home/home.server");

  mocks.readComplimentaryEntitlement.mockResolvedValueOnce({ status: "active" });
  await expect(action(actionRequest("monthly"))).resolves.toEqual({
    ok: false,
    errorCode: "one_time_already_active",
  });

  mocks.queryContext.mockResolvedValueOnce({
    shop: { name: "Fuori Italia", shopAddress: { countryCodeV2: "FR" }, ianaTimezone: "UTC" },
  });
  await expect(action(actionRequest("annual"))).resolves.toEqual({
    ok: false,
    errorCode: "country_not_eligible",
  });

  mocks.readBilling.mockResolvedValueOnce({ oneTime: { id: "one" }, pendingOneTime: false });
  await expect(action(actionRequest("monthly"))).resolves.toEqual({
    ok: false,
    errorCode: "one_time_already_active",
  });

  mocks.readBilling.mockResolvedValueOnce({ oneTime: null, pendingOneTime: true });
  await expect(action(actionRequest("one_time"))).resolves.toEqual({
    ok: false,
    errorCode: "charge_pending",
  });

  mocks.requestedRecurringPlanIsActive.mockReturnValueOnce(true);
  await expect(action(actionRequest("annual"))).resolves.toEqual({
    ok: false,
    errorCode: "generic",
  });
});

test("l'acquisto gestisce piano assente, risposta Shopify, lock e successo", async () => {
  const { action } = await import("../app/features/home/home.server");

  mocks.planFor.mockReturnValueOnce(null);
  await expect(action(actionRequest("monthly"))).resolves.toEqual({
    ok: false,
    errorCode: "generic",
  });

  mocks.createCharge.mockResolvedValueOnce({ confirmationUrl: null, error: "user_error" });
  await expect(action(actionRequest("monthly"))).resolves.toEqual({
    ok: false,
    errorCode: "charge_failed",
  });

  await expect(action(actionRequest("one_time"))).resolves.toEqual({
    ok: true,
    confirmationUrl: "https://shopify.test/approve",
  });

  mocks.withValidationLock.mockResolvedValueOnce({ acquired: false });
  await expect(action(actionRequest("monthly"))).resolves.toEqual({
    ok: false,
    errorCode: "validation_locked",
  });

  mocks.withValidationLock.mockRejectedValueOnce(new Error("D1 non disponibile"));
  await expect(action(actionRequest("monthly"))).resolves.toEqual({
    ok: false,
    errorCode: "charge_failed",
  });
});

test("la cancellazione copre gli stati terminali, il lock e gli errori", async () => {
  const { action } = await import("../app/features/home/home.server");

  mocks.readBilling.mockResolvedValueOnce({ oneTime: { id: "one" }, pendingOneTime: false });
  await expect(action(actionRequest("cancel"))).resolves.toEqual({
    ok: false,
    errorCode: "one_time_already_active",
  });

  mocks.readBilling.mockResolvedValueOnce({ oneTime: null, pendingOneTime: true });
  await expect(action(actionRequest("cancel"))).resolves.toEqual({
    ok: false,
    errorCode: "charge_pending",
  });

  mocks.readBilling.mockResolvedValueOnce({ oneTime: null, pendingOneTime: false });
  await expect(action(actionRequest("cancel"))).resolves.toEqual({
    ok: false,
    errorCode: "no_subscription",
  });

  mocks.readBilling.mockResolvedValue({
    oneTime: null,
    pendingOneTime: false,
    subscription: { id: "gid://shopify/AppSubscription/1" },
  });
  mocks.cancelSubscription.mockResolvedValueOnce(true);
  await expect(action(actionRequest("cancel"))).resolves.toEqual({
    ok: false,
    errorCode: "cancel_failed",
  });

  mocks.cancelSubscription.mockResolvedValueOnce(false);
  await expect(action(actionRequest("cancel"))).resolves.toEqual({ ok: true });
  expect(mocks.recordEvent).toHaveBeenLastCalledWith(db, {
    shopDomain: shop,
    name: "subscription_cancelled",
    class: "billing",
  });

  mocks.withValidationLock.mockResolvedValueOnce({ acquired: false });
  await expect(action(actionRequest("cancel"))).resolves.toEqual({
    ok: false,
    errorCode: "validation_locked",
  });

  mocks.withValidationLock.mockRejectedValueOnce(new Error("D1 non disponibile"));
  await expect(action(actionRequest("cancel"))).resolves.toEqual({
    ok: false,
    errorCode: "cancel_failed",
  });
});
