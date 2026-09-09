import { beforeEach, expect, test, vi } from "vitest";
import {
  CHECKOUT_LABEL_KEYS,
  checkoutLabelSlotId,
  type CheckoutLabelSlot,
} from "../app/checkout-labels/domain";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  confirmGuided: vi.fn(),
  enable: vi.fn(),
  mark: vi.fn(),
  persist: vi.fn(),
  readLabels: vi.fn(),
  readState: vi.fn(),
  readStored: vi.fn(),
  register: vi.fn(),
  remove: vi.fn(),
  saveDecision: vi.fn(),
  saveWrite: vi.fn(),
  stop: vi.fn(),
  withLock: vi.fn(),
  writeValidation: vi.fn(),
}));

vi.mock("../app/validation/lock.server", () => ({
  withValidationLock: mocks.withLock,
}));
vi.mock("../app/validation/write.server", () => ({
  writeValidationUnderLock: mocks.writeValidation,
}));
vi.mock("../app/checkout-labels/repository.server", () => ({
  claimCheckoutLabelSlot: mocks.claim,
  confirmGuidedCheckoutLabelSlots: mocks.confirmGuided,
  enableCheckoutLabels: mocks.enable,
  markCheckoutLabelsResult: mocks.mark,
  persistCheckoutLabelObservation: mocks.persist,
  readCheckoutLabelState: mocks.readState,
  readStoredCheckoutLabelSlots: mocks.readStored,
  saveAddress2Decision: mocks.saveDecision,
  saveCheckoutLabelWrite: mocks.saveWrite,
  stopCheckoutLabelManagement: mocks.stop,
}));
vi.mock("../app/checkout-labels/shopify.server", () => ({
  readCheckoutLabels: mocks.readLabels,
  registerCheckoutLabelTranslations: mocks.register,
  removeCheckoutLabelTranslation: mocks.remove,
}));

import {
  acceptAddress2Customization,
  confirmGuidedCheckoutLabels,
  loadCheckoutLabels,
  restoreAddress2Translations,
  saveRulesAndCheckoutLabels,
} from "../app/checkout-labels/service.server";

const db = {} as D1Database;
const admin = { graphql: vi.fn() };
const shop = "labels-service.example.myshopify.com";
const heartbeat = { isHeld: vi.fn(async () => true) };
const rules = { taxCode: "required_validated", pec: "optional_validated" } as const;

const state = {
  mode: "off" as const,
  managementEpoch: null,
  enabledAt: null,
  lastSyncAt: null,
  lastErrorCode: null,
  address2Classification: "unknown" as const,
  address2HasMarketOverride: false,
  address2ExternalChangeAt: null,
  address2Decision: "pending" as const,
  address2ReviewedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  heartbeat.isHeld.mockResolvedValue(true);
  mocks.withLock.mockImplementation(async (_db, _shop, operation) => ({
    acquired: true,
    result: await operation(heartbeat),
  }));
  mocks.readState.mockResolvedValue(state);
  mocks.readStored.mockResolvedValue([]);
  mocks.enable.mockResolvedValue("epoch-1");
  mocks.writeValidation.mockResolvedValue({ ok: true, enabled: true });
});

test("il caricamento persiste il readback e aggiorna una gestione attiva", async () => {
  const snapshot = snapshotOf([fiscalSlot()]);
  const fiscal = snapshot.slots[0];
  const active = { ...state, mode: "guided" as const };
  const refreshed = { ...active, lastSyncAt: "2026-09-08T12:00:00Z" };
  mocks.readState.mockResolvedValueOnce(active).mockResolvedValueOnce(refreshed);
  mocks.readLabels.mockResolvedValue(snapshot);
  mocks.readStored.mockResolvedValue([
    stored(fiscal, {
      guidedConfirmedValue: "Codice fiscale",
      guidedConfirmedAt: "2026-09-08T12:00:00Z",
    }),
  ]);

  await expect(loadCheckoutLabels(admin, db, shop, rules)).resolves.toEqual({
    available: true,
    snapshot,
    state: refreshed,
    externalChange: false,
    confirmedGuidedSlotIds: [checkoutLabelSlotId(fiscal)],
  });
  expect(mocks.persist).toHaveBeenCalledWith(db, shop, snapshot.slots, snapshot.address2);
  expect(mocks.mark).toHaveBeenCalledWith(db, shop, { errorCode: null, synced: true });
});

test("il caricamento inattivo osserva senza aggiornare lo stato di gestione", async () => {
  mocks.readLabels.mockResolvedValue(snapshotOf([]));

  await expect(loadCheckoutLabels(admin, db, shop, rules)).resolves.toMatchObject({
    available: true,
    externalChange: false,
  });
  expect(mocks.mark).not.toHaveBeenCalled();
});

test("il caricamento attivo segnala una conferma guidata ancora assente", async () => {
  mocks.readState.mockResolvedValue({ ...state, mode: "guided" as const });
  mocks.readLabels.mockResolvedValue(snapshotOf([fiscalSlot()]));

  await expect(loadCheckoutLabels(admin, db, shop, rules)).resolves.toMatchObject({
    available: true,
    externalChange: false,
  });
  expect(mocks.mark).toHaveBeenCalledWith(db, shop, {
    errorCode: "checkout_labels_partial_sync",
    synced: false,
  });
});

test("il caricamento conserva l'errore della chiave fiscale incompleta", async () => {
  const active = { ...state, mode: "guided" as const };
  const snapshot = {
    ...snapshotOf([fiscalSlot()]),
    issues: [
      {
        code: "checkout_labels_resource_missing" as const,
        key: CHECKOUT_LABEL_KEYS.pec,
      },
    ],
  };
  mocks.readState.mockResolvedValue(active);
  mocks.readLabels.mockResolvedValue(snapshot);

  await expect(loadCheckoutLabels(admin, db, shop, rules)).resolves.toMatchObject({
    available: true,
    externalChange: false,
  });
  expect(mocks.mark).toHaveBeenCalledWith(db, shop, {
    errorCode: "checkout_labels_resource_missing",
    synced: false,
  });
});

test("il caricamento ignora slot fuori epoca e riconosce un'assenza già scritta", async () => {
  const active = { ...state, mode: "automatic" as const, managementEpoch: "epoch-1" };
  const fiscal = fiscalSlot();
  mocks.readState.mockResolvedValue(active);
  mocks.readLabels.mockResolvedValue(snapshotOf([]));
  mocks.readStored.mockResolvedValue([
    stored(fiscal, { managementEpoch: "epoch-2", lastWritePresent: true }),
    stored(fiscal, { managementEpoch: "epoch-1", lastWritePresent: false }),
  ]);

  await expect(loadCheckoutLabels(admin, db, shop, rules)).resolves.toMatchObject({
    available: true,
    externalChange: false,
  });
});

test("il caricamento rileva modifiche gestite e decisioni su Interno", async () => {
  const fiscal = fiscalSlot({ currentValue: "Modifica esterna" });
  const address = addressSlot({ currentValue: "Codice fiscale" });
  const accepted = {
    ...state,
    mode: "automatic" as const,
    managementEpoch: "epoch-1",
    address2Decision: "accepted" as const,
  };
  mocks.readState.mockResolvedValue(accepted);
  mocks.readLabels.mockResolvedValue(snapshotOf([fiscal, address]));
  mocks.readStored.mockResolvedValue([
    stored(fiscal, { managementEpoch: "epoch-1", lastWritePresent: true, lastWrittenValue: "CF" }),
    stored(address, { lastObservedValue: "Interno" }),
  ]);

  const result = await loadCheckoutLabels(admin, db, shop, rules);
  expect(result).toMatchObject({ available: true, externalChange: true });
  expect(mocks.mark).toHaveBeenCalledWith(db, shop, {
    errorCode: "checkout_labels_conflict",
    synced: false,
    externalChange: true,
  });
});

test("il caricamento rileva varianti di Interno aggiunte o rimosse dopo l'accettazione", async () => {
  const accepted = { ...state, address2Decision: "accepted" as const };
  const address = addressSlot();
  mocks.readState.mockResolvedValue(accepted);
  mocks.readLabels.mockResolvedValueOnce(snapshotOf([address]));

  await expect(loadCheckoutLabels(admin, db, shop, rules)).resolves.toMatchObject({
    available: true,
    externalChange: true,
  });

  mocks.readLabels.mockResolvedValueOnce(snapshotOf([]));
  mocks.readStored.mockResolvedValueOnce([stored(address)]);
  await expect(loadCheckoutLabels(admin, db, shop, rules)).resolves.toMatchObject({
    available: true,
    externalChange: true,
  });
});

test("un override di mercato assente conserva il valore ereditato accettato", async () => {
  const accepted = { ...state, address2Decision: "accepted" as const };
  const address = addressSlot({
    kind: "market_translation",
    marketId: "gid://shopify/Market/1",
    currentValue: null,
    inheritedValue: "Interno",
  });
  mocks.readState.mockResolvedValue(accepted);
  mocks.readLabels.mockResolvedValue(snapshotOf([address]));
  mocks.readStored.mockResolvedValue([stored(address, { lastObservedValue: "Interno" })]);

  await expect(loadCheckoutLabels(admin, db, shop, rules)).resolves.toMatchObject({
    available: true,
    externalChange: false,
  });
});

test("il caricamento riduce errori noti e inattesi a codici applicativi", async () => {
  mocks.readLabels.mockRejectedValueOnce(new Error("checkout_labels_stale_digest"));
  await expect(loadCheckoutLabels(admin, db, shop, rules)).resolves.toMatchObject({
    available: false,
    errorCode: "checkout_labels_stale_digest",
  });
  mocks.readLabels.mockRejectedValueOnce("offline");
  await expect(loadCheckoutLabels(admin, db, shop, rules)).resolves.toMatchObject({
    available: false,
    errorCode: "checkout_labels_readback_failed",
  });
});

test("il salvataggio gestisce lock, readback e revisione prima delle scritture", async () => {
  mocks.withLock.mockResolvedValueOnce({ acquired: false });
  await expect(save(input())).resolves.toEqual({ ok: false, errorCode: "validation_locked" });

  mocks.readLabels.mockRejectedValueOnce(new Error("checkout_labels_partial_sync"));
  await expect(save(input())).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_partial_sync",
  });
  expect(mocks.mark).toHaveBeenLastCalledWith(db, shop, {
    errorCode: "checkout_labels_partial_sync",
    synced: false,
  });

  mocks.readLabels.mockResolvedValueOnce(snapshotOf([], "new"));
  await expect(save(input({ expectedLabelsRevision: "old" }))).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_conflict",
  });
});

test("il salvataggio senza gestione etichette delega soltanto la Validation", async () => {
  await expect(save(input({ labelsEnabled: false }))).resolves.toEqual({
    ok: true,
    labelsErrorCode: null,
  });
  expect(mocks.readLabels).not.toHaveBeenCalled();

  mocks.writeValidation.mockResolvedValueOnce({ ok: false, errorCode: "config_conflict" });
  await expect(save(input({ labelsEnabled: false }))).resolves.toEqual({
    ok: false,
    errorCode: "config_conflict",
  });
});

test("una lease persa prima o durante la scrittura delle etichette interrompe il salvataggio", async () => {
  const tax = fiscalSlot({ capability: "automatic", currentValue: "Codice fiscale (facoltativo)" });
  const active = { ...state, mode: "automatic" as const, managementEpoch: "epoch-1" };
  mocks.readState.mockResolvedValue(active);
  mocks.readLabels.mockResolvedValue(snapshotOf([tax]));
  mocks.readStored.mockResolvedValue([stored(tax, { managementEpoch: "epoch-1" })]);

  heartbeat.isHeld.mockResolvedValueOnce(false);
  await expect(save()).resolves.toEqual({ ok: false, errorCode: "validation_locked" });

  heartbeat.isHeld.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(save()).resolves.toEqual({ ok: false, errorCode: "validation_locked" });
});

test("un conflitto posseduto e un digest Shopify scaduto falliscono chiusi", async () => {
  const tax = fiscalSlot({ capability: "automatic", currentValue: "Modifica esterna" });
  const active = { ...state, mode: "automatic" as const, managementEpoch: "epoch-1" };
  mocks.readState.mockResolvedValue(active);
  mocks.readLabels.mockResolvedValue(snapshotOf([tax]));
  mocks.readStored.mockResolvedValue([
    stored(tax, {
      managementEpoch: "epoch-1",
      lastWritePresent: true,
      lastWrittenValue: "Codice fiscale (facoltativo)",
    }),
  ]);

  await expect(save()).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_conflict",
  });

  const writable = { ...tax, currentValue: "Codice fiscale (facoltativo)" };
  mocks.readLabels.mockResolvedValue(snapshotOf([writable]));
  mocks.readStored.mockResolvedValue([stored(writable, { managementEpoch: "epoch-1" })]);
  mocks.register.mockRejectedValue(new Error("checkout_labels_stale_digest"));
  await expect(save()).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_stale_digest",
  });
});

test("il retry su digest scaduto rilegge Shopify e completa la sincronizzazione", async () => {
  const optional = fiscalSlot({
    capability: "automatic",
    currentValue: "Codice fiscale (facoltativo)",
  });
  const required = { ...optional, currentValue: "Codice fiscale" };
  const previous = stored(optional, { capability: "automatic" });
  mocks.readStored.mockResolvedValue([previous]);
  mocks.readLabels
    .mockResolvedValueOnce(snapshotOf([optional]))
    .mockResolvedValueOnce(snapshotOf([optional]))
    .mockResolvedValueOnce(snapshotOf([required]))
    .mockResolvedValueOnce(snapshotOf([required]));
  mocks.register
    .mockRejectedValueOnce(new Error("checkout_labels_stale_digest"))
    .mockResolvedValueOnce(undefined);

  await expect(save()).resolves.toEqual({ ok: true, labelsErrorCode: null });
  expect(mocks.register).toHaveBeenCalledTimes(2);
});

test("una scrittura già allineata e uno slot fuori epoca non generano modifiche", async () => {
  const fiscal = fiscalSlot({ capability: "automatic", currentValue: "Codice fiscale" });
  const active = { ...state, mode: "automatic" as const, managementEpoch: "epoch-1" };
  mocks.readState.mockResolvedValue(active);
  mocks.readStored.mockResolvedValue([
    stored(fiscal, { managementEpoch: "epoch-2", capability: "automatic" }),
  ]);
  mocks.readLabels.mockResolvedValue(snapshotOf([fiscal]));

  await expect(save()).resolves.toEqual({ ok: true, labelsErrorCode: null });
  expect(mocks.register).not.toHaveBeenCalled();

  await expect(save(input({ rules: { taxCode: "unmanaged", pec: "unmanaged" } }))).resolves.toEqual(
    {
      ok: true,
      labelsErrorCode: null,
    },
  );
  expect(mocks.remove).not.toHaveBeenCalled();
});

test("la prima capacità automatica richiede conferma e poi sincronizza le due fasi", async () => {
  const tax = fiscalSlot({ capability: "automatic", currentValue: "Codice fiscale (facoltativo)" });
  const pec = fiscalSlot({
    name: "pec",
    key: CHECKOUT_LABEL_KEYS.pec,
    capability: "automatic",
    currentValue: "PEC",
  });
  const storedSlots = [
    stored(tax, { capability: "automatic" }),
    stored(pec, { capability: "automatic" }),
  ];
  mocks.readStored.mockResolvedValue(storedSlots);
  mocks.readLabels.mockResolvedValue(snapshotOf([tax, pec]));

  await expect(save(input({ confirmAutomaticWrite: false }))).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_confirmation_required",
  });

  const after = snapshotOf([{ ...tax, currentValue: "Codice fiscale" }, pec]);
  const final = snapshotOf([
    { ...tax, currentValue: "Codice fiscale" },
    { ...pec, currentValue: "PEC (facoltativa)" },
  ]);
  mocks.readLabels.mockReset();
  mocks.readLabels
    .mockResolvedValueOnce(snapshotOf([tax, pec]))
    .mockResolvedValueOnce(after)
    .mockResolvedValueOnce(final);

  await expect(save(input())).resolves.toEqual({ ok: true, labelsErrorCode: null });
  expect(mocks.enable).toHaveBeenCalled();
  expect(mocks.register).toHaveBeenCalledTimes(2);
  expect(mocks.writeValidation).toHaveBeenCalled();
  expect(mocks.mark).toHaveBeenLastCalledWith(db, shop, {
    mode: "automatic",
    errorCode: null,
    synced: true,
  });
});

test("un errore dopo la Validation produce sincronizzazione parziale", async () => {
  const pec = fiscalSlot({
    name: "pec",
    key: CHECKOUT_LABEL_KEYS.pec,
    capability: "automatic",
    currentValue: "PEC",
  });
  mocks.readStored.mockResolvedValue([stored(pec, { capability: "automatic" })]);
  mocks.readLabels.mockResolvedValue(snapshotOf([pec]));
  mocks.register.mockRejectedValue(new Error("checkout_labels_partial_sync"));

  await expect(save(input())).resolves.toEqual({
    ok: true,
    labelsErrorCode: "checkout_labels_partial_sync",
  });
  expect(mocks.mark).toHaveBeenLastCalledWith(db, shop, {
    mode: "partial",
    errorCode: "checkout_labels_partial_sync",
    synced: false,
  });
});

test("un readback finale divergente resta recuperabile", async () => {
  const tax = fiscalSlot({ capability: "automatic", currentValue: "Testo diverso" });
  mocks.readStored.mockResolvedValue([stored(tax, { capability: "automatic" })]);
  mocks.readLabels.mockResolvedValue(snapshotOf([tax]));

  await expect(save(input())).resolves.toEqual({
    ok: true,
    labelsErrorCode: "checkout_labels_partial_sync",
  });
});

test("la disattivazione ripristina solo slot posseduti e invariati", async () => {
  const fiscal = fiscalSlot({ capability: "automatic", currentValue: "Codice fiscale" });
  const active = { ...state, mode: "automatic" as const, managementEpoch: "epoch-1" };
  mocks.readState.mockResolvedValue(active);
  mocks.readLabels.mockResolvedValue(snapshotOf([fiscal]));
  mocks.readStored.mockResolvedValue([
    stored(fiscal, {
      capability: "automatic",
      managementEpoch: "epoch-1",
      originalPresent: false,
      lastWritePresent: true,
      lastWrittenValue: "Codice fiscale",
    }),
  ]);

  await expect(save(input({ labelsEnabled: false }))).resolves.toEqual({
    ok: true,
    labelsErrorCode: null,
  });
  expect(mocks.remove).toHaveBeenCalledWith(admin, fiscal);
  expect(mocks.stop).toHaveBeenCalledWith(db, shop);

  mocks.remove.mockClear();
  mocks.stop.mockClear();
  mocks.readStored.mockResolvedValue([
    stored(fiscal, {
      capability: "automatic",
      managementEpoch: "epoch-1",
      lastWritePresent: true,
      lastWrittenValue: "Altro",
    }),
  ]);
  await expect(save(input({ labelsEnabled: false }))).resolves.toEqual({
    ok: true,
    labelsErrorCode: "checkout_labels_conflict",
  });
  expect(mocks.stop).not.toHaveBeenCalled();
});

test("la disattivazione gestisce epoche assenti, slot estranei e lease scadute", async () => {
  const fiscal = fiscalSlot({ capability: "automatic", currentValue: "Codice fiscale" });
  mocks.readLabels.mockResolvedValue(snapshotOf([fiscal]));

  mocks.readState.mockResolvedValueOnce({ ...state, mode: "automatic" as const });
  await expect(save(input({ labelsEnabled: false }))).resolves.toEqual({
    ok: true,
    labelsErrorCode: null,
  });

  const active = { ...state, mode: "automatic" as const, managementEpoch: "epoch-1" };
  mocks.readState.mockResolvedValue(active);
  const foreign = [
    stored(fiscal, {
      managementEpoch: "epoch-2",
      lastWritePresent: true,
      lastWrittenValue: "Codice fiscale",
    }),
  ];
  mocks.readStored.mockResolvedValueOnce(foreign);
  await expect(save(input({ labelsEnabled: false }))).resolves.toEqual({
    ok: true,
    labelsErrorCode: null,
  });

  const owned = [
    stored(fiscal, {
      managementEpoch: "epoch-1",
      lastWritePresent: true,
      lastWrittenValue: "Codice fiscale",
    }),
  ];
  mocks.readStored.mockResolvedValueOnce(owned);
  heartbeat.isHeld.mockResolvedValueOnce(false);
  await expect(save(input({ labelsEnabled: false }))).resolves.toEqual({
    ok: true,
    labelsErrorCode: "validation_locked",
  });
});

test("il ripristino automatico conserva il valore originario e il mercato", async () => {
  const fiscal = fiscalSlot({
    capability: "automatic",
    currentValue: "Codice fiscale",
    marketId: "gid://shopify/Market/1",
  });
  const active = { ...state, mode: "automatic" as const, managementEpoch: "epoch-1" };
  const previous = stored(fiscal, {
    managementEpoch: "epoch-1",
    originalPresent: true,
    originalValue: "Tax ID",
    lastWritePresent: true,
    lastWrittenValue: "Codice fiscale",
  });
  mocks.readState.mockResolvedValue(active);
  mocks.readStored.mockResolvedValue([previous]);
  mocks.readLabels
    .mockResolvedValueOnce(snapshotOf([fiscal]))
    .mockResolvedValueOnce(snapshotOf([fiscal]))
    .mockResolvedValueOnce(snapshotOf([{ ...fiscal, currentValue: "Tax ID" }]));

  await expect(save(input({ rules: { taxCode: "unmanaged", pec: "unmanaged" } }))).resolves.toEqual(
    {
      ok: true,
      labelsErrorCode: null,
    },
  );
  expect(mocks.register).toHaveBeenCalledWith(admin, fiscal.resourceId, [
    expect.objectContaining({ value: "Tax ID", marketId: fiscal.marketId }),
  ]);
});

test("il ripristino di Interno copre conflitto, lock, traduzione e override", async () => {
  const global = addressSlot({ kind: "global_translation", currentValue: "Codice fiscale" });
  const market = addressSlot({
    kind: "market_translation",
    marketId: "gid://shopify/Market/1",
    currentValue: "Tax code",
  });
  const source = addressSlot({ kind: "source", currentValue: "Codice fiscale" });

  mocks.withLock.mockResolvedValueOnce({ acquired: false });
  await expect(restoreAddress2Translations(admin, db, shop, "r1", [])).resolves.toEqual({
    ok: false,
    errorCode: "validation_locked",
  });

  mocks.readLabels.mockResolvedValueOnce(snapshotOf([], "r2"));
  await expect(restoreAddress2Translations(admin, db, shop, "r1", ["missing"])).resolves.toEqual({
    ok: false,
    errorCode: "address2_restore_conflict",
  });

  mocks.readLabels.mockResolvedValueOnce(snapshotOf([], "r1"));
  await expect(restoreAddress2Translations(admin, db, shop, "r1", [])).resolves.toEqual({
    ok: false,
    errorCode: "address2_restore_conflict",
  });

  mocks.readLabels.mockReset();
  mocks.readLabels
    .mockResolvedValueOnce(snapshotOf([global, market, source], "r1"))
    .mockResolvedValueOnce(
      snapshotOf([
        { ...global, currentValue: "Interno" },
        { ...market, currentValue: "Interno" },
        source,
      ]),
    );
  await expect(
    restoreAddress2Translations(admin, db, shop, "r1", [
      checkoutLabelSlotId(global),
      checkoutLabelSlotId(market),
    ]),
  ).resolves.toEqual({ ok: true });
  expect(mocks.register).toHaveBeenCalled();
  expect(mocks.register).toHaveBeenCalledWith(
    admin,
    market.resourceId,
    expect.arrayContaining([expect.objectContaining({ marketId: market.marketId })]),
  );
  expect(mocks.saveDecision).toHaveBeenCalledWith(db, shop, "manual_restore_required");

  heartbeat.isHeld.mockResolvedValueOnce(false);
  mocks.readLabels.mockReset();
  mocks.readLabels.mockResolvedValue(snapshotOf([global], "r1"));
  await expect(
    restoreAddress2Translations(admin, db, shop, "r1", [checkoutLabelSlotId(global)]),
  ).resolves.toEqual({
    ok: false,
    errorCode: "validation_locked",
  });
});

test("il ripristino rifiuta un readback divergente e normalizza gli errori", async () => {
  const global = addressSlot({ kind: "global_translation", currentValue: "Codice fiscale" });
  mocks.readLabels
    .mockResolvedValueOnce(snapshotOf([global], "r1"))
    .mockResolvedValueOnce(snapshotOf([global], "r2"));
  await expect(
    restoreAddress2Translations(admin, db, shop, "r1", [checkoutLabelSlotId(global)]),
  ).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_readback_failed",
  });

  mocks.readLabels.mockReset();
  mocks.readLabels.mockRejectedValue(new Error("unexpected"));
  await expect(
    restoreAddress2Translations(admin, db, shop, "r1", [checkoutLabelSlotId(global)]),
  ).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_readback_failed",
  });
});

test("il ripristino della variante facoltativa registra lo stato ripristinato", async () => {
  const optional = addressSlot({
    key: CHECKOUT_LABEL_KEYS.optionalAddress2,
    name: "optionalAddress2",
    currentValue: "Codice fiscale",
  });
  const restored = { ...optional, currentValue: "Interno, scala, ecc. (facoltativo)" };
  mocks.readLabels
    .mockResolvedValueOnce(snapshotOf([optional], "r1"))
    .mockResolvedValueOnce(snapshotOf([restored], "r2"));

  await expect(
    restoreAddress2Translations(admin, db, shop, "r1", [checkoutLabelSlotId(optional)]),
  ).resolves.toEqual({ ok: true });
  expect(mocks.saveDecision).toHaveBeenCalledWith(db, shop, "restored");
});

test("la decisione di mantenere Interno richiede la revisione corrente", async () => {
  mocks.withLock.mockResolvedValueOnce({ acquired: false });
  await expect(acceptAddress2Customization(admin, db, shop, "r1")).resolves.toEqual({
    ok: false,
    errorCode: "validation_locked",
  });

  mocks.readLabels.mockResolvedValueOnce(snapshotOf([], "r2"));
  await expect(acceptAddress2Customization(admin, db, shop, "r1")).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_conflict",
  });

  const snapshot = snapshotOf([addressSlot()], "r1");
  mocks.readLabels.mockResolvedValueOnce(snapshot);
  await expect(acceptAddress2Customization(admin, db, shop, "r1")).resolves.toEqual({ ok: true });
  expect(mocks.persist).toHaveBeenCalledWith(db, shop, snapshot.slots, snapshot.address2);
  expect(mocks.saveDecision).toHaveBeenCalledWith(db, shop, "accepted");
});

test("la conferma guidata è legata a revisione, tuple e valore osservato", async () => {
  const guided = fiscalSlot();
  mocks.readLabels.mockResolvedValueOnce(snapshotOf([guided], "r2"));
  await expect(
    confirmGuidedCheckoutLabels(admin, db, shop, rules, "r1", [checkoutLabelSlotId(guided)]),
  ).resolves.toEqual({ ok: false, errorCode: "checkout_labels_conflict" });

  const active = { ...state, mode: "guided" as const };
  mocks.readLabels.mockResolvedValueOnce(snapshotOf([guided], "r1"));
  mocks.readState.mockResolvedValue(active);
  mocks.readStored.mockResolvedValue([
    stored(guided, {
      guidedConfirmedValue: "Codice fiscale",
      guidedConfirmedAt: "2026-09-09T10:00:00Z",
    }),
  ]);

  await expect(
    confirmGuidedCheckoutLabels(admin, db, shop, rules, "r1", [checkoutLabelSlotId(guided)]),
  ).resolves.toEqual({ ok: true });
  expect(mocks.persist).toHaveBeenCalledWith(db, shop, [guided], expect.any(Object));
  expect(mocks.confirmGuided).toHaveBeenCalledWith(db, shop, [guided]);
  expect(mocks.mark).toHaveBeenLastCalledWith(db, shop, {
    mode: "guided",
    errorCode: null,
    synced: true,
  });

  mocks.readLabels.mockResolvedValueOnce(snapshotOf([guided], "r1"));
  await expect(confirmGuidedCheckoutLabels(admin, db, shop, rules, "r1", [])).resolves.toEqual({
    ok: false,
    errorCode: "checkout_labels_conflict",
  });

  mocks.withLock.mockResolvedValueOnce({ acquired: false });
  await expect(
    confirmGuidedCheckoutLabels(admin, db, shop, rules, "r1", [checkoutLabelSlotId(guided)]),
  ).resolves.toEqual({ ok: false, errorCode: "validation_locked" });

  mocks.readLabels.mockRejectedValueOnce(new Error("errore inatteso"));
  await expect(
    confirmGuidedCheckoutLabels(admin, db, shop, rules, "r1", [checkoutLabelSlotId(guided)]),
  ).resolves.toEqual({ ok: false, errorCode: "checkout_labels_readback_failed" });
});

function save(overrides = {}) {
  return saveRulesAndCheckoutLabels(admin, db, shop, input(overrides));
}

function input(overrides = {}) {
  return {
    rules,
    expectedConfigHash: null,
    address2Declared: false,
    labelsEnabled: true,
    confirmAutomaticWrite: true,
    expectedLabelsRevision: null,
    ...overrides,
  };
}

function snapshotOf(slots: CheckoutLabelSlot[], revision = "r1") {
  return {
    locales: [],
    markets: [],
    slots,
    issues: [],
    revision,
    address2: { classification: "unknown" as const, hasMarketOverride: false },
  };
}

function fiscalSlot(overrides: Partial<CheckoutLabelSlot> = {}): CheckoutLabelSlot {
  return {
    resourceId: "gid://shopify/OnlineStoreThemeLocaleContent/1",
    key: CHECKOUT_LABEL_KEYS.taxCode,
    name: "taxCode",
    locale: "it",
    family: "it",
    marketId: null,
    marketName: null,
    kind: "global_translation",
    capability: "guided",
    currentValue: "Codice fiscale",
    inheritedValue: null,
    sourceValue: "Codice fiscale",
    sourceDigest: "digest",
    outdated: false,
    ...overrides,
  };
}

function addressSlot(overrides: Partial<CheckoutLabelSlot> = {}): CheckoutLabelSlot {
  return {
    ...fiscalSlot(),
    key: CHECKOUT_LABEL_KEYS.address2,
    name: "address2",
    kind: "global_translation",
    currentValue: "Interno",
    sourceValue: "Interno",
    ...overrides,
  };
}

function stored(slot: CheckoutLabelSlot, overrides = {}) {
  return {
    resourceId: slot.resourceId,
    key: slot.key,
    locale: slot.locale,
    marketId: slot.marketId,
    kind: slot.kind,
    capability: slot.capability,
    managementEpoch: null,
    originalPresent: false,
    originalValue: null,
    lastWritePresent: null,
    lastWrittenValue: null,
    sourceDigest: slot.sourceDigest,
    lastObservedValue: slot.currentValue,
    lastObservedAt: "2026-09-08T12:00:00Z",
    guidedConfirmedValue: null,
    guidedConfirmedAt: null,
    ...overrides,
  };
}
