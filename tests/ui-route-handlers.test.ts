import { env } from "cloudflare:test";
import { beforeEach, expect, test, vi } from "vitest";
import { localDate } from "../app/billing/domain";
import { startTrial } from "../app/billing/repository.server";
import {
  CHECKOUT_LABEL_KEYS,
  checkoutLabelSlotId,
  type CheckoutLabelSlot,
} from "../app/checkout-labels/domain";
import {
  enableCheckoutLabels,
  readCheckoutLabelState,
} from "../app/checkout-labels/repository.server";
import { DEFAULT_CONFIG, MESSAGE_KEYS, readConfig } from "../app/config";
import { configHash } from "../app/validation/domain";
import { readOnboarding, saveOnboarding } from "../app/validation/repository.server";
import * as guideRoute from "../app/routes/app.guide";
import * as messagesRoute from "../app/routes/app.messages";
import * as onboardingRoute from "../app/routes/app.onboarding";
import * as rulesRoute from "../app/routes/app.rules";
import * as authRoute from "../app/routes/auth.$";
import { d1WithFault } from "./support/d1-fault";
import { eventsOf, grantComplimentary, merchant, post, routeArgs } from "./support/merchant";
import type { ShopifyAdminFake } from "./support/shopify-admin";

const boundary = vi.hoisted(() => ({
  admin: vi.fn(),
  scopes: vi.fn(),
  orderNormalizationEnabled: true,
}));

vi.mock("../app/shopify.server", () => ({ authenticate: { admin: boundary.admin } }));
vi.mock("../app/env.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/env.server")>()),
  APP_URL: "https://app.example.test",
  get ORDER_NORMALIZATION_ENABLED() {
    return boundary.orderNormalizationEnabled;
  },
}));

const LABEL_SCOPES = ["write_translations", "read_locales", "read_markets"];
const ORDER_SCOPES = ["read_orders", "write_orders"];
const REQUIRED_TAX_CODE = { taxCode: "required_validated", pec: "unmanaged" } as const;
const CONFIGURED = { ...DEFAULT_CONFIG, rules: REQUIRED_TAX_CODE };
const VALIDATION_WRITES = ["CfReadyValidationCreate", "CfReadyValidationUpdate"];
const LABEL_READS = ["DiscoverCheckoutLabelContext", "DiscoverCheckoutLabelResources"];
const LABEL_WRITES = ["RegisterCheckoutLabelTranslations", "RemoveCheckoutLabelTranslations"];

let shop: string;
let shopify: ShopifyAdminFake;

beforeEach(async () => {
  ({ shop, shopify } = await merchant("route"));
  boundary.orderNormalizationEnabled = true;
  boundary.scopes.mockReset();
  boundary.scopes.mockResolvedValue({ granted: [] });
  boundary.admin.mockReset();
  boundary.admin.mockResolvedValue({
    admin: shopify.admin,
    session: { shop },
    scopes: { query: boundary.scopes },
  });
});

function grantScopes(...granted: string[][]) {
  boundary.scopes.mockResolvedValue({ granted: granted.flat() });
}

function entitle() {
  return startTrial(env.DB, shop, { today: localDate("Europe/Rome") });
}

function storedConfig() {
  return readConfig(shopify.state.validations[0]?.config);
}

async function currentHash() {
  const config = shopify.state.validations[0]?.config;
  return config === undefined ? "" : configHash(config);
}

function get(path: string) {
  return routeArgs(new Request(`https://example.test${path}`));
}

function onboardingAction(values: Record<string, string>) {
  return onboardingRoute.action(routeArgs(post("/app/onboarding", values)));
}

function guideAction(values: Record<string, string>) {
  return guideRoute.action(routeArgs(post("/app/guide", values)));
}

async function rulesAction(values: Record<string, string>, queue?: Queue) {
  return (await rulesRoute.action(routeArgs(post("/app/rules", values), env.DB, queue))).data;
}

// Salva le regole come farebbe la pagina, con l'hash della configurazione appena letta.
async function saveRules(values: Record<string, string>, queue?: Queue) {
  return rulesAction({ configHash: await currentHash(), ...values }, queue);
}

async function labelSnapshot() {
  const snapshot = (await onboardingRoute.loader(get("/app/onboarding?locale=it"))).data
    .labelSnapshot;
  if (!snapshot) throw new Error("snapshot etichette assente");
  return snapshot;
}

function slot(
  slots: CheckoutLabelSlot[],
  name: CheckoutLabelSlot["name"],
  locale: string,
  kind = "global_translation",
) {
  const found = slots.find(
    (entry) => entry.name === name && entry.locale === locale && entry.kind === kind,
  );
  if (!found) throw new Error(`slot ${name}/${locale}/${kind} assente`);
  return found;
}

function messageForm(hash: string, overrides: Record<string, string> = {}) {
  return Object.fromEntries([
    ["configHash", hash],
    ...(["it", "en"] as const).flatMap((locale) =>
      MESSAGE_KEYS.map((key) => [`${locale}.${key}`, DEFAULT_CONFIG.messages[locale][key]]),
    ),
    ...Object.entries(overrides),
  ]);
}

test("Guida carica la diagnostica e propaga Server-Timing", async () => {
  const loaded = await guideRoute.loader(get("/app/guide?locale=en"));

  expect(loaded.data).toMatchObject({
    locale: "en",
    shopDomain: shop,
    diagnostics: { address2Decision: "pending", checkoutLabelLocales: "" },
  });
  expect(loaded.data.diagnosticId).toMatch(/^[0-9a-f-]{36}$/i);
  const timing = new Headers(loaded.init?.headers).get("Server-Timing");
  expect(timing).toContain("total;dur=");
  expect(
    new Headers(
      guideRoute.headers({
        loaderHeaders: new Headers(loaded.init?.headers),
        parentHeaders: new Headers(),
      } as never),
    ).get("Server-Timing"),
  ).toBe(timing);
});

test("Guida accetta solo ricevute di copia valide", async () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";

  await expect(guideAction({ intent: "altro", diagnostic_id: "x" })).resolves.toEqual({
    ok: false,
  });
  await expect(guideAction({ intent: "diagnostics_copied" })).resolves.toEqual({ ok: false });
  await expect(guideAction({ intent: "diagnostics_copied", diagnostic_id: id })).resolves.toEqual({
    ok: true,
  });

  expect(await eventsOf(shop, "support_diagnostics_copied")).toEqual([{ correlation_id: id }]);
});

test("la diagnosi rilegge Shopify senza attivare la Validation", async () => {
  await entitle();
  const validation = shopify.addValidation(CONFIGURED, false);

  await expect(guideAction({ intent: "check_validation" })).resolves.toMatchObject({
    ok: true,
    check: { enabled: false, configured: true, entitled: true, errorCode: null },
  });

  expect(validation.enabled).toBe(false);
});

test("la diagnosi prosegue senza scope e nasconde l'errore privato di Shopify", async () => {
  await entitle();
  shopify.addValidation(CONFIGURED, true);
  boundary.scopes.mockRejectedValueOnce(new Error("scope non disponibile"));
  await expect(guideAction({ intent: "check_validation" })).resolves.toMatchObject({
    ok: true,
    check: { enabled: true, checkoutLabelsStatus: expect.any(String) },
  });
  expect(shopify.callsTo(...LABEL_READS)).toEqual([]);

  shopify.failNext("CfReadyContext", new Error("errore privato"));
  await expect(guideAction({ intent: "check_validation" })).resolves.toEqual({ ok: false });
});

test("la diagnosi espone il fallimento del readback delle etichette", async () => {
  grantScopes(LABEL_SCOPES);
  shopify.failNext("DiscoverCheckoutLabelContext", { errors: [{ message: "non disponibile" }] });

  await expect(guideAction({ intent: "check_validation" })).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_readback_failed",
  });
});

test("Messaggi legge la configurazione da Shopify senza caricare le etichette", async () => {
  shopify.addValidation(DEFAULT_CONFIG);

  const loaded = await messagesRoute.loader(get("/app/messages?locale=it"));

  expect(loaded.data).toEqual({
    locale: "it",
    configHash: await configHash(DEFAULT_CONFIG),
    messages: DEFAULT_CONFIG.messages,
    rules: DEFAULT_CONFIG.rules,
  });
  expect(boundary.scopes).not.toHaveBeenCalled();
  expect(shopify.callsTo(...LABEL_READS)).toEqual([]);
});

test("Messaggi rifiuta un testo vuoto, salva sull'hash letto e segnala il conflitto", async () => {
  const validation = shopify.addValidation(DEFAULT_CONFIG);
  const action = async (values: Record<string, string>) =>
    (await messagesRoute.action(routeArgs(post("/app/messages", values)))).data;
  const hash = await configHash(DEFAULT_CONFIG);

  await expect(action(messageForm(hash, { "it.taxCodeRequired": "" }))).resolves.toMatchObject({
    ok: false,
    problem: { locale: "it", key: "taxCodeRequired" },
  });
  expect(shopify.callsTo(...VALIDATION_WRITES)).toEqual([]);

  await expect(
    action(messageForm(hash, { "it.pecRequired": "PEC obbligatoria" })),
  ).resolves.toMatchObject({ ok: true, saved: { rules: DEFAULT_CONFIG.rules } });
  expect(readConfig(validation.config).messages.it.pecRequired).toBe("PEC obbligatoria");

  await expect(action(messageForm(""))).resolves.toEqual({
    ok: false,
    errorCode: "config_conflict",
  });
  expect(readConfig(validation.config).messages.it.pecRequired).toBe("PEC obbligatoria");
});

test("Onboarding parte dal passo salvato senza accesso", async () => {
  await saveOnboarding(env.DB, shop, { status: "in_progress", step: 2 });

  expect((await onboardingRoute.loader(get("/app/onboarding?locale=it"))).data).toMatchObject({
    step: 2,
    completed: false,
    entitled: false,
    trialStatus: null,
    labelSnapshot: null,
  });
});

test("l’Onboarding riusa lo snapshot Shopify combinato", async () => {
  await saveOnboarding(env.DB, shop, { status: "in_progress", step: 2 });
  shopify.addValidation(DEFAULT_CONFIG, false);

  const result = await onboardingRoute.loader(get("/app/onboarding?locale=it"));

  expect(result.data).toMatchObject({ step: 2, completed: false, entitled: false });

  // Ricaricando la pagina si resta al passo indicato nell'URL.
  const reloaded = await onboardingRoute.loader(get("/app/onboarding?locale=it&step=4"));
  expect(reloaded.data).toMatchObject({ step: 4 });

  const serverTiming = new Headers(result.init?.headers).get("Server-Timing");
  expect(serverTiming).toMatch(/auth;dur=.*d1_onboarding;dur=.*total;dur=/);
  // I tempi della riconciliazione confluiscono nello stesso header della pagina.
  expect(serverTiming).toContain("d1_commercial;dur=");
  expect(
    new Headers(
      onboardingRoute.headers({
        loaderHeaders: new Headers(result.init?.headers),
        parentHeaders: new Headers(),
      } as never),
    ).get("Server-Timing"),
  ).toBe(serverTiming);
  expect(shopify.callsTo("CfReadyHomeSnapshot")).toHaveLength(2);
  expect(shopify.callsTo("CfReadyContext", "CfReadyBilling")).toEqual([]);
});

test("Onboarding espone accesso, completamento ed etichette quando gli scope ci sono", async () => {
  await saveOnboarding(env.DB, shop, { status: "completed", step: 4 });
  await entitle();
  shopify.addValidation(CONFIGURED, true);
  grantScopes(LABEL_SCOPES);

  const { data } = await onboardingRoute.loader(get("/app/onboarding?locale=it"));

  expect(data).toMatchObject({
    step: 4,
    completed: true,
    enabled: true,
    entitled: true,
    trialStatus: "active",
    labelState: { mode: "off" },
    labelSnapshot: { revision: expect.any(String) },
  });
});

test("Onboarding tratta come assenti gli scope non leggibili", async () => {
  boundary.scopes.mockRejectedValueOnce(new Error("scope non disponibile"));

  expect((await onboardingRoute.loader(get("/app/onboarding?locale=it"))).data).toMatchObject({
    labelSnapshot: null,
  });
  expect(shopify.callsTo(...LABEL_READS)).toEqual([]);
});

test("Onboarding salva l'avanzamento solo con un passo valido", async () => {
  await expect(onboardingAction({ intent: "progress", step: "x" })).resolves.toEqual({
    ok: false,
    errorCode: "generic",
  });
  await expect(onboardingAction({ intent: "progress", step: "2" })).resolves.toEqual({ ok: true });

  expect(await readOnboarding(env.DB, shop)).toMatchObject({ status: "in_progress", step: 2 });
});

test("Onboarding rifiuta regole ignote ed etichette senza scope", async () => {
  await expect(
    onboardingAction({ intent: "rules", taxCode: "x", pec: "unmanaged" }),
  ).resolves.toEqual({ ok: false, errorCode: "generic" });

  const withLabels = {
    intent: "rules",
    taxCode: "required_validated",
    pec: "optional_validated",
    labelsEnabled: "1",
  };
  await expect(onboardingAction(withLabels)).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_scope_required",
  });
  boundary.scopes.mockRejectedValueOnce(new Error("scope non disponibile"));
  await expect(onboardingAction(withLabels)).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_scope_required",
  });

  expect(shopify.callsTo(...VALIDATION_WRITES)).toEqual([]);
});

test("Onboarding salva le regole e avanza soltanto senza conflitti", async () => {
  await saveOnboarding(env.DB, shop, { status: "in_progress", step: 2 });
  const validation = shopify.addValidation(DEFAULT_CONFIG);
  const values = {
    intent: "rules",
    taxCode: "required_validated",
    pec: "required_when_company",
  };

  await expect(onboardingAction({ ...values, configHash: "superato" })).resolves.toEqual({
    ok: false,
    errorCode: "config_conflict",
  });
  expect(await readOnboarding(env.DB, shop)).toMatchObject({ step: 2 });

  await expect(
    onboardingAction({ ...values, configHash: await configHash(DEFAULT_CONFIG) }),
  ).resolves.toEqual({ ok: true });

  expect(readConfig(validation.config).rules).toMatchObject({
    taxCode: "required_validated",
    pec: "required_when_company",
  });
  expect(await readOnboarding(env.DB, shop)).toMatchObject({ status: "in_progress", step: 3 });
});

test("Onboarding sincronizza le etichette sulla revisione letta", async () => {
  grantScopes(LABEL_SCOPES);
  const values = {
    intent: "rules",
    taxCode: "required_validated",
    pec: "optional_validated",
    labelsEnabled: "1",
    labelsConfirmed: "1",
  };

  await expect(onboardingAction({ ...values, labelsRevision: "superata" })).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_conflict",
  });
  expect(shopify.callsTo(...LABEL_WRITES)).toEqual([]);

  const { revision } = await labelSnapshot();
  await expect(onboardingAction({ ...values, labelsRevision: revision })).resolves.toEqual({
    ok: true,
  });

  expect(shopify.translation(CHECKOUT_LABEL_KEYS.taxCode, "en")).toBe("Italian tax code");
  expect((await readCheckoutLabelState(env.DB, shop)).mode).not.toBe("off");
});

test("Onboarding con gli scope salva le regole senza gestire le etichette se non richiesto", async () => {
  grantScopes(LABEL_SCOPES);

  await expect(
    onboardingAction({ intent: "rules", taxCode: "required_validated", pec: "optional_validated" }),
  ).resolves.toEqual({ ok: true });

  expect(storedConfig().rules).toMatchObject({ pec: "optional_validated" });
  expect(shopify.callsTo(...LABEL_WRITES)).toEqual([]);
  expect((await readCheckoutLabelState(env.DB, shop)).mode).toBe("off");
});

test("Onboarding non dichiara una prova senza lo store e rifiuta gli intent ignoti", async () => {
  boundary.admin.mockResolvedValue({
    admin: shopify.admin,
    session: { shop: "assente.myshopify.com" },
    scopes: { query: boundary.scopes },
  });
  await expect(onboardingAction({ intent: "start_trial" })).resolves.toEqual({
    ok: false,
    errorCode: "trial_unavailable",
  });
  await expect(onboardingAction({ intent: "unknown" })).resolves.toEqual({
    ok: false,
    errorCode: "generic",
  });
});

test("Onboarding non avvia la prova su uno store con piano omaggio", async () => {
  await grantComplimentary(shop);

  await expect(onboardingAction({ intent: "start_trial" })).resolves.toEqual({
    ok: false,
    errorCode: "one_time_already_active",
  });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM trials WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)",
    )
      .bind(shop)
      .first("n"),
  ).toBe(0);
});

test("Onboarding recupera gli ordini quando attiva con la normalizzazione accesa", async () => {
  shopify.addValidation(
    { ...CONFIGURED, rules: { ...CONFIGURED.rules, normalizeOrderFields: true } },
    false,
  );
  await entitle();
  const send = vi.fn(async () => undefined);

  await expect(
    onboardingRoute.action(
      routeArgs(post("/app/onboarding", { intent: "activate" }), env.DB, {
        send,
      } as unknown as Queue),
    ),
  ).resolves.toEqual({ ok: true });

  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ shop, backfill: expect.objectContaining({ cursor: null }) }),
  );
});

test("Onboarding si chiude senza attivare la Validation", async () => {
  await expect(onboardingAction({ intent: "finish" })).resolves.toEqual({ ok: true });

  expect(await readOnboarding(env.DB, shop)).toMatchObject({ status: "completed" });
  expect(await eventsOf(shop, "onboarding_completed")).toEqual([{ enabled: false }]);
  expect(shopify.callsTo(...VALIDATION_WRITES)).toEqual([]);
});

test("Onboarding attiva solo dopo una scrittura confermata", async () => {
  const validation = shopify.addValidation(CONFIGURED, false);

  await expect(onboardingAction({ intent: "activate" })).resolves.toEqual({
    ok: false,
    errorCode: "entitlement_required",
  });
  expect(await eventsOf(shop, "onboarding_completed")).toEqual([]);

  await entitle();
  await expect(onboardingAction({ intent: "activate", address2Shown: "1" })).resolves.toEqual({
    ok: true,
  });

  expect(validation.enabled).toBe(true);
  expect(await eventsOf(shop, "onboarding_completed")).toEqual([{ enabled: true }]);
});

test("Regole non carica scope ed etichette nel documento iniziale", async () => {
  const { data } = await rulesRoute.loader(get("/app/rules?locale=en"));

  expect(data).toMatchObject({
    locale: "en",
    duplicateError: null,
    entitled: false,
    labelScopesGranted: null,
    labelSnapshot: null,
  });
  expect(boundary.scopes).not.toHaveBeenCalled();
  expect(shopify.callsTo(...LABEL_READS)).toEqual([]);
});

test("la pagina Regole carica l’entitlement autorevole per l’anteprima", async () => {
  shopify.addValidation(DEFAULT_CONFIG, true);

  const result = await rulesRoute.loader(get("/app/rules?locale=it"));

  expect(result.data).toMatchObject({ enabled: true, entitled: false });
  const serverTiming = new Headers(result.init?.headers).get("Server-Timing");
  expect(serverTiming).toMatch(/auth;dur=/);
  expect(serverTiming).toMatch(/d1_validation_state;dur=/);
  expect(serverTiming).not.toMatch(/d1_configuration_history/);
  expect(serverTiming).toMatch(/total;dur=/);
  // I tempi della riconciliazione confluiscono nello stesso header della pagina.
  expect(serverTiming).toMatch(/d1_commercial;dur=/);
  expect(
    new Headers(
      rulesRoute.headers({
        loaderHeaders: new Headers(result.init?.headers),
        parentHeaders: new Headers(),
      } as never),
    ).get("Server-Timing"),
  ).toBe(serverTiming);
  expect(shopify.callsTo("CfReadyHomeSnapshot")).toHaveLength(1);
  expect(shopify.callsTo("CfReadyContext", "CfReadyBilling")).toEqual([]);
});

test("Regole espone i duplicati e l'accesso osservati da Shopify", async () => {
  await entitle();
  const active = shopify.addValidation(CONFIGURED, true);
  shopify.addValidation(CONFIGURED, false);
  shopify.failNext("CfReadyValidationUpdate", new Error("Shopify non disponibile"));

  expect((await rulesRoute.loader(get("/app/rules?locale=en"))).data).toMatchObject({
    duplicateError: "duplicate_validations_active",
    entitled: true,
  });

  expect((await rulesRoute.loader(get("/app/rules?locale=en"))).data).toMatchObject({
    duplicateError: "duplicate_validations",
    entitled: true,
  });
  expect(active.enabled).toBe(false);
});

test("Regole legge D1 mentre la riconciliazione Shopify è ancora in corso", async () => {
  const stateRead = d1WithFault(env.DB, { sql: "checkout_labels_management_epoch" });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let hitsDuringReconcile = -1;
  shopify.beforeNext("CfReadyHomeSnapshot", async () => {
    await vi.waitFor(() => expect(stateRead.hits()).toBeGreaterThan(0));
    hitsDuringReconcile = stateRead.hits();
    await gate;
  });

  const loading = rulesRoute.loader(
    routeArgs(new Request("https://example.test/app/rules?locale=it"), stateRead.db),
  );
  await vi.waitFor(() => expect(hitsDuringReconcile).toBeGreaterThan(0));
  release();

  await expect(loading).resolves.toMatchObject({ data: { locale: "it" } });
});

test("Regole carica le etichette con l'intent differito solo se ci sono gli scope", async () => {
  const load = () =>
    rulesAction({ intent: "load_checkout_labels", taxCode: "unmanaged", pec: "unmanaged" });

  await expect(load()).resolves.toMatchObject({
    ok: true,
    loaded: { scopeGranted: false, snapshot: null, state: { mode: "off" }, errorCode: null },
  });
  expect(shopify.callsTo(...LABEL_READS)).toEqual([]);

  await enableCheckoutLabels(env.DB, shop, "automatic");
  await expect(load()).resolves.toMatchObject({
    ok: true,
    loaded: { scopeGranted: false, errorCode: "checkout_labels_scope_required" },
  });

  grantScopes(LABEL_SCOPES);
  await expect(load()).resolves.toMatchObject({
    ok: true,
    loaded: {
      scopeGranted: true,
      snapshot: { revision: expect.any(String) },
      state: { mode: "automatic" },
      errorCode: null,
    },
  });

  shopify.failNext("DiscoverCheckoutLabelContext", { errors: [{ message: "non disponibile" }] });
  await expect(load()).resolves.toMatchObject({
    ok: true,
    loaded: {
      scopeGranted: true,
      snapshot: null,
      state: { mode: "automatic" },
      errorCode: "checkout_labels_readback_failed",
    },
  });
});

test("Regole rifiuta intent e modalità estranee prima di leggere gli scope", async () => {
  await expect(rulesAction({ intent: "intent_sconosciuto" })).resolves.toEqual({
    ok: false,
    errorCode: "generic",
  });
  expect(boundary.scopes).not.toHaveBeenCalled();

  for (const values of [
    { taxCode: "x", pec: "unmanaged" },
    { taxCode: "unmanaged", pec: "x" },
  ]) {
    await expect(rulesAction(values)).resolves.toEqual({ ok: false, errorCode: "generic" });
  }
  expect(shopify.callsTo(...VALIDATION_WRITES)).toEqual([]);
});

test("Regole salva soltanto i campi ammessi e ignora il vecchio flag", async () => {
  await expect(
    saveRules({
      taxCode: "required_validated",
      pec: "required_when_company",
      errorDisplay: "preventive",
      address2Shown: "1",
      address2: "declared",
    }),
  ).resolves.toMatchObject({ ok: true });

  expect(storedConfig()).toMatchObject({
    rules: { taxCode: "required_validated", pec: "required_when_company" },
  });
  expect(storedConfig()).not.toHaveProperty("errorDisplay");
});

test.each([
  ["1", true],
  ["0", false],
])("Regole salva il blocco senza consegna: %s", async (value, expected) => {
  await saveRules({ ...REQUIRED_TAX_CODE, blockAbsentWithoutDelivery: value });

  expect(storedConfig().rules.blockAbsentWithoutDelivery).toBe(expected);
});

test("Regole segnala il conflitto senza riscrivere Shopify", async () => {
  shopify.addValidation(CONFIGURED);

  await expect(
    rulesAction({ taxCode: "unmanaged", pec: "unmanaged", configHash: "" }),
  ).resolves.toEqual({ ok: false, errorCode: "config_conflict" });

  expect(storedConfig().rules).toMatchObject(REQUIRED_TAX_CODE);
});

test("D-213: dove l'opzione non è disponibile il server non la attiva", async () => {
  boundary.orderNormalizationEnabled = false;
  grantScopes(ORDER_SCOPES);

  await expect(
    saveRules({ ...REQUIRED_TAX_CODE, normalizeOrderFields: "1", normalizeOrderFieldsBase: "" }),
  ).resolves.toEqual({ ok: false, errorCode: "generic" });
  await expect(rulesAction({ intent: "resume_order_normalization" })).resolves.toEqual({
    ok: false,
    errorCode: "generic",
  });

  expect(shopify.callsTo(...VALIDATION_WRITES)).toEqual([]);
  expect(shopify.state.webhooks).toEqual([]);
});

test("D-211: la sottoscrizione orders/create segue l'opzione per il singolo store", async () => {
  grantScopes(ORDER_SCOPES);
  const queue = { send: vi.fn(async () => undefined) } as unknown as Queue;
  const save = (normalize: string, base: string) =>
    saveRules(
      { ...REQUIRED_TAX_CODE, normalizeOrderFields: normalize, normalizeOrderFieldsBase: base },
      queue,
    );

  shopify.failNext("CfReadyOrderWebhooks", new Error("rete"));
  await expect(save("1", "")).resolves.toEqual({ ok: false, errorCode: "order_webhook_failed" });
  expect(shopify.callsTo(...VALIDATION_WRITES)).toEqual([]);

  await expect(save("1", "")).resolves.toMatchObject({ ok: true });
  await expect(save("1", "taxCode")).resolves.toMatchObject({ ok: true });
  expect(shopify.state.webhooks).toHaveLength(1);
  expect(shopify.callsTo("CfReadyOrderWebhooks")[0].variables.uri).toMatch(
    /^https:\/\/app\.example\.test\//,
  );

  // Con la spunta già spenta non c'è nulla da rimuovere.
  await expect(save("0", "")).resolves.toMatchObject({ ok: true });
  expect(shopify.state.webhooks).toHaveLength(1);

  // La rimozione è accessoria: se fallisce le regole restano salvate.
  shopify.failNext("CfReadyOrderWebhooks", new Error("rete"));
  await expect(save("0", "taxCode")).resolves.toMatchObject({ ok: true });
  expect(shopify.state.webhooks).toHaveLength(1);

  await expect(save("0", "taxCode")).resolves.toMatchObject({ ok: true });
  expect(shopify.state.webhooks).toEqual([]);
});

test("l'uniformazione ordini richiede gli scope e corregge gli ordini esistenti", async () => {
  const send = vi.fn(async () => undefined);
  const queue = { send } as unknown as Queue;
  const save = (rules: Record<string, string>, base: string) =>
    saveRules({ ...rules, normalizeOrderFields: "1", normalizeOrderFieldsBase: base }, queue);

  await expect(save(REQUIRED_TAX_CODE, "")).resolves.toEqual({
    ok: false,
    errorCode: "order_scopes_required",
  });
  expect(shopify.callsTo(...VALIDATION_WRITES)).toEqual([]);

  // Già attiva e scope revocati: le altre regole restano salvabili, senza nuova correzione.
  await expect(save(REQUIRED_TAX_CODE, "taxCode")).resolves.toMatchObject({ ok: true });
  expect(send).not.toHaveBeenCalled();

  grantScopes(ORDER_SCOPES);
  send.mockRejectedValueOnce(new Error("coda"));
  await expect(save(REQUIRED_TAX_CODE, "")).resolves.toMatchObject({ ok: true });
  expect(storedConfig().rules.normalizeOrderFields).toBe(true);
  expect(send).toHaveBeenCalledOnce();

  // Un campo che diventa gestito con l'opzione già attiva fa correggere anche gli esistenti.
  send.mockClear();
  await save({ taxCode: "required_validated", pec: "optional_validated" }, "taxCode");
  expect(send).toHaveBeenCalledOnce();
});

test("la correzione degli ordini riprende solo con scope, coda e sottoscrizione", async () => {
  const send = vi.fn(async () => undefined);
  const queue = { send } as unknown as Queue;
  const resume = (target?: Queue) => rulesAction({ intent: "resume_order_normalization" }, target);

  await expect(resume(queue)).resolves.toEqual({ ok: false, errorCode: "order_scopes_required" });

  grantScopes(ORDER_SCOPES);
  await expect(resume()).resolves.toEqual({ ok: false, errorCode: "generic" });

  shopify.failNext("CfReadyOrderWebhooks", new Error("rete"));
  await expect(resume(queue)).resolves.toEqual({
    ok: false,
    errorCode: "order_webhook_failed",
  });
  expect(send).not.toHaveBeenCalled();

  await expect(resume(queue)).resolves.toEqual({ ok: true, resumed: true });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ shop }));
  expect(shopify.state.webhooks).toHaveLength(1);
});

test("Regole restituisce il readback verificato e non rivalida quando è completo", async () => {
  await entitle();
  shopify.addValidation(CONFIGURED, true);

  const withoutLabels = await saveRules(REQUIRED_TAX_CODE);
  expect(withoutLabels).toMatchObject({
    ok: true,
    saved: {
      rules: REQUIRED_TAX_CODE,
      enabled: true,
      entitled: true,
      configHash: await currentHash(),
      labelScopesGranted: null,
      labelSnapshot: null,
    },
  });

  // La lingua principale è una conferma manuale: resa valida, resta solo la scrittura automatica.
  grantScopes(LABEL_SCOPES);
  const { revision, slots } = await labelSnapshot();
  const source = checkoutLabelSlotId(slot(slots, "taxCode", "it", "source"));
  await rulesAction({
    intent: "confirm_guided_labels",
    labelsRevision: revision,
    slotId: source,
  });
  const complete = await saveRules({
    ...REQUIRED_TAX_CODE,
    labelsEnabled: "1",
    labelsConfirmed: "1",
  });

  expect(complete).toMatchObject({
    ok: true,
    saved: {
      labelScopesGranted: true,
      labelSnapshot: { revision: expect.any(String) },
      guidedConfirmations: [{ slotId: source }],
      labelLoadError: null,
    },
  });
  expect(
    rulesRoute.shouldRevalidate({ actionResult: complete, defaultShouldRevalidate: true } as never),
  ).toBe(false);
});

test("Regole rivalida dopo una sincronizzazione delle etichette incompleta", async () => {
  await entitle();
  shopify.addValidation(CONFIGURED, true);
  grantScopes(LABEL_SCOPES);
  shopify.failNext("RegisterCheckoutLabelTranslations", {
    data: { translationsRegister: { translations: [], userErrors: [{ message: "rifiutata" }] } },
  });

  const incomplete = await saveRules({
    taxCode: "unmanaged",
    pec: "optional_validated",
    labelsEnabled: "1",
    labelsConfirmed: "1",
  });

  expect(incomplete).toEqual({ ok: true, labelsErrorCode: "checkout_labels_partial_sync" });
  expect(
    rulesRoute.shouldRevalidate({
      actionResult: incomplete,
      defaultShouldRevalidate: true,
    } as never),
  ).toBe(true);
});

test("BFS 4.1.5: Interno si salva con le regole, solo dopo una scrittura riuscita", async () => {
  const formMode = async () => (await readCheckoutLabelState(env.DB, shop)).address2FormMode;
  shopify.failNext("CfReadyValidationCreate", new Error("Shopify non disponibile"));
  await expect(saveRules({ ...REQUIRED_TAX_CODE, address2FormMode: "required" })).resolves.toEqual({
    ok: false,
    errorCode: "validation_write_failed",
  });
  expect(await formMode()).toBeNull();

  await expect(
    saveRules({ ...REQUIRED_TAX_CODE, address2FormMode: "hidden" }),
  ).resolves.toMatchObject({ ok: true });
  expect(await formMode()).toBe("hidden");

  await expect(
    saveRules({ ...REQUIRED_TAX_CODE, address2FormMode: "unexpected" }),
  ).resolves.toMatchObject({ ok: true });
  expect(await formMode()).toBe("hidden");
});

test.each([
  ["restore_address2_labels", { labelsRevision: "r1", slotId: "s" }],
  ["refresh_checkout_labels", { taxCode: "unmanaged", pec: "unmanaged" }],
  ["accept_address2_labels", { labelsRevision: "r1" }],
  ["confirm_guided_labels", { labelsRevision: "r1" }],
])("%s richiede gli scope delle etichette", async (intent, values) => {
  await expect(rulesAction({ intent, ...values })).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_scope_required",
  });
  expect(shopify.callsTo(...LABEL_READS)).toEqual([]);
});

test("il refresh rilegge le etichette con le modalità inviate e riporta i guasti", async () => {
  grantScopes(LABEL_SCOPES);
  const refresh = (taxCode: string) =>
    rulesAction({ intent: "refresh_checkout_labels", taxCode, pec: "unmanaged" });

  await expect(refresh("non_valido")).resolves.toEqual({ ok: false, errorCode: "generic" });

  const refreshed = await refresh("optional_validated");
  expect(refreshed).toMatchObject({
    ok: true,
    refreshed: {
      state: { mode: "off" },
      snapshot: { revision: (await labelSnapshot()).revision },
      guidedConfirmations: [],
    },
  });
  expect(
    rulesRoute.shouldRevalidate({
      actionResult: refreshed,
      defaultShouldRevalidate: true,
    } as never),
  ).toBe(false);
  expect(
    rulesRoute.shouldRevalidate({
      actionResult: { ok: true },
      defaultShouldRevalidate: true,
    } as never),
  ).toBe(true);

  shopify.failNext("DiscoverCheckoutLabelContext", { errors: [{ message: "non disponibile" }] });
  await expect(refresh("optional_validated")).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_readback_failed",
  });
});

test("il ripristino di Interno riscrive soltanto lo slot scelto sulla revisione letta", async () => {
  grantScopes(LABEL_SCOPES);
  shopify.setTranslation(CHECKOUT_LABEL_KEYS.address2, "en", "Tax code");
  shopify.setTranslation(CHECKOUT_LABEL_KEYS.optionalAddress2, "en", "Tax code");

  await expect(rulesAction({ intent: "restore_address2_labels" })).resolves.toEqual({
    ok: false,
    errorCode: "address2_restore_conflict",
  });

  const { revision, slots } = await labelSnapshot();
  await expect(
    rulesAction({
      intent: "restore_address2_labels",
      labelsRevision: revision,
      slotId: checkoutLabelSlotId(slot(slots, "address2", "en")),
    }),
  ).resolves.toEqual({ ok: true });

  expect(shopify.translation(CHECKOUT_LABEL_KEYS.address2, "en")).toBe("Apartment, suite, etc.");
  expect(shopify.translation(CHECKOUT_LABEL_KEYS.optionalAddress2, "en")).toBe("Tax code");
});

test("mantenere Interno richiede la revisione corrente", async () => {
  grantScopes(LABEL_SCOPES);
  const decision = async () => (await readCheckoutLabelState(env.DB, shop)).address2Decision;

  await expect(rulesAction({ intent: "accept_address2_labels" })).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_conflict",
  });
  expect(await decision()).toBe("pending");

  await expect(
    rulesAction({
      intent: "accept_address2_labels",
      labelsRevision: (await labelSnapshot()).revision,
    }),
  ).resolves.toEqual({ ok: true });
  expect(await decision()).toBe("accepted");
});

test("mantenere le etichette senza scope registra una scelta senza revisione", async () => {
  await expect(rulesAction({ intent: "accept_checkout_labels" })).resolves.toEqual({ ok: true });

  expect(await readCheckoutLabelState(env.DB, shop)).toMatchObject({
    decision: "accepted",
    acceptedRevision: null,
  });
});

test.each([[{}], [{ labelsRevision: "" }]])(
  "mantenere le etichette con gli scope richiede una revisione: %j",
  async (values) => {
    grantScopes(LABEL_SCOPES);

    await expect(rulesAction({ intent: "accept_checkout_labels", ...values })).resolves.toEqual({
      ok: false,
      errorCode: "checkout_labels_conflict",
    });
  },
);

test("mantenere le etichette con gli scope registra la revisione letta", async () => {
  grantScopes(LABEL_SCOPES);
  const { revision } = await labelSnapshot();

  await expect(
    rulesAction({ intent: "accept_checkout_labels", labelsRevision: revision }),
  ).resolves.toEqual({ ok: true });

  expect(await readCheckoutLabelState(env.DB, shop)).toMatchObject({
    decision: "accepted",
    acceptedRevision: revision,
  });
});

test("la conferma guidata usa le regole correnti di Shopify", async () => {
  await entitle();
  shopify.addValidation(CONFIGURED, true);
  grantScopes(LABEL_SCOPES);
  shopify.setTranslation(CHECKOUT_LABEL_KEYS.taxCode, "it", "Codice fiscale");

  await expect(rulesAction({ intent: "confirm_guided_labels" })).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_conflict",
  });

  const { revision, slots } = await labelSnapshot();
  const guided = slot(slots, "taxCode", "it");
  await expect(
    rulesAction({
      intent: "confirm_guided_labels",
      labelsRevision: revision,
      slotId: checkoutLabelSlotId(guided),
    }),
  ).resolves.toEqual({ ok: true });

  const loaded = await rulesAction({
    intent: "refresh_checkout_labels",
    ...REQUIRED_TAX_CODE,
  });
  expect(loaded).toMatchObject({
    refreshed: { guidedConfirmations: [{ slotId: checkoutLabelSlotId(guided) }] },
  });
});

test("Regole salva senza etichette quando gli scope non sono leggibili", async () => {
  boundary.scopes.mockRejectedValueOnce(new Error("scope non disponibile"));

  await expect(
    saveRules({ taxCode: "unmanaged", pec: "optional_validated" }),
  ).resolves.toMatchObject({ ok: true });

  expect(storedConfig().rules.pec).toBe("optional_validated");
});

test("Regole rifiuta una revisione etichette superata senza salvare le regole", async () => {
  grantScopes(LABEL_SCOPES);

  await expect(
    saveRules({
      taxCode: "required_validated",
      pec: "optional_validated",
      labelsEnabled: "1",
      labelsRevision: "superata",
    }),
  ).resolves.toEqual({ ok: false, errorCode: "checkout_labels_conflict" });

  expect(shopify.callsTo(...VALIDATION_WRITES)).toEqual([]);
});

test("Regole conserva il salvataggio dopo la revoca degli scope", async () => {
  await enableCheckoutLabels(env.DB, shop, "automatic");

  await expect(saveRules({ taxCode: "unmanaged", pec: "optional_validated" })).resolves.toEqual({
    ok: true,
    labelsErrorCode: "checkout_labels_scope_required",
  });
  expect(storedConfig().rules.pec).toBe("optional_validated");

  await expect(
    saveRules({ taxCode: "required_validated", pec: "optional_validated", labelsEnabled: "1" }),
  ).resolves.toEqual({ ok: false, errorCode: "checkout_labels_scope_required" });

  await expect(
    rulesAction({ taxCode: "unmanaged", pec: "unmanaged", configHash: "" }),
  ).resolves.toEqual({ ok: false, errorCode: "config_conflict" });
});

test("il callback auth inoltra la richiesta a Shopify e propaga il rifiuto", async () => {
  const request = new Request(`https://example.test/auth/callback?shop=${shop}`);

  expect(await authRoute.loader(routeArgs(request))).toBeNull();
  expect(boundary.admin).toHaveBeenCalledWith(request);

  const denied = new Response(null, { status: 401 });
  boundary.admin.mockRejectedValueOnce(denied);
  await expect(authRoute.loader(routeArgs(request))).rejects.toBe(denied);
});
