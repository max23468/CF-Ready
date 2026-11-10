import { env } from "cloudflare:test";
import { beforeEach, expect, test, vi } from "vitest";
import { addDays, localDate } from "../../app/billing/domain";
import {
  markTrialConverted,
  saveOneTimeOffer,
  startTrial,
} from "../../app/billing/repository.server";
import { DEFAULT_CONFIG, CONFIG_SCHEMA_VERSION } from "../../app/config";
import { acquireValidationLock } from "../../app/validation/lock.server";
import { saveOnboarding } from "../../app/validation/repository.server";
import * as homeRoute from "../../app/routes/app._index";
import * as onboardingRoute from "../../app/routes/app.onboarding";
import { d1WithFault } from "../support/d1-fault";
import {
  eventsOf,
  grantComplimentary,
  merchant,
  offerOneTime,
  post,
  routeArgs,
} from "../support/merchant";
import type { ShopifyAdminFake } from "../support/shopify-admin";

const auth = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("../../app/shopify.server", () => ({ authenticate: { admin: auth.admin } }));
vi.mock("../../app/env.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../app/env.server")>()),
  APP_API_KEY: "chiave-app",
}));

const CONFIGURED = {
  ...DEFAULT_CONFIG,
  rules: { taxCode: "required_validated", pec: "unmanaged" },
} as const;
const SUBSCRIPTION = "gid://shopify/AppSubscription/home";
const ROME_TODAY = () => localDate("Europe/Rome");

let shop: string;
let shopify: ShopifyAdminFake;

beforeEach(async () => {
  ({ shop, shopify } = await merchant("home"));
  auth.admin.mockReset();
  auth.admin.mockResolvedValue({ admin: shopify.admin, session: { shop } });
});

function act(intent: string, db?: D1Database, queue?: Queue, extra: Record<string, string> = {}) {
  return homeRoute.action(routeArgs(post("/app", { intent, ...extra }), db, queue));
}

function loadHome() {
  return homeRoute.loader(routeArgs(new Request("https://example.test/app?locale=en")));
}

function activeSubscription(interval: "EVERY_30_DAYS" | "ANNUAL" = "EVERY_30_DAYS") {
  shopify.state.subscriptions.push({
    id: SUBSCRIPTION,
    interval,
    currentPeriodEnd: `${addDays(ROME_TODAY(), 20)}T21:59:59Z`,
  });
}

async function holdLease() {
  expect(await acquireValidationLock(env.DB, shop)).toEqual(expect.any(String));
}

const failingLease = () =>
  d1WithFault(env.DB, {
    sql: "INSERT INTO validation_operation_locks",
    first: () => {
      throw new Error("D1 non disponibile");
    },
  }).db;

test("la Home completa l'onboarding solo con la conferma Shopify", async () => {
  await saveOnboarding(env.DB, shop, { status: "in_progress", step: 4 });
  shopify.addValidation(CONFIGURED, true);
  shopify.state.shop.plan.partnerDevelopment = false;
  activeSubscription();

  const result = await loadHome();

  expect(result.data.home).toMatchObject({ verified: false, onboarding: "in_progress" });
  await expect(result.data.confirmed).resolves.toMatchObject({
    verified: true,
    onboarding: "completed",
    complimentary: false,
    showMerchantCheckIn: true,
  });
  expect(await eventsOf(shop, "onboarding_auto_completed")).toEqual([
    { reason: "effective_configuration" },
  ]);
});

test("un omaggio attivo non è presentato come piano pagante", async () => {
  await grantComplimentary(shop);
  shopify.addValidation(CONFIGURED, true);
  shopify.state.shop.plan.partnerDevelopment = false;

  await expect((await loadHome()).data.confirmed).resolves.toMatchObject({
    complimentary: true,
    showMerchantCheckIn: false,
  });
});

test("il check-in si chiude senza toccare Shopify né l'onboarding", async () => {
  await expect(act("dismiss_checkin")).resolves.toEqual({ ok: true });

  expect(await eventsOf(shop, "merchant_checkin_dismissed")).toHaveLength(1);
  expect(shopify.calls).toEqual([]);
});

test.each([
  ["esito negativo", () => ({ success: false })],
  [
    "eccezione",
    () => {
      throw new Error("D1 non disponibile");
    },
  ],
])("il check-in fallito resta recuperabile: %s", async (_name, run) => {
  const { db } = d1WithFault(env.DB, { sql: "'merchant_checkin_dismissed'", run });

  await expect(act("dismiss_checkin", db)).resolves.toEqual({ ok: false, errorCode: "generic" });
});

test("la riparazione ripete la riconciliazione Shopify", async () => {
  shopify.addValidation(CONFIGURED, false);

  await expect(act("repair")).resolves.toEqual({ ok: true });

  expect(shopify.callsTo("CfReadyContext")).toHaveLength(1);
});

test("la riparazione espone i duplicati e il fallimento Shopify", async () => {
  const active = shopify.addValidation(CONFIGURED, true);
  shopify.addValidation(CONFIGURED, false);
  // Finché la disattivazione non riesce il duplicato resta attivo e va segnalato come tale.
  shopify.failNext("CfReadyValidationUpdate", new Error("Shopify non disponibile"));
  await expect(act("repair")).resolves.toEqual({
    ok: false,
    errorCode: "duplicate_validations_active",
  });
  expect(active.enabled).toBe(true);

  await expect(act("repair")).resolves.toEqual({ ok: false, errorCode: "duplicate_validations" });
  expect(active.enabled).toBe(false);

  shopify.failNext("CfReadyContext", new Error("Shopify non disponibile"));
  await expect(act("repair")).resolves.toEqual({
    ok: false,
    errorCode: "validation_write_failed",
  });
});

test("l'esito del prompt recensione conserva soltanto il codice ammesso", async () => {
  await expect(
    act("review_prompt_result", undefined, undefined, {
      code: "cooldown-period",
      message: "testo che non deve essere registrato",
    }),
  ).resolves.toEqual({ ok: true });
  await act("review_prompt_result", undefined, undefined, { code: "future-code" });

  expect(await eventsOf(shop, "review_prompt_result")).toEqual([
    { reason: "cooldown-period" },
    { reason: "unknown" },
  ]);
});

test("un omaggio attivo non avvia la prova", async () => {
  await grantComplimentary(shop);

  await expect(act("start_trial")).resolves.toEqual({
    ok: false,
    errorCode: "one_time_already_active",
  });
});

test.each([
  ["Home", homeRoute.action, "/app"],
  ["onboarding", onboardingRoute.action, "/app/onboarding"],
] as const)("%s non dichiara avviata una prova già consumata", async (_name, action, path) => {
  await startTrial(env.DB, shop, { today: "2026-01-01" });
  await env.DB.prepare(
    "UPDATE trials SET status = 'expired' WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)",
  )
    .bind(shop)
    .run();

  await expect(action(routeArgs(post(path, { intent: "start_trial" })))).resolves.toEqual({
    ok: false,
    errorCode: "trial_unavailable",
  });
});

test.each([
  ["Home", homeRoute.action, "/app"],
  ["onboarding", onboardingRoute.action, "/app/onboarding"],
] as const)(
  "%s avvia la prova per uno store estero senza redirect",
  async (_name, action, path) => {
    Object.assign(shopify.state.shop, {
      name: "Store francese",
      ianaTimezone: "Europe/Paris",
      shopAddress: { countryCodeV2: "FR" },
    });

    await expect(action(routeArgs(post(path, { intent: "start_trial" })))).resolves.toEqual({
      ok: true,
    });

    expect(
      await env.DB.prepare("SELECT display_name FROM shops WHERE shop_domain = ?")
        .bind(shop)
        .first("display_name"),
    ).toBe("Store francese");
    expect(await eventsOf(shop, "trial_started")).toHaveLength(1);
  },
);

test("un intent sconosciuto non produce scritture", async () => {
  await expect(act("intent_sconosciuto")).resolves.toEqual({ ok: false, errorCode: "generic" });
  expect(shopify.calls).toEqual([]);
});

test("attivazione e disattivazione riportano la scrittura confermata da Shopify", async () => {
  await startTrial(env.DB, shop, { today: ROME_TODAY() });
  const validation = shopify.addValidation(CONFIGURED, false);

  await expect(act("enable")).resolves.toEqual({ ok: true, enabled: true });
  expect(validation.enabled).toBe(true);

  await expect(act("disable")).resolves.toEqual({ ok: true, enabled: false });
  expect(validation.enabled).toBe(false);

  const metadata = (enabled: boolean) => ({ enabled, schema_version: CONFIG_SCHEMA_VERSION });
  expect(await eventsOf(shop, "validation_enabled")).toEqual([metadata(true)]);
  expect(await eventsOf(shop, "validation_disabled")).toEqual([metadata(false)]);
});

test("l'attivazione senza diritto o sotto lease non scrive su Shopify", async () => {
  const validation = shopify.addValidation(CONFIGURED, false);

  await expect(act("enable")).resolves.toEqual({ ok: false, errorCode: "entitlement_required" });

  await holdLease();
  await expect(act("enable")).resolves.toEqual({ ok: false, errorCode: "validation_locked" });

  expect(validation.enabled).toBe(false);
  expect(shopify.callsTo("CfReadyValidationUpdate")).toEqual([]);
  expect(await eventsOf(shop, "validation_enabled")).toEqual([]);
});

test("D-206: soltanto una riattivazione con uniformazione recupera gli ordini", async () => {
  await startTrial(env.DB, shop, { today: ROME_TODAY() });
  const normalize = { ...CONFIGURED, rules: { ...CONFIGURED.rules, normalizeOrderFields: true } };
  const validation = shopify.addValidation(normalize, false);
  const send = vi.fn(async () => undefined);
  const queue = { send } as unknown as Queue;

  await expect(act("enable", undefined, queue)).resolves.toEqual({ ok: true, enabled: true });
  expect(send).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ shop, backfill: expect.objectContaining({ cursor: null }) }),
  );

  await act("disable", undefined, queue);
  expect(send).toHaveBeenCalledOnce();

  validation.config = { ...normalize, rules: { ...normalize.rules, normalizeOrderFields: false } };
  await act("enable", undefined, queue);
  expect(send).toHaveBeenCalledOnce();
});

test("una coda non disponibile non cambia l'esito dell'attivazione", async () => {
  await startTrial(env.DB, shop, { today: ROME_TODAY() });
  shopify.addValidation(
    { ...CONFIGURED, rules: { ...CONFIGURED.rules, normalizeOrderFields: true } },
    false,
  );
  const queue = {
    send: vi.fn(async () => {
      throw new Error("coda");
    }),
  } as unknown as Queue;

  await expect(act("enable", undefined, queue)).resolves.toEqual({ ok: true, enabled: true });
});

test.each([
  ["omaggio attivo", "monthly", "one_time_already_active", async () => grantComplimentary(shop)],
  [
    "pagamento unico attivo",
    "monthly",
    "one_time_already_active",
    async () => {
      shopify.state.purchases.push({ id: "gid://shopify/AppPurchaseOneTime/1", status: "ACTIVE" });
    },
  ],
  [
    "pagamento unico in attesa",
    "one_time",
    "charge_pending",
    async () => {
      await offerOneTime(shop);
      shopify.state.purchases.push({ id: "gid://shopify/AppPurchaseOneTime/2", status: "PENDING" });
    },
  ],
  ["pagamento unico senza offerta", "one_time", "one_time_on_request", async () => {}],
  [
    "pagamento unico con offerta revocata",
    "one_time",
    "one_time_on_request",
    async () => {
      await offerOneTime(shop);
      const { id } = (await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?")
        .bind(shop)
        .first<{ id: number }>())!;
      await saveOneTimeOffer(env.DB, id, null);
    },
  ],
  ["stesso piano già attivo", "annual", "generic", async () => activeSubscription("ANNUAL")],
] as const)(
  "l'acquisto rifiuta %s prima dell'addebito",
  async (_name, intent, errorCode, arrange) => {
    await arrange();

    await expect(act(intent)).resolves.toEqual({ ok: false, errorCode });

    expect(shopify.callsTo("CfReadySubscriptionCreate", "CfReadyOneTimeCreate")).toEqual([]);
  },
);

test("l'acquisto restituisce l'approvazione Shopify e riporta il rifiuto", async () => {
  shopify.failNext("CfReadySubscriptionCreate", {
    data: { appSubscriptionCreate: { confirmationUrl: null, userErrors: [{ message: "no" }] } },
  });
  await expect(act("monthly")).resolves.toEqual({ ok: false, errorCode: "charge_failed" });

  const approved = { ok: true, confirmationUrl: "https://shopify.test/approve" };
  await offerOneTime(shop, 7450);
  await expect(act("one_time")).resolves.toEqual(approved);
  await expect(act("monthly")).resolves.toEqual(approved);
  const [{ variables }] = shopify.callsTo("CfReadyOneTimeCreate");
  expect(variables.returnUrl).toContain("/apps/chiave-app");
  // D-221: l'importo è quello concordato dall'owner, non il listino della generazione.
  expect(variables.price).toEqual({ amount: 74.5, currencyCode: "EUR" });
});

test("l'acquisto rispetta la lease e non espone un errore D1", async () => {
  await expect(act("monthly", failingLease())).resolves.toEqual({
    ok: false,
    errorCode: "charge_failed",
  });

  await holdLease();
  await expect(act("monthly")).resolves.toEqual({ ok: false, errorCode: "validation_locked" });

  expect(shopify.callsTo("CfReadySubscriptionCreate")).toEqual([]);
});

test("uno store estero può creare una charge", async () => {
  shopify.state.shop.shopAddress.countryCodeV2 = "FR";
  shopify.state.shop.ianaTimezone = "Europe/Paris";

  await expect(act("monthly")).resolves.toEqual({
    ok: true,
    confirmationUrl: "https://shopify.test/approve",
  });

  expect(shopify.callsTo("CfReadySubscriptionCreate")).toHaveLength(1);
});

test.each([
  ["residui", -1, 13],
  ["esauriti", -15, 0],
])("dopo una disdetta in prova la charge usa i giorni %s", async (_name, startOffset, days) => {
  await startTrial(env.DB, shop, { today: addDays(ROME_TODAY(), startOffset) });
  await markTrialConverted(env.DB, shop);

  await act("annual");

  expect(shopify.callsTo("CfReadySubscriptionCreate")[0].variables.trialDays).toBe(days);
});

test.each([
  ["ACTIVE", "one_time_already_active"],
  ["PENDING", "charge_pending"],
] as const)("la disdetta si ferma con un pagamento unico %s", async (status, errorCode) => {
  activeSubscription();
  shopify.state.purchases.push({ id: "gid://shopify/AppPurchaseOneTime/3", status });

  await expect(act("cancel")).resolves.toEqual({ ok: false, errorCode });

  expect(shopify.callsTo("CfReadySubscriptionCancel")).toEqual([]);
});

test("la disdetta riporta l'assenza di abbonamenti", async () => {
  await expect(act("cancel")).resolves.toEqual({ ok: false, errorCode: "no_subscription" });
});

test("la disdetta si ferma se il periodo è già concluso", async () => {
  shopify.state.subscriptions.push({
    id: SUBSCRIPTION,
    currentPeriodEnd: "2020-01-31T21:59:59Z",
  });

  await expect(act("cancel")).resolves.toEqual({ ok: false, errorCode: "cancel_failed" });

  expect(shopify.callsTo("CfReadySubscriptionCancel")).toEqual([]);
});

test("la disdetta conferma l'intento solo dopo la risposta Shopify", async () => {
  activeSubscription();
  const intent = () =>
    env.DB.prepare("SELECT status FROM billing_cancellation_intents WHERE subscription_gid = ?")
      .bind(SUBSCRIPTION)
      .first("status");

  shopify.failNext("CfReadySubscriptionCancel", {
    data: { appSubscriptionCancel: { userErrors: [{ message: "non cancellabile" }] } },
  });
  await expect(act("cancel")).resolves.toEqual({ ok: false, errorCode: "cancel_failed" });
  expect(await intent()).toBe("requested");
  expect(await eventsOf(shop, "subscription_cancelled")).toEqual([]);

  await expect(act("cancel")).resolves.toEqual({ ok: true });
  expect(await intent()).toBe("confirmed");
  expect(shopify.callsTo("CfReadySubscriptionCancel").at(-1)?.variables).toEqual({
    id: SUBSCRIPTION,
    prorate: false,
  });
  expect(await eventsOf(shop, "subscription_cancelled")).toEqual([null]);
});

test("la disdetta rispetta la lease e non espone un errore D1", async () => {
  activeSubscription();

  await expect(act("cancel", failingLease())).resolves.toEqual({
    ok: false,
    errorCode: "cancel_failed",
  });

  await holdLease();
  await expect(act("cancel")).resolves.toEqual({ ok: false, errorCode: "validation_locked" });

  expect(shopify.callsTo("CfReadySubscriptionCancel")).toEqual([]);
});
