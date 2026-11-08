import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  CHECKOUT_LABEL_KEYS as KEYS,
  checkoutLabelSlotId,
  type CheckoutLabelSlot,
} from "../app/checkout-labels/domain";
import {
  claimCheckoutLabelSlot,
  confirmGuidedCheckoutLabelSlots,
  enableCheckoutLabels,
  persistCheckoutLabelObservation,
  readCheckoutLabelState,
  readStoredCheckoutLabelSlots,
  saveAddress2Decision,
  saveAddress2FormMode,
  saveCheckoutLabelsDecision,
  saveCheckoutLabelWrite,
} from "../app/checkout-labels/repository.server";
import {
  acceptAddress2Customization,
  acceptCheckoutLabelsCustomization,
  confirmGuidedCheckoutLabels,
  loadCheckoutLabels,
  restoreAddress2Translations,
  saveRulesAndCheckoutLabels,
} from "../app/checkout-labels/service.server";
import { readCheckoutLabels } from "../app/checkout-labels/shopify.server";
import { DEFAULT_CONFIG, readConfig } from "../app/config";
import { configHash } from "../app/validation/domain";
import { acquireValidationLock } from "../app/validation/lock.server";
import { d1WithFault } from "./support/d1-fault";
import { merchant } from "./support/merchant";
import type { ShopifyAdminFake } from "./support/shopify-admin";

const RULES = { taxCode: "required_validated", pec: "optional_validated" } as const;
const TAX_ONLY = { taxCode: "required_validated", pec: "unmanaged" } as const;
const UNMANAGED = { taxCode: "unmanaged", pec: "unmanaged" } as const;
const EN_TAX = "Italian tax code";
const EN_PEC = "Certified email address (PEC) (optional)";
const READ = "DiscoverCheckoutLabelContext";
const REGISTER = "RegisterCheckoutLabelTranslations";
const REMOVE = "RemoveCheckoutLabelTranslations";
const VALIDATION_WRITES = ["CfReadyValidationCreate", "CfReadyValidationUpdate"];
const STALE_DIGEST = {
  data: {
    translationsRegister: { translations: [], userErrors: [{ message: "digest outdated" }] },
  },
};
const READ_FAILURE = { errors: [{ message: "non disponibile" }] };

let shop: string;
let shopify: ShopifyAdminFake;

beforeEach(async () => {
  ({ shop, shopify } = await merchant("labels"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const state = () => readCheckoutLabelState(env.DB, shop);
const snapshot = () => readCheckoutLabels(shopify.admin);
const load = (rules: typeof RULES | typeof TAX_ONLY | typeof UNMANAGED = RULES) =>
  loadCheckoutLabels(shopify.admin, env.DB, shop, rules);
const save = (overrides = {}) =>
  saveRulesAndCheckoutLabels(shopify.admin, env.DB, shop, {
    rules: RULES,
    expectedConfigHash: null,
    labelsEnabled: true,
    confirmAutomaticWrite: true,
    expectedLabelsRevision: null,
    ...overrides,
  });
const restore = (revision: string, ids: string[]) =>
  restoreAddress2Translations(shopify.admin, env.DB, shop, revision, ids);

async function slotOf(
  name: CheckoutLabelSlot["name"],
  locale = "en",
  kind: CheckoutLabelSlot["kind"] = "global_translation",
) {
  const found = (await snapshot()).slots.find(
    (entry) => entry.name === name && entry.locale === locale && entry.kind === kind,
  );
  if (!found) throw new Error(`slot ${name}/${locale}/${kind} assente`);
  return found;
}

async function observe() {
  await persistCheckoutLabelObservation(env.DB, shop, (await snapshot()).slots);
}

// Porta D1 allo stato di uno slot già scritto da CF Ready nell'epoca indicata.
async function own(
  name: "taxCode" | "pec",
  epoch: string,
  written: string | null | undefined = undefined,
) {
  const slot = await slotOf(name);
  await claimCheckoutLabelSlot(env.DB, shop, slot, epoch);
  if (written !== undefined) await saveCheckoutLabelWrite(env.DB, shop, slot, written);
  return slot;
}

function alignEnglish(tax: string | null = EN_TAX, pec: string | null = EN_PEC) {
  shopify.setTranslation(KEYS.taxCode, "en", tax);
  shopify.setTranslation(KEYS.pec, "en", pec);
}

// La lingua principale non si scrive: le manca solo la conferma del merchant.
async function confirmSources() {
  shopify.state.labels[KEYS.pec] = "PEC (facoltativa)";
  await observe();
  const sources = (await snapshot()).slots.filter(
    (slot) => slot.kind === "source" && (slot.name === "taxCode" || slot.name === "pec"),
  );
  await confirmGuidedCheckoutLabelSlots(env.DB, shop, sources);
}

async function holdLease() {
  expect(await acquireValidationLock(env.DB, shop)).toEqual(expect.any(String));
}

// Il rinnovo della lease fallisce quando scatta il timer: `tick` lo fa scattare subito.
function leaseRenewalFails() {
  const handlers: (() => void)[] = [];
  vi.spyOn(globalThis, "setInterval").mockImplementation((handler) => {
    handlers.push(handler as () => void);
    return 1 as unknown as ReturnType<typeof setInterval>;
  });
  const fault = d1WithFault(env.DB, {
    sql: "UPDATE validation_operation_locks",
    first: () => null,
  });
  return { db: fault.db, tick: () => handlers.forEach((handler) => handler()) };
}

// Lascia avanzare i ritardi di rilettura mentre le chiamate a D1 restano reali.
async function settle<T>(pending: Promise<T>) {
  let done = false;
  void pending.finally(() => {
    done = true;
  });
  while (!done) await vi.advanceTimersByTimeAsync(400);
  return pending;
}

test("il caricamento riusa lo snapshot preletto", async () => {
  const prefetched = await snapshot();
  const reads = shopify.callsTo(READ).length;

  await expect(
    loadCheckoutLabels(shopify.admin, env.DB, shop, RULES, prefetched),
  ).resolves.toMatchObject({ available: true, snapshot: prefetched });

  expect(shopify.callsTo(READ)).toHaveLength(reads);
});

test("il caricamento salva il readback e riporta la conferma guidata valida", async () => {
  alignEnglish();
  await confirmSources();
  const epoch = await enableCheckoutLabels(env.DB, shop, "partial");
  await own("taxCode", epoch, EN_TAX);
  await own("pec", epoch, EN_PEC);
  const source = await slotOf("taxCode", "it", "source");

  const result = await load();

  expect(result).toMatchObject({
    available: true,
    externalChange: false,
    state: { mode: "partial", lastErrorCode: null, lastSyncAt: expect.any(String) },
  });
  expect(result).toHaveProperty(
    "guidedConfirmations",
    expect.arrayContaining([expect.objectContaining({ slotId: checkoutLabelSlotId(source) })]),
  );
  const stored = await readStoredCheckoutLabelSlots(env.DB, shop);
  expect(stored.find(({ key, locale }) => key === KEYS.taxCode && locale === "en")).toMatchObject({
    lastObservedValue: EN_TAX,
  });
});

test("cambiare la regola attesa invalida la conferma guidata", async () => {
  await confirmSources();

  await expect(load({ ...RULES, taxCode: "optional_validated" } as never)).resolves.toMatchObject({
    guidedConfirmations: [expect.objectContaining({ slotId: expect.stringContaining(KEYS.pec) })],
  });
});

test("il caricamento inattivo osserva senza aggiornare lo stato di gestione", async () => {
  await expect(load()).resolves.toMatchObject({ available: true, externalChange: false });

  expect(await state()).toMatchObject({ mode: "off", lastErrorCode: null, lastSyncAt: null });
  expect(await readStoredCheckoutLabelSlots(env.DB, shop)).not.toEqual([]);
});

test("una scelta di mantenere le etichette scade se cambia lo snapshot", async () => {
  await saveCheckoutLabelsDecision(env.DB, shop, "accepted", "revisione-precedente");

  await load();

  expect(await state()).toMatchObject({ decision: "pending", acceptedRevision: null });
});

test("mantenere le etichette vale solo sulla revisione corrente e a gestione spenta", async () => {
  const { revision } = await snapshot();
  const accept = (expected: string | null) =>
    acceptCheckoutLabelsCustomization(shopify.admin, env.DB, shop, expected);

  await expect(accept(revision)).resolves.toEqual({ ok: true });
  expect(await state()).toMatchObject({ decision: "accepted", acceptedRevision: revision });
  expect(await readStoredCheckoutLabelSlots(env.DB, shop)).not.toEqual([]);

  await expect(accept(null)).resolves.toEqual({ ok: true });
  expect(await state()).toMatchObject({ decision: "accepted", acceptedRevision: null });

  await expect(accept("superata")).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_conflict",
  });

  await enableCheckoutLabels(env.DB, shop, "guided");
  await expect(accept(revision)).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_conflict",
  });

  await holdLease();
  await expect(accept(revision)).resolves.toEqual({ ok: false, errorCode: "validation_locked" });
});

test("il caricamento attivo segnala una conferma guidata ancora assente", async () => {
  alignEnglish();
  await enableCheckoutLabels(env.DB, shop, "guided");

  await expect(load()).resolves.toMatchObject({ available: true, externalChange: false });

  expect(await state()).toMatchObject({ lastErrorCode: "checkout_labels_confirmation_pending" });
});

test("le etichette automatiche mai gestite chiedono conferma senza scrivere", async () => {
  await enableCheckoutLabels(env.DB, shop, "guided");
  await observe();

  await load();
  expect(await state()).toMatchObject({ lastErrorCode: "checkout_labels_confirmation_required" });

  await expect(save({ confirmAutomaticWrite: false })).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_confirmation_required",
  });

  expect(shopify.callsTo(REGISTER, ...VALIDATION_WRITES)).toEqual([]);
  expect((await readStoredCheckoutLabelSlots(env.DB, shop)).some((s) => s.managementEpoch)).toBe(
    false,
  );
});

test("una scrittura incompleta è un errore solo nell'epoca corrente", async () => {
  shopify.setTranslation(KEYS.taxCode, "en", "Etichetta precedente");
  await enableCheckoutLabels(env.DB, shop, "automatic");

  await own("taxCode", "epoca-precedente");
  await load(TAX_ONLY);
  expect(await state()).toMatchObject({ lastErrorCode: "checkout_labels_confirmation_required" });
});

test("nell'epoca corrente una scrittura iniziata e incompleta resta parziale", async () => {
  shopify.setTranslation(KEYS.taxCode, "en", "Etichetta precedente");
  const epoch = await enableCheckoutLabels(env.DB, shop, "automatic");

  await own("taxCode", epoch);
  await load();

  // Anche la PEC, mai scritta, non deve nascondere la scrittura già iniziata.
  expect(await state()).toMatchObject({ lastErrorCode: "checkout_labels_partial_sync" });
});

test("il caricamento conserva l'errore della chiave fiscale mancante", async () => {
  alignEnglish();
  await enableCheckoutLabels(env.DB, shop, "guided");
  delete shopify.state.labels[KEYS.pec];

  await expect(load()).resolves.toMatchObject({ available: true, externalChange: false });

  expect(await state()).toMatchObject({ lastErrorCode: "checkout_labels_resource_missing" });
});

test("il caricamento ignora slot fuori epoca e riconosce un'assenza già scritta", async () => {
  alignEnglish();
  const epoch = await enableCheckoutLabels(env.DB, shop, "automatic");
  await own("taxCode", epoch, null);
  await own("pec", "altra-epoca", EN_PEC);
  shopify.setTranslation(KEYS.taxCode, "en", null);
  shopify.setTranslation(KEYS.pec, "en", "Modificata altrove");

  await expect(load()).resolves.toMatchObject({ available: true, externalChange: false });
});

test("una modifica esterna a un'etichetta gestita è un conflitto", async () => {
  alignEnglish("Modifica esterna");
  const epoch = await enableCheckoutLabels(env.DB, shop, "automatic");
  await own("taxCode", epoch, EN_TAX);

  await expect(load()).resolves.toMatchObject({ available: true, externalChange: true });

  expect(await state()).toMatchObject({ lastErrorCode: "checkout_labels_conflict" });
});

async function acceptInterno(mode: "required" | "hidden" = "required") {
  await saveAddress2Decision(env.DB, shop, "accepted");
  await saveAddress2FormMode(env.DB, shop, mode);
}

test("Interno accettato rileva una variante cambiata, aggiunta o rimossa", async () => {
  shopify.setTranslation(KEYS.address2, "en", "Interno");
  await observe();
  await acceptInterno();
  await expect(load()).resolves.toMatchObject({ externalChange: false });

  shopify.setTranslation(KEYS.address2, "en", "Codice fiscale");
  await expect(load()).resolves.toMatchObject({ externalChange: true });
  expect((await state()).address2ExternalChangeAt).toEqual(expect.any(String));

  shopify.setTranslation(KEYS.address2, "it", "Scala");
  await expect(load()).resolves.toMatchObject({ externalChange: true });

  delete shopify.state.labels[KEYS.address2];
  await expect(load()).resolves.toMatchObject({ externalChange: true });
});

test("un override di mercato assente conserva il valore ereditato accettato", async () => {
  shopify.state.markets.push({ id: "gid://shopify/Market/1", name: "Italia", locales: ["it"] });
  await observe();
  await acceptInterno();

  await expect(load()).resolves.toMatchObject({ available: true, externalChange: false });
});

test("Interno nascosto e la variante non attiva non generano conflitti", async () => {
  await observe();
  shopify.setTranslation(KEYS.optionalAddress2, "en", "Modifica esterna");

  await acceptInterno("required");
  await expect(load()).resolves.toMatchObject({ externalChange: false });

  shopify.setTranslation(KEYS.address2, "en", "Modifica esterna");
  await acceptInterno("hidden");
  await expect(load()).resolves.toMatchObject({ externalChange: false });
});

test("il caricamento riduce un errore Shopify a un codice applicativo", async () => {
  shopify.failNext(READ, READ_FAILURE);

  await expect(load()).resolves.toMatchObject({
    available: false,
    errorCode: "checkout_labels_readback_failed",
  });
});

test("il salvataggio rispetta lease, readback e revisione prima di scrivere", async () => {
  shopify.failNext(READ, READ_FAILURE);
  await expect(save()).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_readback_failed",
  });
  expect(await state()).toMatchObject({ lastErrorCode: "checkout_labels_readback_failed" });

  await expect(save({ expectedLabelsRevision: "superata" })).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_conflict",
  });

  await holdLease();
  await expect(save()).resolves.toEqual({ ok: false, errorCode: "validation_locked" });

  expect(shopify.callsTo(REGISTER, ...VALIDATION_WRITES)).toEqual([]);
});

test("senza gestione etichette si scrive soltanto la Validation", async () => {
  const messages = structuredClone(DEFAULT_CONFIG.messages);
  messages.it.taxCodeRequired = "CF richiesto";

  await expect(save({ labelsEnabled: false, messages })).resolves.toMatchObject({
    ok: true,
    labelsErrorCode: null,
  });

  expect(shopify.callsTo(READ, REGISTER)).toEqual([]);
  expect(readConfig(shopify.state.validations[0].config)).toMatchObject({
    rules: RULES,
    messages: { it: { taxCodeRequired: "CF richiesto" } },
  });

  await expect(save({ labelsEnabled: false, expectedConfigHash: "superato" })).resolves.toEqual({
    ok: false,
    errorCode: "config_conflict",
  });
});

test("una lease già persa ferma il salvataggio", async () => {
  const lease = leaseRenewalFails();
  vi.mocked(setInterval).mockImplementation((handler) => {
    (handler as () => void)();
    return 1 as unknown as ReturnType<typeof setInterval>;
  });

  await expect(
    saveRulesAndCheckoutLabels(shopify.admin, lease.db, shop, {
      rules: RULES,
      expectedConfigHash: null,
      labelsEnabled: true,
      confirmAutomaticWrite: true,
      expectedLabelsRevision: null,
    }),
  ).resolves.toEqual({ ok: false, errorCode: "validation_locked" });
  expect(shopify.calls).toEqual([]);
});

test("una lease persa durante la lettura ferma la scrittura delle etichette", async () => {
  const lease = leaseRenewalFails();
  shopify.beforeNext(READ, lease.tick);

  await expect(
    saveRulesAndCheckoutLabels(shopify.admin, lease.db, shop, {
      rules: RULES,
      expectedConfigHash: null,
      labelsEnabled: true,
      confirmAutomaticWrite: true,
      expectedLabelsRevision: null,
    }),
  ).resolves.toEqual({ ok: false, errorCode: "validation_locked" });

  expect(shopify.callsTo(REGISTER, ...VALIDATION_WRITES)).toEqual([]);
});

test("un conflitto posseduto ferma il salvataggio prima della Validation", async () => {
  alignEnglish("Modifica esterna");
  const epoch = await enableCheckoutLabels(env.DB, shop, "automatic");
  await own("taxCode", epoch, EN_TAX);

  await expect(save()).resolves.toEqual({ ok: false, errorCode: "checkout_labels_conflict" });

  expect(shopify.callsTo(REGISTER, ...VALIDATION_WRITES)).toEqual([]);
});

test("un digest scaduto due volte fallisce chiuso", async () => {
  shopify.failNext(REGISTER, STALE_DIGEST);
  shopify.failNext(REGISTER, STALE_DIGEST);

  await expect(save()).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_stale_digest",
  });

  expect(shopify.callsTo(REGISTER)).toHaveLength(2);
  expect(shopify.callsTo(...VALIDATION_WRITES)).toEqual([]);
});

test("il retry su digest scaduto rilegge Shopify e completa la sincronizzazione", async () => {
  await confirmSources();
  shopify.failNext(REGISTER, STALE_DIGEST);

  await expect(save()).resolves.toMatchObject({ ok: true, labelsErrorCode: null });

  expect(shopify.translation(KEYS.taxCode, "en")).toBe(EN_TAX);
  expect(shopify.translation(KEYS.pec, "en")).toBe(EN_PEC);
});

test("etichette già allineate e slot fuori epoca non generano modifiche", async () => {
  alignEnglish();
  await confirmSources();
  const epoch = await enableCheckoutLabels(env.DB, shop, "automatic");
  await own("taxCode", `${epoch}-precedente`, EN_TAX);

  await expect(save()).resolves.toMatchObject({
    ok: true,
    saved: { rules: RULES },
    labelsErrorCode: null,
    labels: { available: true, snapshot: await snapshot() },
  });
  expect(shopify.callsTo(REGISTER)).toEqual([]);

  await expect(
    save({
      rules: UNMANAGED,
      expectedConfigHash: await configHash(shopify.state.validations[0].config),
    }),
  ).resolves.toMatchObject({
    ok: true,
    labelsErrorCode: null,
  });
  expect(shopify.callsTo(REMOVE)).toEqual([]);
});

test("la prima scrittura automatica chiede conferma e sincronizza attorno alla Validation", async () => {
  await confirmSources();

  await expect(save({ confirmAutomaticWrite: false })).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_confirmation_required",
  });
  expect(shopify.callsTo(REGISTER)).toEqual([]);

  await expect(save()).resolves.toMatchObject({ ok: true, labelsErrorCode: null });

  // Il campo obbligatorio cambia prima della Validation, quello facoltativo dopo.
  const operations = shopify.calls.map(({ operation }) => operation);
  const writes = operations.filter((name) => name === REGISTER || name === VALIDATION_WRITES[0]);
  expect(writes).toEqual([REGISTER, VALIDATION_WRITES[0], REGISTER]);
  expect(await state()).toMatchObject({
    mode: "partial",
    lastErrorCode: null,
    lastSyncAt: expect.any(String),
  });
});

test("non chiede conferma quando l'attivazione non cambia etichette automatiche", async () => {
  alignEnglish();
  await confirmSources();

  await expect(save({ confirmAutomaticWrite: false })).resolves.toMatchObject({
    ok: true,
    labelsErrorCode: null,
  });

  expect(shopify.callsTo(REGISTER)).toEqual([]);
});

test("un errore dopo la Validation produce una sincronizzazione parziale", async () => {
  alignEnglish(EN_TAX, "PEC");
  shopify.failNext(REGISTER, {
    data: { translationsRegister: { translations: [], userErrors: [{ message: "rifiutata" }] } },
  });

  await expect(save()).resolves.toEqual({
    ok: true,
    labelsErrorCode: "checkout_labels_partial_sync",
  });

  expect(shopify.callsTo(...VALIDATION_WRITES)).toHaveLength(1);
  expect(await state()).toMatchObject({
    mode: "partial",
    lastErrorCode: "checkout_labels_partial_sync",
  });
});

test("un readback finale divergente resta recuperabile", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  await confirmSources();
  alignEnglish(EN_TAX, "PEC");
  shopify.holdWrites();
  const readsBefore = shopify.callsTo(READ).length;

  await expect(settle(save())).resolves.toEqual({
    ok: true,
    labelsErrorCode: "checkout_labels_partial_sync",
  });

  // Lettura iniziale, lettura dopo la Validation e tre letture del readback con i due ricontrolli.
  expect(shopify.callsTo(READ).length - readsBefore).toBe(5);
  expect(await state()).toMatchObject({
    mode: "partial",
    lastErrorCode: "checkout_labels_partial_sync",
  });
});

test("una rilettura non ancora aggiornata non segnala una sincronizzazione parziale", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  await confirmSources();
  alignEnglish(EN_TAX, "PEC");
  shopify.holdWrites();
  // Il primo ricontrollo del readback vede già la scrittura: lettura iniziale, finale, readback.
  for (const effect of [() => undefined, () => undefined, () => undefined, shopify.releaseWrites]) {
    shopify.beforeNext(READ, effect);
  }

  await expect(settle(save())).resolves.toMatchObject({ ok: true, labelsErrorCode: null });

  expect(shopify.callsTo(REGISTER)).toHaveLength(1);
  expect(await state()).toMatchObject({ lastErrorCode: null, lastSyncAt: expect.any(String) });
});

test("conferme guidate mancanti non sono una sincronizzazione parziale", async () => {
  alignEnglish();

  await expect(save()).resolves.toEqual({
    ok: true,
    labelsErrorCode: "checkout_labels_confirmation_pending",
  });

  expect(await state()).toMatchObject({
    lastErrorCode: "checkout_labels_confirmation_pending",
  });
});

test("la disattivazione rimuove un'etichetta posseduta e invariata", async () => {
  alignEnglish();
  const epoch = await enableCheckoutLabels(env.DB, shop, "automatic");
  shopify.setTranslation(KEYS.taxCode, "en", null);
  await own("taxCode", epoch);
  shopify.setTranslation(KEYS.taxCode, "en", EN_TAX);
  await saveCheckoutLabelWrite(env.DB, shop, await slotOf("taxCode"), EN_TAX);

  await expect(save({ labelsEnabled: false })).resolves.toMatchObject({
    ok: true,
    labelsErrorCode: null,
  });

  expect(shopify.translation(KEYS.taxCode, "en")).toBeNull();
  expect(shopify.translation(KEYS.pec, "en")).toBe(EN_PEC);
  expect(await state()).toMatchObject({ mode: "off" });
});

test("la disattivazione non tocca un'etichetta modificata altrove", async () => {
  alignEnglish();
  const epoch = await enableCheckoutLabels(env.DB, shop, "automatic");
  await own("taxCode", epoch, "Altro");

  await expect(save({ labelsEnabled: false })).resolves.toMatchObject({
    ok: true,
    labelsErrorCode: "checkout_labels_conflict",
  });

  expect(shopify.callsTo(REGISTER, REMOVE)).toEqual([]);
  expect(await state()).toMatchObject({ mode: "partial" });
});

test("la disattivazione senza epoca o con slot estranei non scrive", async () => {
  alignEnglish();
  await enableCheckoutLabels(env.DB, shop, "automatic");
  await own("taxCode", "epoca-estranea", EN_TAX);

  await expect(save({ labelsEnabled: false })).resolves.toMatchObject({
    ok: true,
    labelsErrorCode: null,
  });

  expect(shopify.callsTo(REGISTER, REMOVE)).toEqual([]);
  expect(await state()).toMatchObject({ mode: "off" });
});

test("la disattivazione si ferma se la lease scade dopo la Validation", async () => {
  alignEnglish();
  const epoch = await enableCheckoutLabels(env.DB, shop, "automatic");
  await own("taxCode", epoch, EN_TAX);
  const lease = leaseRenewalFails();
  shopify.beforeNext(VALIDATION_WRITES[0], lease.tick);

  await expect(
    saveRulesAndCheckoutLabels(shopify.admin, lease.db, shop, {
      rules: RULES,
      expectedConfigHash: null,
      labelsEnabled: false,
      confirmAutomaticWrite: true,
      expectedLabelsRevision: null,
    }),
  ).resolves.toMatchObject({ ok: true, labelsErrorCode: "validation_locked" });

  expect(shopify.callsTo(REMOVE)).toEqual([]);
});

test("il ripristino automatico riporta il valore originario", async () => {
  await confirmSources();
  shopify.setTranslation(KEYS.taxCode, "en", "Tax ID");
  const epoch = await enableCheckoutLabels(env.DB, shop, "automatic");
  await own("taxCode", epoch);
  shopify.setTranslation(KEYS.taxCode, "en", EN_TAX);
  await saveCheckoutLabelWrite(env.DB, shop, await slotOf("taxCode"), EN_TAX);

  await expect(save({ rules: UNMANAGED })).resolves.toMatchObject({
    ok: true,
    labelsErrorCode: null,
  });

  expect(shopify.translation(KEYS.taxCode, "en")).toBe("Tax ID");
});

test("il ripristino di Interno rifiuta revisione superata, selezione vuota e lease occupata", async () => {
  await expect(restore("superata", ["assente"])).resolves.toEqual({
    ok: false,
    errorCode: "address2_restore_conflict",
  });
  await expect(restore((await snapshot()).revision, [])).resolves.toEqual({
    ok: false,
    errorCode: "address2_restore_conflict",
  });

  await holdLease();
  await expect(restore("qualsiasi", [])).resolves.toEqual({
    ok: false,
    errorCode: "validation_locked",
  });
  expect(shopify.callsTo(REGISTER)).toEqual([]);
});

test("il ripristino di Interno scrive traduzione e override di mercato", async () => {
  const market = "gid://shopify/Market/1";
  shopify.state.markets.push({ id: market, name: "Estero", locales: ["en"] });
  shopify.setTranslation(KEYS.address2, "en", "Codice fiscale");
  shopify.setTranslation(KEYS.address2, "en", "Tax code", market);
  // La lingua principale resta da correggere a mano, nell'editor Shopify.
  shopify.state.labels[KEYS.address2] = "Codice fiscale";
  const { revision, slots } = await snapshot();
  const selected = slots.filter(
    (slot) => slot.name === "address2" && slot.locale === "en" && slot.kind !== "source",
  );
  expect(selected).toHaveLength(2);

  await expect(restore(revision, selected.map(checkoutLabelSlotId))).resolves.toEqual({ ok: true });

  expect(shopify.translation(KEYS.address2, "en")).toBe("Apartment, suite, etc.");
  expect(shopify.translation(KEYS.address2, "en", market)).toBe("Apartment, suite, etc.");
  expect(await state()).toMatchObject({ address2Decision: "manual_restore_required" });
});

test("il ripristino di Interno si ferma se la lease è persa", async () => {
  shopify.setTranslation(KEYS.address2, "en", "Codice fiscale");
  const slot = await slotOf("address2");
  const { revision } = await snapshot();
  const lease = leaseRenewalFails();
  shopify.beforeNext(READ, lease.tick);

  await expect(
    restoreAddress2Translations(shopify.admin, lease.db, shop, revision, [
      checkoutLabelSlotId(slot),
    ]),
  ).resolves.toEqual({ ok: false, errorCode: "validation_locked" });

  expect(shopify.callsTo(REGISTER)).toEqual([]);
});

test("il ripristino rifiuta un readback divergente e normalizza gli errori", async () => {
  shopify.setTranslation(KEYS.address2, "en", "Codice fiscale");
  const slot = await slotOf("address2");
  const { revision } = await snapshot();
  shopify.holdWrites();

  await expect(restore(revision, [checkoutLabelSlotId(slot)])).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_readback_failed",
  });

  shopify.failNext(READ, READ_FAILURE);
  await expect(restore(revision, [checkoutLabelSlotId(slot)])).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_readback_failed",
  });
});

test("il ripristino della variante facoltativa registra lo stato ripristinato", async () => {
  shopify.setTranslation(KEYS.optionalAddress2, "en", "Codice fiscale");
  const slot = await slotOf("optionalAddress2");

  await expect(restore((await snapshot()).revision, [checkoutLabelSlotId(slot)])).resolves.toEqual({
    ok: true,
  });

  expect(shopify.translation(KEYS.optionalAddress2, "en")).toBe(
    "Apartment, suite, etc. (optional)",
  );
  expect(await state()).toMatchObject({ address2Decision: "restored" });
});

test("la decisione di mantenere Interno richiede la revisione corrente", async () => {
  const accept = (revision: string) =>
    acceptAddress2Customization(shopify.admin, env.DB, shop, revision);

  await expect(accept("superata")).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_conflict",
  });
  expect(await state()).toMatchObject({ address2Decision: "pending" });

  const { revision } = await snapshot();
  await expect(accept(revision)).resolves.toEqual({ ok: true });
  expect(await state()).toMatchObject({ address2Decision: "accepted" });
  expect(await readStoredCheckoutLabelSlots(env.DB, shop)).not.toEqual([]);

  await holdLease();
  await expect(accept(revision)).resolves.toEqual({ ok: false, errorCode: "validation_locked" });
});

test("la conferma guidata è legata a revisione, tuple e valore osservato", async () => {
  alignEnglish();
  const confirm = (revision: string, ids: string[]) =>
    confirmGuidedCheckoutLabels(shopify.admin, env.DB, shop, TAX_ONLY, revision, ids);
  const guided = await slotOf("taxCode", "it", "source");
  const id = checkoutLabelSlotId(guided);
  const current = (await snapshot()).revision;

  await expect(confirm("superata", [id])).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_conflict",
  });
  await expect(confirm(current, [])).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_conflict",
  });

  shopify.state.labels[KEYS.taxCode] = "Altro testo";
  const mismatched = checkoutLabelSlotId(await slotOf("taxCode", "it", "source"));
  await expect(confirm((await snapshot()).revision, [mismatched])).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_confirmation_pending",
  });
  shopify.state.labels[KEYS.taxCode] = guided.currentValue!;

  await enableCheckoutLabels(env.DB, shop, "guided");
  await expect(confirm(current, [id])).resolves.toEqual({ ok: true });
  expect(await state()).toMatchObject({ lastErrorCode: null, lastSyncAt: expect.any(String) });
  expect(
    (await readStoredCheckoutLabelSlots(env.DB, shop)).find(
      ({ key, kind }) => key === KEYS.taxCode && kind === "source",
    ),
  ).toMatchObject({ guidedConfirmedValue: "Codice fiscale" });

  shopify.failNext(READ, READ_FAILURE);
  await expect(confirm(current, [id])).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_readback_failed",
  });

  await holdLease();
  await expect(confirm(current, [id])).resolves.toEqual({
    ok: false,
    errorCode: "validation_locked",
  });
});
