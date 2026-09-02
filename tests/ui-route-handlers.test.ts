import { beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_CONFIG, MESSAGE_KEYS } from "../app/config";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  authenticateShopify: vi.fn(),
  findValidation: vi.fn(),
  localDate: vi.fn(),
  observedConfigHash: vi.fn(),
  persistShopDisplayName: vi.fn(),
  queryContext: vi.fn(),
  readAddress2Declaration: vi.fn(),
  readOnboarding: vi.fn(),
  readSupportDiagnosticState: vi.fn(),
  reconcile: vi.fn(),
  recordEvent: vi.fn(),
  saveAddress2Declaration: vi.fn(),
  saveOnboarding: vi.fn(),
  startTrial: vi.fn(),
  writeValidation: vi.fn(),
}));

vi.mock("../app/admin-auth.server", () => ({ authenticateAdmin: mocks.authenticateAdmin }));
vi.mock("../app/billing.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/billing.server")>()),
  localDate: mocks.localDate,
  startTrial: mocks.startTrial,
}));
vi.mock("../app/events.server", () => ({ recordEvent: mocks.recordEvent }));
vi.mock("../app/shop-profile.server", () => ({
  persistShopDisplayName: mocks.persistShopDisplayName,
}));
vi.mock("../app/shopify.server", () => ({
  authenticate: { admin: mocks.authenticateShopify },
}));
vi.mock("../app/support.server", () => ({
  readSupportDiagnosticState: mocks.readSupportDiagnosticState,
}));
vi.mock("../app/validation.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/validation.server")>()),
  findValidation: mocks.findValidation,
  observedConfigHash: mocks.observedConfigHash,
  queryContext: mocks.queryContext,
  readAddress2Declaration: mocks.readAddress2Declaration,
  readOnboarding: mocks.readOnboarding,
  reconcile: mocks.reconcile,
  saveAddress2Declaration: mocks.saveAddress2Declaration,
  saveOnboarding: mocks.saveOnboarding,
  writeValidation: mocks.writeValidation,
}));

const db = {} as D1Database;
const context = { get: vi.fn(() => db) };
const session = { shop: "demo.myshopify.com" };
const admin = { graphql: vi.fn() };

function args(request: Request) {
  return { request, context, params: {} } as never;
}

function post(path: string, values: Record<string, string>) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    body: new URLSearchParams(values),
  });
}

function messageForm(overrides: Record<string, string> = {}) {
  return Object.fromEntries([
    ["configHash", "hash"],
    ...(["it", "en"] as const).flatMap((locale) =>
      MESSAGE_KEYS.map((key) => [`${locale}.${key}`, DEFAULT_CONFIG.messages[locale][key]]),
    ),
    ...Object.entries(overrides),
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  context.get.mockReturnValue(db);
  mocks.authenticateAdmin.mockResolvedValue({ admin, session });
  mocks.authenticateShopify.mockResolvedValue({ admin, session });
  mocks.localDate.mockReturnValue("2026-09-02");
  mocks.observedConfigHash.mockResolvedValue("hash");
  mocks.queryContext.mockResolvedValue({
    shop: {
      name: "Negozio Demo",
      ianaTimezone: "Europe/Rome",
      shopAddress: { countryCodeV2: "IT" },
    },
    validations: { nodes: [] },
  });
  mocks.readAddress2Declaration.mockResolvedValue(null);
  mocks.readOnboarding.mockResolvedValue({ status: "in_progress", step: 2 });
  mocks.reconcile.mockResolvedValue({
    validation: undefined,
    validationEnabled: false,
    entitlement: { kind: "none", validThrough: null },
    trial: null,
    errorCode: null,
  });
  mocks.startTrial.mockResolvedValue({ status: "active" });
  mocks.writeValidation.mockResolvedValue({ ok: true, enabled: true });
});

test("Guida carica diagnostica e accetta solo ricevute di copia valide", async () => {
  mocks.readSupportDiagnosticState.mockResolvedValue({ validationStatus: "inactive" });
  const { action, loader } = await import("../app/routes/app.guide");
  const loaded = await loader(args(new Request("https://example.test/app/guide?locale=en")));
  expect(loaded.data).toMatchObject({
    locale: "en",
    shopDomain: session.shop,
    diagnostics: { validationStatus: "inactive" },
  });
  expect(loaded.data.diagnosticId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(new Headers(loaded.init?.headers).get("Server-Timing")).toMatch(
    /auth;dur=.*d1_support;dur=.*total;dur=/,
  );

  expect(await action(args(post("/app/guide", { intent: "altro", diagnostic_id: "x" })))).toEqual({
    ok: false,
  });
  expect(await action(args(post("/app/guide", { intent: "diagnostics_copied" })))).toEqual({
    ok: false,
  });
  expect(
    await action(
      args(
        post("/app/guide", {
          intent: "diagnostics_copied",
          diagnostic_id: "123e4567-e89b-42d3-a456-426614174000",
        }),
      ),
    ),
  ).toEqual({ ok: true });
  expect(mocks.recordEvent).toHaveBeenCalledWith(
    db,
    expect.objectContaining({
      name: "support_diagnostics_copied",
      metadata: { correlation_id: "123e4567-e89b-42d3-a456-426614174000" },
    }),
  );
});

test("Messaggi legge Shopify e copre rifiuto, salvataggio e conflitto", async () => {
  const validation = { metafield: { jsonValue: DEFAULT_CONFIG } };
  mocks.findValidation.mockReturnValue(validation);
  const { action, loader } = await import("../app/routes/app.messages");
  const loaded = await loader(args(new Request("https://example.test/app/messages?locale=it")));
  expect(loaded.data).toEqual({
    locale: "it",
    configHash: "hash",
    messages: DEFAULT_CONFIG.messages,
    rules: DEFAULT_CONFIG.rules,
  });
  expect(new Headers(loaded.init?.headers).get("Server-Timing")).toMatch(
    /auth;dur=.*shopify_context;dur=.*total;dur=/,
  );

  const invalid = messageForm({ "it.taxCodeRequired": "" });
  expect(await action(args(post("/app/messages", invalid)))).toMatchObject({
    ok: false,
    problem: { locale: "it", key: "taxCodeRequired" },
  });

  mocks.writeValidation.mockResolvedValueOnce({ ok: true });
  expect(await action(args(post("/app/messages", messageForm())))).toEqual({ ok: true });
  expect(mocks.writeValidation).toHaveBeenLastCalledWith(
    admin,
    db,
    session.shop,
    { messages: DEFAULT_CONFIG.messages },
    null,
    "hash",
  );

  mocks.writeValidation.mockResolvedValueOnce({ ok: false, errorCode: "config_conflict" });
  expect(await action(args(post("/app/messages", messageForm({ configHash: "" }))))).toEqual({
    ok: false,
    errorCode: "config_conflict",
  });
});

test("Onboarding carica gli stati autorevoli con e senza accesso", async () => {
  const { loader } = await import("../app/routes/app.onboarding");
  const request = new Request("https://example.test/app/onboarding?locale=it");
  expect((await loader(args(request))).data).toMatchObject({
    step: 2,
    completed: false,
    entitled: false,
    trialStatus: null,
    address2Declared: false,
  });

  mocks.reconcile.mockResolvedValueOnce({
    validation: { metafield: { jsonValue: DEFAULT_CONFIG } },
    validationEnabled: true,
    entitlement: { kind: "subscription", validThrough: "2026-09-30" },
    trial: { status: "active" },
  });
  mocks.readOnboarding.mockResolvedValueOnce({ status: "completed", step: 4 });
  mocks.readAddress2Declaration.mockResolvedValueOnce(true);
  expect((await loader(args(request))).data).toMatchObject({
    step: 4,
    completed: true,
    enabled: true,
    entitled: true,
    trialStatus: "active",
    address2Declared: true,
  });
});

test("Onboarding valida e salva avanzamento e regole", async () => {
  const { action } = await import("../app/routes/app.onboarding");
  expect(await action(args(post("/app/onboarding", { intent: "progress", step: "x" })))).toEqual({
    ok: false,
    errorCode: "generic",
  });
  expect(await action(args(post("/app/onboarding", { intent: "back", step: "2" })))).toEqual({
    ok: true,
  });
  expect(mocks.saveOnboarding).toHaveBeenCalledWith(db, session.shop, {
    status: "in_progress",
    step: 2,
  });

  expect(
    await action(
      args(post("/app/onboarding", { intent: "rules", taxCode: "x", pec: "unmanaged" })),
    ),
  ).toEqual({ ok: false, errorCode: "generic" });
  mocks.writeValidation.mockResolvedValueOnce({ ok: false, errorCode: "config_conflict" });
  expect(
    await action(
      args(
        post("/app/onboarding", {
          intent: "rules",
          taxCode: "required_validated",
          pec: "optional_validated",
        }),
      ),
    ),
  ).toEqual({ ok: false, errorCode: "config_conflict" });
  mocks.writeValidation.mockResolvedValueOnce({ ok: true });
  expect(
    await action(
      args(
        post("/app/onboarding", {
          intent: "rules",
          taxCode: "required_validated",
          pec: "optional_validated",
        }),
      ),
    ),
  ).toEqual({ ok: true });
  expect(mocks.saveOnboarding).toHaveBeenLastCalledWith(db, session.shop, {
    status: "in_progress",
    step: 3,
  });
});

test("Onboarding tratta prova, intent sconosciuti e chiusura senza attivazione", async () => {
  const { action } = await import("../app/routes/app.onboarding");
  mocks.startTrial.mockResolvedValueOnce(null);
  expect(await action(args(post("/app/onboarding", { intent: "start_trial" })))).toEqual({
    ok: false,
    errorCode: "store_not_supported",
  });
  mocks.startTrial.mockResolvedValueOnce({ status: "expired" });
  expect(await action(args(post("/app/onboarding", { intent: "start_trial" })))).toEqual({
    ok: false,
    errorCode: "trial_unavailable",
  });
  expect(await action(args(post("/app/onboarding", { intent: "start_trial" })))).toEqual({
    ok: true,
  });
  expect(await action(args(post("/app/onboarding", { intent: "unknown" })))).toEqual({
    ok: false,
    errorCode: "generic",
  });

  mocks.readOnboarding.mockResolvedValueOnce({ validationEnabled: false });
  expect(
    await action(
      args(
        post("/app/onboarding", {
          intent: "finish",
          address2Shown: "1",
          address2: "declared",
        }),
      ),
    ),
  ).toEqual({ ok: true });
  expect(mocks.saveAddress2Declaration).toHaveBeenCalledWith(db, session.shop, true);
  expect(mocks.recordEvent).toHaveBeenCalledWith(
    db,
    expect.objectContaining({ name: "onboarding_completed", metadata: { enabled: false } }),
  );
});

test("Onboarding attiva solo dopo una scrittura confermata", async () => {
  const { action } = await import("../app/routes/app.onboarding");
  mocks.writeValidation.mockResolvedValueOnce({ ok: false, errorCode: "validation_write_failed" });
  expect(await action(args(post("/app/onboarding", { intent: "activate" })))).toEqual({
    ok: false,
    errorCode: "validation_write_failed",
  });
  mocks.writeValidation.mockResolvedValueOnce({ ok: true });
  expect(
    await action(
      args(
        post("/app/onboarding", {
          intent: "activate",
          address2Shown: "1",
        }),
      ),
    ),
  ).toEqual({ ok: true });
  expect(mocks.recordEvent).toHaveBeenCalledWith(
    db,
    expect.objectContaining({ name: "validation_enabled" }),
  );
});

test("Regole espone duplicati, accesso e dichiarazione osservati", async () => {
  const { loader } = await import("../app/routes/app.rules");
  const request = new Request("https://example.test/app/rules?locale=en");
  expect((await loader(args(request))).data).toMatchObject({
    locale: "en",
    duplicateError: null,
    entitled: false,
    address2Declared: false,
  });

  for (const errorCode of ["duplicate_validations", "duplicate_validations_active", "other"]) {
    mocks.reconcile.mockResolvedValueOnce({
      validation: undefined,
      validationEnabled: true,
      entitlement: { kind: "trial", validThrough: "2026-09-10" },
      errorCode,
    });
    mocks.readAddress2Declaration.mockResolvedValueOnce(true);
    expect((await loader(args(request))).data).toMatchObject({
      duplicateError: errorCode === "other" ? null : errorCode,
      entitled: true,
      address2Declared: true,
    });
  }
});

test("Regole rifiuta valori estranei e conserva tutti i dati validi", async () => {
  const { action } = await import("../app/routes/app.rules");
  for (const values of [
    { taxCode: "x", pec: "unmanaged" },
    { taxCode: "unmanaged", pec: "x" },
  ]) {
    expect(await action(args(post("/app/rules", values)))).toEqual({
      ok: false,
      errorCode: "generic",
    });
  }

  mocks.writeValidation.mockResolvedValueOnce({ ok: true });
  expect(
    await action(
      args(
        post("/app/rules", {
          taxCode: "required_validated",
          pec: "optional_validated",
          errorDisplay: "preventive",
          configHash: "hash",
          address2Shown: "1",
          address2: "declared",
        }),
      ),
    ),
  ).toEqual({ ok: true });
  expect(mocks.writeValidation).toHaveBeenLastCalledWith(
    admin,
    db,
    session.shop,
    {
      rules: { taxCode: "required_validated", pec: "optional_validated" },
      errorDisplay: "preventive",
    },
    null,
    "hash",
    true,
  );

  mocks.writeValidation.mockResolvedValueOnce({ ok: false, errorCode: "config_conflict" });
  expect(
    await action(
      args(post("/app/rules", { taxCode: "unmanaged", pec: "unmanaged", configHash: "" })),
    ),
  ).toEqual({ ok: false, errorCode: "config_conflict" });
});
