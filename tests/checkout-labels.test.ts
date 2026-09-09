import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  CHECKOUT_LABEL_KEYS,
  address2Reference,
  checkoutLabelCopy,
  checkoutLabelFamily,
  checkoutLabelName,
  observedLabelForSlot,
  checkoutLabelsMode,
  checkoutLabelsSetupDone,
  checkoutLabelsStatus,
  classifyAddress2,
  type CheckoutLabelSlot,
} from "../app/checkout-labels/domain";
import {
  readCheckoutLabels,
  registerCheckoutLabelTranslations,
  removeCheckoutLabelTranslation,
} from "../app/checkout-labels/shopify.server";
import {
  claimCheckoutLabelSlot,
  confirmGuidedCheckoutLabelSlots,
  enableCheckoutLabels,
  markCheckoutLabelsResult,
  markCheckoutLabelsScopeRequired,
  persistCheckoutLabelObservation,
  readCheckoutLabelState,
  readStoredCheckoutLabelSlots,
  saveAddress2Decision,
  saveCheckoutLabelsDecision,
  saveCheckoutLabelWrite,
  stopCheckoutLabelManagement,
} from "../app/checkout-labels/repository.server";
import { saveRulesAndCheckoutLabels } from "../app/checkout-labels/service.server";

const shop = "checkout-labels.example.myshopify.com";
const resourceId = "gid://shopify/OnlineStoreThemeLocaleContent/test-resource";

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM shops WHERE shop_domain = ?").bind(shop).run();
  const now = "2026-09-08T12:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO shops (
       shop_domain, installation_status, installed_at, created_at, updated_at
     ) VALUES (?, 'active', ?, ?, ?)`,
  )
    .bind(shop, now, now, now)
    .run();
  await env.DB.prepare(
    `INSERT INTO app_state (shop_id, updated_at)
     VALUES ((SELECT id FROM shops WHERE shop_domain = ?), ?)`,
  )
    .bind(shop, now)
    .run();
});

afterEach(() => vi.useRealTimers());

test("mantiene l’allowlist esatta, le copie deterministiche e i codici regionali", () => {
  expect(Object.values(CHECKOUT_LABEL_KEYS)).toEqual([
    "shopify.checkout.localized_fields.additional_information.tax_credential_it",
    "shopify.checkout.localized_fields.additional_information.tax_email_it",
    "shopify.checkout.contact.address2_label",
    "shopify.checkout.contact.optional_address2_label",
  ]);
  expect(checkoutLabelName(CHECKOUT_LABEL_KEYS.taxCode)).toBe("taxCode");
  expect(checkoutLabelName("shopify.checkout.contact.unknown")).toBeNull();
  expect(checkoutLabelFamily("it-IT")).toBe("it");
  expect(checkoutLabelFamily("en-GB")).toBe("en");
  expect(checkoutLabelFamily("fr-FR")).toBeNull();
  expect(checkoutLabelCopy("taxCode", "it", "optional_validated")).toBe(
    "Codice fiscale (facoltativo)",
  );
  expect(checkoutLabelCopy("pec", "en", "required_validated")).toBe(
    "Certified email address (PEC)",
  );
  expect(checkoutLabelCopy("taxCode", "it", "required_when_company")).toBe("Codice fiscale");
  expect(
    observedLabelForSlot(slot({ currentValue: null, inheritedValue: "Valore ereditato" })),
  ).toBe("Valore ereditato");
  expect(observedLabelForSlot(slot({ currentValue: null, inheritedValue: null }))).toBe("Interno");
  expect(
    checkoutLabelsMode([
      slot({ name: "taxCode", capability: "automatic" }),
      slot({ name: "pec", capability: "guided" }),
    ]),
  ).toBe("partial");
  expect(checkoutLabelsMode([slot({ name: "taxCode", capability: "automatic" })])).toBe(
    "automatic",
  );
});

test("riduce lo stato D1 ai quattro esiti usati da Home e diagnostica", () => {
  const state = {
    mode: "off" as const,
    managementEpoch: null,
    enabledAt: null,
    lastSyncAt: null,
    lastErrorCode: null,
    decision: "pending" as const,
    acceptedRevision: null,
    reviewedAt: null,
    address2Classification: "unknown" as const,
    address2HasMarketOverride: false,
    address2ExternalChangeAt: null,
    address2Decision: "pending" as const,
    address2ReviewedAt: null,
  };

  expect(checkoutLabelsStatus(state)).toBe("unknown");
  expect(checkoutLabelsSetupDone(state)).toBe(false);
  expect(checkoutLabelsSetupDone({ ...state, decision: "accepted" })).toBe(true);
  expect(
    checkoutLabelsStatus({ ...state, mode: "automatic", lastSyncAt: "2026-09-08T12:00:00Z" }),
  ).toBe("synced");
  expect(checkoutLabelsStatus({ ...state, lastErrorCode: "checkout_labels_scope_required" })).toBe(
    "scope_required",
  );
  expect(
    checkoutLabelsStatus({
      ...state,
      address2Classification: "fiscal_conflict",
      address2Decision: "pending",
    }),
  ).toBe("action_required");
});

test("classifica Interno senza confondere CF isolato con un riferimento fiscale", () => {
  expect(classifyAddress2([slot({ currentValue: "Interno" })])).toEqual({
    classification: "expected",
    hasMarketOverride: false,
  });
  expect(classifyAddress2([slot({ currentValue: "Scala e citofono" })]).classification).toBe(
    "nonstandard",
  );
  expect(classifyAddress2([slot({ currentValue: "CF" })]).classification).toBe("nonstandard");
  expect(classifyAddress2([slot({ currentValue: "Codice fiscale" })]).classification).toBe(
    "fiscal_conflict",
  );
  expect(
    classifyAddress2([
      slot({ currentValue: "Interno" }),
      slot({ marketId: "gid://shopify/Market/1", currentValue: "Tax code" }),
    ]),
  ).toEqual({ classification: "fiscal_conflict", hasMarketOverride: true });
});

test("un readback Admin resta guidato finché la stessa tupla non ha una prova checkout", async () => {
  const graphql = discoveryAdmin();
  const snapshot = await readCheckoutLabels({ graphql });

  expect(snapshot.locales.map(({ locale }) => locale)).toEqual(["it", "en-GB"]);
  expect(snapshot.markets).toEqual([
    {
      id: "gid://shopify/Market/1",
      name: "Italia",
      defaultLocale: "it",
      locales: ["it", "en-GB"],
      resolution: "direct",
    },
  ]);
  expect(snapshot.issues).toEqual([]);
  expect(snapshot.slots.filter(({ capability }) => capability === "automatic")).toEqual([]);
  expect(checkoutLabelsMode(snapshot.slots)).toBe("guided");
  expect(snapshot.address2).toEqual({
    classification: "fiscal_conflict",
    hasMarketOverride: true,
  });
  expect(graphql).toHaveBeenCalledTimes(4);
  expect(graphql.mock.calls[0][0]).not.toContain("186856898864");
});

test("distingue una presenza web ereditata dal mercato", async () => {
  const snapshot = await readCheckoutLabels({ graphql: discoveryAdmin("en-GB", false) });

  expect(snapshot.markets[0]).toMatchObject({
    defaultLocale: "it",
    locales: ["it", "en-GB"],
    resolution: "inherited",
  });
});

test("il discovery ignora contenuti estranei e gestisce contesti Shopify incompleti", async () => {
  const responses = [
    {
      data: {
        shopLocales: [{ locale: "it", name: "Italiano", primary: true, published: true }],
        markets: {
          nodes: [
            {
              id: "gid://shopify/Market/1",
              name: "Italia",
              webPresences: { nodes: [], pageInfo: { hasNextPage: false } },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
    {
      data: {
        translatableResources: {
          nodes: [
            {
              resourceId,
              translatableContent: [
                {
                  key: "shopify.checkout.unrelated",
                  value: "Altro",
                  digest: "digest-altro",
                  locale: "it",
                },
                {
                  key: CHECKOUT_LABEL_KEYS.taxCode,
                  value: "Codice fiscale",
                  digest: "digest-tax-code",
                  locale: "it",
                },
              ],
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
    { data: { translatableResource: null } },
  ];
  const graphql = vi.fn(async () => Response.json(responses.shift()));

  const snapshot = await readCheckoutLabels({ graphql });

  expect(snapshot.markets[0]).toMatchObject({
    defaultLocale: null,
    locales: ["it"],
    resolution: "ambiguous",
  });
  expect(snapshot.slots).toHaveLength(2);
  expect(snapshot.slots).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "taxCode",
        kind: "source",
        currentValue: "Codice fiscale",
        outdated: false,
      }),
      expect.objectContaining({
        name: "taxCode",
        kind: "market_translation",
        marketId: "gid://shopify/Market/1",
        inheritedValue: "Codice fiscale",
      }),
    ]),
  );
});

test("il discovery segnala risorse mancanti, ambigue e paginazione incoerente", async () => {
  const duplicateContent = {
    key: CHECKOUT_LABEL_KEYS.taxCode,
    value: "Codice fiscale",
    digest: "digest-tax-code",
    locale: "it",
  };
  const ambiguous = vi.fn(async (query: string) =>
    Response.json(
      query.includes("DiscoverCheckoutLabelContext")
        ? {
            data: {
              shopLocales: [{ locale: "it", name: "Italiano", primary: true, published: true }],
              markets: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
            },
          }
        : {
            data: {
              translatableResources: {
                nodes: [
                  { resourceId: `${resourceId}-1`, translatableContent: [duplicateContent] },
                  { resourceId: `${resourceId}-2`, translatableContent: [duplicateContent] },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
    ),
  );
  const snapshot = await readCheckoutLabels({ graphql: ambiguous });
  expect(snapshot.issues).toEqual([
    { code: "checkout_labels_resource_ambiguous", key: CHECKOUT_LABEL_KEYS.taxCode },
    { code: "checkout_labels_resource_missing", key: CHECKOUT_LABEL_KEYS.pec },
    { code: "checkout_labels_resource_missing", key: CHECKOUT_LABEL_KEYS.address2 },
    { code: "checkout_labels_resource_missing", key: CHECKOUT_LABEL_KEYS.optionalAddress2 },
  ]);
  expect(snapshot.slots).toEqual([]);

  const repeatedCursor = vi.fn(async (query: string) =>
    Response.json({
      data: query.includes("DiscoverCheckoutLabelContext")
        ? {
            shopLocales: [{ locale: "it", name: "Italiano", primary: true, published: true }],
            markets: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "same" } },
          }
        : {
            translatableResources: {
              nodes: [],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
    }),
  );
  await expect(readCheckoutLabels({ graphql: repeatedCursor })).rejects.toThrow(
    "checkout_labels_readback_failed",
  );

  const repeatedResourceCursor = vi.fn(async (query: string) =>
    Response.json({
      data: query.includes("DiscoverCheckoutLabelContext")
        ? {
            shopLocales: [],
            markets: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
          }
        : {
            translatableResources: {
              nodes: [],
              pageInfo: { hasNextPage: true, endCursor: "same" },
            },
          },
    }),
  );
  await expect(readCheckoutLabels({ graphql: repeatedResourceCursor })).rejects.toThrow(
    "checkout_labels_readback_failed",
  );
});

test("le query ritentano un throttle e rifiutano risposte non valide", async () => {
  vi.useFakeTimers();
  let contextCalls = 0;
  const throttled = vi.fn(async (query: string) => {
    if (query.includes("DiscoverCheckoutLabelResources")) {
      return Response.json({
        data: {
          translatableResources: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    }
    contextCalls += 1;
    return contextCalls === 1
      ? Response.json({
          errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
          extensions: {
            cost: {
              requestedQueryCost: 10,
              throttleStatus: { currentlyAvailable: 0, restoreRate: 100 },
            },
          },
        })
      : Response.json({
          data: {
            shopLocales: [],
            markets: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
          },
        });
  });
  const pending = readCheckoutLabels({ graphql: throttled });
  await vi.runAllTimersAsync();
  await expect(pending).resolves.toMatchObject({ slots: [], issues: expect.any(Array) });
  expect(throttled).toHaveBeenCalledTimes(3);

  await expect(
    readCheckoutLabels({ graphql: vi.fn(async () => new Response(null, { status: 503 })) }),
  ).rejects.toThrow("checkout_labels_readback_failed");
  await expect(
    readCheckoutLabels({
      graphql: vi.fn(async () => Response.json({ errors: [{ message: "Errore" }] })),
    }),
  ).rejects.toThrow("checkout_labels_readback_failed");
});

test("le mutation accettano soltanto le quattro chiavi e rimuovono una singola tupla", async () => {
  const graphql = vi.fn(
    async (_query: string, _options?: { variables?: Record<string, unknown> }) =>
      Response.json({ data: { translationsRemove: { userErrors: [], translations: [] } } }),
  );
  const target = slot({
    name: "taxCode",
    key: CHECKOUT_LABEL_KEYS.taxCode,
    kind: "market_translation",
    locale: "en-GB",
    family: "en",
    marketId: "gid://shopify/Market/1",
  });
  await removeCheckoutLabelTranslation({ graphql }, target);
  expect(graphql.mock.calls[0][1]?.variables).toEqual({
    resourceId,
    translationKeys: [CHECKOUT_LABEL_KEYS.taxCode],
    locales: ["en-GB"],
    marketIds: ["gid://shopify/Market/1"],
  });

  const rejected = vi.fn();
  await expect(
    registerCheckoutLabelTranslations({ graphql: rejected }, resourceId, [
      {
        locale: "en",
        key: "shopify.checkout.contact.unexpected" as typeof CHECKOUT_LABEL_KEYS.taxCode,
        value: "Unexpected",
        translatableContentDigest: "digest",
      },
    ]),
  ).rejects.toThrow("checkout_labels_partial_sync");
  expect(rejected).not.toHaveBeenCalled();

  await removeCheckoutLabelTranslation(
    { graphql },
    { ...target, kind: "global_translation", marketId: null },
  );
  expect(graphql.mock.calls.at(-1)?.[1]?.variables).toMatchObject({ marketIds: null });

  await expect(
    registerCheckoutLabelTranslations({ graphql: rejected }, resourceId, []),
  ).rejects.toThrow("checkout_labels_partial_sync");
});

test("le mutation distinguono digest superati, errori parziali e throttle", async () => {
  const translation = {
    locale: "it",
    key: CHECKOUT_LABEL_KEYS.taxCode,
    value: "Codice fiscale",
    translatableContentDigest: "digest",
  };
  for (const [error, expected] of [
    [
      { code: "INVALID_TRANSLATABLE_CONTENT", message: "digest outdated" },
      "checkout_labels_stale_digest",
    ],
    [{ code: "INVALID_VALUE", message: "non valido" }, "checkout_labels_partial_sync"],
  ] as const) {
    const graphql = vi.fn(async () =>
      Response.json({ data: { translationsRegister: { userErrors: [error] } } }),
    );
    await expect(
      registerCheckoutLabelTranslations({ graphql }, resourceId, [translation]),
    ).rejects.toThrow(expected);
  }

  const missingData = vi.fn(async () => Response.json({ errors: [{ message: "Errore" }] }));
  await expect(
    registerCheckoutLabelTranslations({ graphql: missingData }, resourceId, [translation]),
  ).rejects.toThrow("checkout_labels_readback_failed");
  await expect(removeCheckoutLabelTranslation({ graphql: vi.fn() }, slot())).rejects.toThrow(
    "checkout_labels_partial_sync",
  );

  vi.useFakeTimers();
  const throttled = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        data: { translationsRegister: { userErrors: [{ code: "THROTTLED" }] } },
      }),
    )
    .mockResolvedValueOnce(Response.json({ data: { translationsRegister: { userErrors: [] } } }));
  const pending = registerCheckoutLabelTranslations({ graphql: throttled }, resourceId, [
    translation,
  ]);
  await vi.runAllTimersAsync();
  await expect(pending).resolves.toBeUndefined();
  expect(throttled).toHaveBeenCalledTimes(2);

  const graphqlErrors = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
      }),
    )
    .mockResolvedValueOnce(Response.json({ data: { translationsRegister: { userErrors: [] } } }));
  const retried = registerCheckoutLabelTranslations({ graphql: graphqlErrors }, resourceId, [
    translation,
  ]);
  await vi.runAllTimersAsync();
  await expect(retried).resolves.toBeUndefined();

  const unspecified = vi.fn(async () =>
    Response.json({ data: { translationsRegister: { userErrors: [{}] } } }),
  );
  await expect(
    registerCheckoutLabelTranslations({ graphql: unspecified }, resourceId, [translation]),
  ).rejects.toThrow("checkout_labels_partial_sync");
});

test("D1 conserva baseline e distingue una rimozione da una scrittura mai iniziata", async () => {
  const observed = slot({
    name: "taxCode",
    key: CHECKOUT_LABEL_KEYS.taxCode,
    kind: "global_translation",
    capability: "guided",
    locale: "en-GB",
    family: "en",
    currentValue: "Original",
  });
  await persistCheckoutLabelObservation(env.DB, shop, [observed], {
    classification: "unknown",
    hasMarketOverride: false,
  });
  let stored = await readStoredCheckoutLabelSlots(env.DB, shop);
  expect(stored[0]).toMatchObject({
    capability: "guided",
    managementEpoch: null,
    lastWritePresent: null,
  });

  const epoch = await enableCheckoutLabels(env.DB, shop, "guided");
  expect((await readCheckoutLabelState(env.DB, shop)).managementEpoch).toBe(epoch);
  await env.DB.prepare(
    `UPDATE checkout_label_slots
     SET management_epoch = ?, original_present = 1, original_value = ?
     WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
  )
    .bind(epoch, "Original", shop)
    .run();
  await saveCheckoutLabelWrite(env.DB, shop, observed, null);

  stored = await readStoredCheckoutLabelSlots(env.DB, shop);
  expect(stored[0]).toMatchObject({
    originalPresent: true,
    originalValue: "Original",
    lastWritePresent: false,
    lastWrittenValue: null,
  });
});

test("D1 registra esiti, ownership, decisioni e revoca degli scope", async () => {
  const managed = slot({
    name: "taxCode",
    key: CHECKOUT_LABEL_KEYS.taxCode,
    kind: "global_translation",
    capability: "automatic",
    currentValue: "Codice fiscale",
  });
  const epoch = await enableCheckoutLabels(env.DB, shop, "automatic");
  await claimCheckoutLabelSlot(env.DB, shop, managed, epoch);
  await markCheckoutLabelsResult(env.DB, shop, {
    mode: "automatic",
    errorCode: "checkout_labels_conflict",
    synced: true,
    externalChange: true,
  });
  expect(await readCheckoutLabelState(env.DB, shop)).toMatchObject({
    mode: "automatic",
    lastErrorCode: "checkout_labels_conflict",
    address2ExternalChangeAt: expect.any(String),
  });
  expect((await readStoredCheckoutLabelSlots(env.DB, shop))[0]).toMatchObject({
    managementEpoch: epoch,
    originalPresent: true,
    originalValue: "Codice fiscale",
  });

  await saveAddress2Decision(env.DB, shop, "accepted");
  expect(await readCheckoutLabelState(env.DB, shop)).toMatchObject({
    address2Decision: "accepted",
    address2ExternalChangeAt: null,
  });

  await saveCheckoutLabelsDecision(env.DB, shop, "accepted", "revision-1");
  expect(await readCheckoutLabelState(env.DB, shop)).toMatchObject({
    decision: "accepted",
    acceptedRevision: "revision-1",
    reviewedAt: expect.any(String),
  });
  await saveCheckoutLabelsDecision(env.DB, shop, "pending", null);
  expect(await readCheckoutLabelState(env.DB, shop)).toMatchObject({
    decision: "pending",
    acceptedRevision: null,
    reviewedAt: null,
  });

  await markCheckoutLabelsScopeRequired(env.DB, shop);
  expect(await readCheckoutLabelState(env.DB, shop)).toMatchObject({
    mode: "guided",
    lastErrorCode: "checkout_labels_scope_required",
  });

  await stopCheckoutLabelManagement(env.DB, shop);
  await markCheckoutLabelsScopeRequired(env.DB, shop);
  expect(await readCheckoutLabelState(env.DB, shop)).toMatchObject({
    mode: "off",
    managementEpoch: null,
    lastErrorCode: null,
  });
  expect((await readStoredCheckoutLabelSlots(env.DB, shop))[0]).toMatchObject({
    managementEpoch: null,
    lastWritePresent: null,
  });
  expect(await readCheckoutLabelState(env.DB, "missing.example.myshopify.com")).toMatchObject({
    mode: "off",
    address2Decision: "pending",
  });
});

test("D1 invalida una conferma guidata quando cambia il valore effettivo", async () => {
  const guided = slot({
    name: "taxCode",
    key: CHECKOUT_LABEL_KEYS.taxCode,
    kind: "market_translation",
    capability: "guided",
    currentValue: null,
    inheritedValue: "Codice fiscale",
  });
  await persistCheckoutLabelObservation(env.DB, shop, [guided], {
    classification: "unknown",
    hasMarketOverride: false,
  });
  await confirmGuidedCheckoutLabelSlots(env.DB, shop, [guided]);
  expect((await readStoredCheckoutLabelSlots(env.DB, shop))[0]).toMatchObject({
    guidedConfirmedValue: "Codice fiscale",
    guidedConfirmedAt: expect.any(String),
  });

  await persistCheckoutLabelObservation(
    env.DB,
    shop,
    [{ ...guided, inheritedValue: "Codice fiscale aggiornato" }],
    { classification: "unknown", hasMarketOverride: false },
  );
  expect((await readStoredCheckoutLabelSlots(env.DB, shop))[0]).toMatchObject({
    guidedConfirmedValue: null,
    guidedConfirmedAt: null,
  });
});

test("la prima scrittura automatica richiede il secondo consenso sotto la stessa lease", async () => {
  const initial = await readCheckoutLabels({ graphql: discoveryAdmin("en") });
  await persistCheckoutLabelObservation(env.DB, shop, initial.slots, initial.address2);

  const result = await saveRulesAndCheckoutLabels({ graphql: discoveryAdmin("en") }, env.DB, shop, {
    rules: { taxCode: "required_validated", pec: "optional_validated" },
    expectedConfigHash: null,
    address2Declared: false,
    labelsEnabled: true,
    confirmAutomaticWrite: false,
    expectedLabelsRevision: null,
  });

  expect(result).toEqual({
    ok: false,
    errorCode: "checkout_labels_confirmation_required",
  });
  expect(
    (
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM validation_operation_locks WHERE shop_domain = ?",
      )
        .bind(shop)
        .first<{ count: number }>()
    )?.count,
  ).toBe(0);
  expect((await readCheckoutLabelState(env.DB, shop)).mode).toBe("off");
});

function slot(overrides: Partial<CheckoutLabelSlot> = {}): CheckoutLabelSlot {
  const name = overrides.name ?? "address2";
  const family = overrides.family ?? "it";
  return {
    resourceId,
    key: overrides.key ?? CHECKOUT_LABEL_KEYS[name],
    name,
    locale: overrides.locale ?? family,
    family,
    marketId: null,
    marketName: null,
    kind: "source",
    capability: "read_only",
    currentValue: address2Reference("address2", family),
    inheritedValue: null,
    sourceValue: address2Reference("address2", family),
    sourceDigest: "digest",
    outdated: false,
    ...overrides,
  };
}

function discoveryAdmin(englishLocale = "en-GB", directlyAssigned = true) {
  const content = Object.values(CHECKOUT_LABEL_KEYS).map((key) => ({
    key,
    value:
      key === CHECKOUT_LABEL_KEYS.optionalAddress2
        ? "Interno, scala, ecc. (facoltativo)"
        : key === CHECKOUT_LABEL_KEYS.address2
          ? "Interno"
          : key === CHECKOUT_LABEL_KEYS.taxCode
            ? "Codice fiscale"
            : "PEC",
    digest: `digest-${key}`,
    locale: "it",
  }));
  const responses = [
    {
      data: {
        shopLocales: [
          { locale: "it", name: "Italiano", primary: true, published: true },
          { locale: englishLocale, name: "English", primary: false, published: false },
          { locale: "fr", name: "Français", primary: false, published: true },
        ],
        markets: {
          nodes: [
            {
              id: "gid://shopify/Market/1",
              name: "Italia",
              webPresences: {
                nodes: [
                  {
                    defaultLocale: { locale: "it" },
                    alternateLocales: [{ locale: englishLocale }],
                    markets: {
                      nodes: directlyAssigned ? [{ id: "gid://shopify/Market/1" }] : [],
                      pageInfo: { hasNextPage: false },
                    },
                  },
                ],
                pageInfo: { hasNextPage: false },
              },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
    {
      data: {
        translatableResources: {
          nodes: [{ resourceId, translatableContent: content }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
    {
      data: {
        translatableResource: {
          resourceId,
          translations: [
            {
              key: CHECKOUT_LABEL_KEYS.address2,
              value: "Codice fiscale",
              locale: "it",
              outdated: false,
              market: { id: "gid://shopify/Market/1", name: "Italia" },
            },
          ],
        },
      },
    },
    {
      data: {
        translatableResource: {
          resourceId,
          translations: [
            {
              key: CHECKOUT_LABEL_KEYS.taxCode,
              value: "Italian tax code",
              locale: englishLocale,
              outdated: false,
              market: null,
            },
            {
              key: CHECKOUT_LABEL_KEYS.pec,
              value: "Certified email address (PEC)",
              locale: englishLocale,
              outdated: true,
              market: null,
            },
            {
              key: CHECKOUT_LABEL_KEYS.address2,
              value: "Apartment, suite, etc.",
              locale: englishLocale,
              outdated: false,
              market: null,
            },
            {
              key: CHECKOUT_LABEL_KEYS.optionalAddress2,
              value: "Apartment, suite, etc. (optional)",
              locale: englishLocale,
              outdated: false,
              market: null,
            },
          ],
        },
      },
    },
  ];
  return vi.fn(async (_query: string, _options?: { variables?: Record<string, unknown> }) =>
    Response.json(responses.shift()),
  );
}
