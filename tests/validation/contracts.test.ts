import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_CONFIG,
  completeOnboardingAutomatically,
  configHash,
  configWithEntitlement,
  entitlementDiffers,
  findValidation,
  mutationError,
  observedConfigHash,
  persistValidationState,
  queryContext,
  queryHomeSnapshot,
  readAddress2Declaration,
  readHomeState,
  readOnboarding,
  saveAddress2Declaration,
  saveOnboarding,
  validationEnabledSince,
  type Admin,
  type Validation,
} from "../../app/validation.server";
import {
  duplicateValidationError,
  readValidationReadback,
  validationsForApp,
} from "../../app/validation/shopify.server";
import { insertShop, shopContext } from "../support/lifecycle";

const ENTITLEMENT = { kind: "subscription" as const, validThrough: "2026-09-01" };
const VALIDATION: Validation = {
  id: "gid://shopify/Validation/1",
  title: "CF Ready",
  enabled: true,
  blockOnFailure: false,
  shopifyFunction: { handle: "cf-ready-validation" },
  metafield: { jsonValue: { ...DEFAULT_CONFIG, entitlement: ENTITLEMENT } },
};

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM validation_operation_locks"),
    env.DB.prepare("DELETE FROM app_events"),
    env.DB.prepare("DELETE FROM app_state"),
    env.DB.prepare("DELETE FROM shops"),
  ]);
});

describe("contratti puri Validation", () => {
  test("normalizza configurazioni ed hash ai bordi", async () => {
    expect(entitlementDiffers(null, ENTITLEMENT)).toBe(true);
    expect(entitlementDiffers({ entitlement: null }, ENTITLEMENT)).toBe(true);
    expect(
      entitlementDiffers(
        { entitlement: { kind: "trial", validThrough: "2026-09-01" } },
        ENTITLEMENT,
      ),
    ).toBe(true);
    expect(entitlementDiffers({ entitlement: ENTITLEMENT }, ENTITLEMENT)).toBe(false);
    expect(
      entitlementDiffers({ entitlement: { ...ENTITLEMENT, validThrough: undefined } }, ENTITLEMENT),
    ).toBe(true);
    expect(configWithEntitlement([], ENTITLEMENT)).toMatchObject({
      schemaVersion: 2,
      entitlement: ENTITLEMENT,
    });
    expect(
      configWithEntitlement(
        { schemaVersion: 2, rules: { taxCode: "required" }, marker: true },
        ENTITLEMENT,
      ),
    ).toMatchObject({ marker: true, entitlement: ENTITLEMENT });
    expect(
      configWithEntitlement({ schemaVersion: 1, rules: {}, marker: true }, ENTITLEMENT),
    ).not.toHaveProperty("marker");
    expect(
      configWithEntitlement({ schemaVersion: 2, rules: null, marker: true }, ENTITLEMENT),
    ).not.toHaveProperty("marker");
    expect(await observedConfigHash(undefined)).toBeNull();
    expect(await observedConfigHash({ ...VALIDATION, metafield: null })).toBeNull();
    expect(await observedConfigHash({ ...VALIDATION, metafield: { jsonValue: null } })).toBeNull();
    expect(await observedConfigHash(VALIDATION)).toBe(
      await configHash(VALIDATION.metafield!.jsonValue),
    );
    expect(await configHash([undefined, { b: 1, a: undefined }])).toHaveLength(64);
    expect(await configHash([1, 2])).toBe(
      "49a64717d5d4cb19952e6eac2946415cf6879adacf9908e7d872332d32c6e684",
    );
    expect(await configHash({ a: 1, b: 2 })).toBe(
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
    expect(await configHash({ a: 1, b: 2 })).toBe(await configHash({ b: 2, a: 1 }));
    expect(await configHash({ a: 1, b: 2 })).not.toBe(await configHash({ a: 12 }));
    expect(await configHash(undefined)).toBe(await configHash(null));
  });

  test("identifica esclusivamente la Function CF Ready e rende espliciti i duplicati", async () => {
    const foreign = {
      ...VALIDATION,
      id: "gid://shopify/Validation/foreign",
      shopifyFunction: { handle: "altra-function" },
    };
    expect(validationsForApp([foreign, VALIDATION])).toEqual([VALIDATION]);
    expect(findValidation([foreign])).toBeUndefined();
    expect(() => findValidation([VALIDATION, { ...VALIDATION, id: "2" }])).toThrow();
    expect(duplicateValidationError([])).toBeNull();
    expect(
      duplicateValidationError([
        { ...VALIDATION, enabled: false },
        { ...VALIDATION, id: "2", enabled: false },
      ]),
    ).toBe("duplicate_validations");
    expect(duplicateValidationError([VALIDATION, { ...VALIDATION, id: "2", enabled: false }])).toBe(
      "duplicate_validations_active",
    );
    expect(
      mutationError({ data: { validationUpdate: { userErrors: [] } } }, "validationUpdate"),
    ).toBeNull();
    expect(
      mutationError(
        {
          data: {
            validationCreate: { userErrors: [{ message: "limite" }, { message: "raggiunto" }] },
          },
        },
        "validationCreate",
      ),
    ).toBe("limite raggiunto");
    expect(
      await readValidationReadback({
        graphql: vi.fn(async () => {
          throw new Error("rete");
        }),
      }),
    ).toBeNull();
  });
});

describe("paginazione e snapshot Shopify", () => {
  test("rifiuta contesto mancante, errori top-level e cursore iniziale assente", async () => {
    for (const body of [
      {},
      { ...shopContext("IT", null), errors: [{ message: "errore", path: [] }] },
      {
        data: {
          ...shopContext("IT", null).data,
          validations: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } },
        },
      },
    ]) {
      const admin = { graphql: vi.fn(async () => Response.json(body)) };
      await expect(
        body === (body as { data?: unknown }) && "errors" in body
          ? queryHomeSnapshot(admin)
          : queryContext(admin),
      ).rejects.toMatchObject({ status: 502 });
    }
  });

  test("rifiuta una pagina successiva senza data e accetta un cursore finale non iterato", async () => {
    const first = {
      data: {
        ...shopContext("IT", null).data,
        validations: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "pagina-2" } },
      },
    };
    await expect(
      queryContext({
        graphql: vi
          .fn()
          .mockResolvedValueOnce(Response.json(first))
          .mockResolvedValueOnce(Response.json({ errors: [{ message: "errore" }] })),
      }),
    ).rejects.toMatchObject({ status: 502 });

    const result = await queryContext({
      graphql: vi
        .fn()
        .mockResolvedValueOnce(Response.json(first))
        .mockResolvedValueOnce(
          Response.json({
            data: {
              ...shopContext("IT", null).data,
              validations: {
                nodes: [VALIDATION],
                pageInfo: { hasNextPage: false, endCursor: "finale" },
              },
            },
          }),
        ),
    });
    expect(result.validations.nodes).toEqual([VALIDATION]);
  });

  test("isola un errore billing paginato senza perdere shop e Validation", async () => {
    const snapshot = {
      data: {
        ...shopContext("IT", true, ENTITLEMENT).data,
        currentAppInstallation: {
          activeSubscriptions: [],
          oneTimePurchases: {
            nodes: [],
            pageInfo: { hasNextPage: true, endCursor: "billing-2" },
          },
        },
      },
    };
    const admin: Admin = {
      graphql: vi
        .fn()
        .mockResolvedValueOnce(Response.json(snapshot))
        .mockRejectedValueOnce(new Error("billing non disponibile")),
    };
    const result = await queryHomeSnapshot(admin);
    expect(result.shop.name).toBe("Store di prova");
    expect(result.billing).toMatchObject({ state: null, error: expect.any(Error) });
  });
});

describe("stato D1 Validation", () => {
  test("fornisce default completi quando lo store non ha ancora stato", async () => {
    expect(await readHomeState(env.DB, "assente.myshopify.com")).toEqual({
      onboarding: {
        status: "not_started",
        step: 1,
        errorCode: null,
        validationEnabled: false,
      },
      address2Declaration: null,
      merchantCheckInDismissed: false,
      enabledSince: null,
    });
    expect(await readOnboarding(env.DB, "assente.myshopify.com")).toEqual({
      status: "not_started",
      step: 1,
      errorCode: null,
      validationEnabled: false,
    });
    expect(await readAddress2Declaration(env.DB, "assente.myshopify.com")).toBeNull();
    expect(await validationEnabledSince(env.DB, "assente.myshopify.com")).toBeNull();
  });

  test("clampa onboarding, conserva completamento e legge l'ultima attivazione", async () => {
    const shop = await insertShop("stato-validation.myshopify.com");
    await persistValidationState(env.DB, shop, {
      displayName: "Negozio",
      countryCode: "IT",
      eligible: true,
      validation: VALIDATION,
      errorCode: null,
    });
    await saveOnboarding(env.DB, shop, { status: "in_progress", step: 99 });
    expect(await readOnboarding(env.DB, shop)).toMatchObject({ status: "in_progress", step: 4 });
    expect(await completeOnboardingAutomatically(env.DB, shop)).toBe(true);
    expect(await completeOnboardingAutomatically(env.DB, shop)).toBe(false);
    await saveOnboarding(env.DB, shop, { status: "in_progress", step: 3 });
    expect(await readOnboarding(env.DB, shop)).toMatchObject({ status: "completed", step: 1 });

    expect(await readAddress2Declaration(env.DB, shop)).toBeNull();
    await saveAddress2Declaration(env.DB, shop, true);
    expect(await readAddress2Declaration(env.DB, shop)).toMatch(/^\d{4}-/);
    await saveAddress2Declaration(env.DB, shop, false);
    expect(await readAddress2Declaration(env.DB, shop)).toBeNull();

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO app_events (shop_id, event_name, event_class, occurred_at) SELECT id, 'validation_enabled', 'validation', '2026-08-01T00:00:00.000Z' FROM shops WHERE shop_domain = ?",
      ).bind(shop),
      env.DB.prepare(
        "INSERT INTO app_events (shop_id, event_name, event_class, occurred_at) SELECT id, 'validation_enabled', 'validation', '2026-08-02T00:00:00.000Z' FROM shops WHERE shop_domain = ?",
      ).bind(shop),
    ]);
    expect(await validationEnabledSince(env.DB, shop)).toBe("2026-08-02T00:00:00.000Z");
  });
});
