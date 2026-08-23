import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import { localDate, startTrial, syncBillingAccount } from "../app/billing.server";
import {
  acquireValidationLock,
  configHash,
  DEFAULT_CONFIG,
  findValidation,
  mutationError,
  queryContext,
  readAddress2Declaration,
  readConfig,
  releaseValidationLockBestEffort,
  renewValidationLock,
  startValidationLockHeartbeat,
  withValidationLock,
  writeValidation,
} from "../app/validation.server";
import type { CheckoutConfig } from "../app/validation.server";
import type { ShopifyBilling } from "../app/billing.server";

test("la configurazione scritta è accettata dalla Function", () => {
  expect(DEFAULT_CONFIG).toMatchObject({
    schemaVersion: 2,
    enabled: false,
    errorDisplay: "inline",
    entitlement: { kind: "none", validThrough: null },
    rules: {
      taxCode: "unmanaged",
      pec: "unmanaged",
    },
  });
});

test("l'hash di configurazione ignora l'ordine dei campi ma non i valori", async () => {
  const hash = await configHash({ schemaVersion: 2, rules: { pec: "optional_validated" } });

  expect(await configHash({ rules: { pec: "optional_validated" }, schemaVersion: 2 })).toBe(hash);
  expect(await configHash({ schemaVersion: 2, rules: { pec: "unmanaged" } })).not.toBe(hash);
});

const validation = {
  id: "gid://shopify/Validation/1",
  title: "titolo modificato",
  enabled: false,
  blockOnFailure: false,
  shopifyFunction: { handle: "cf-ready-validation" },
  metafield: { jsonValue: { pocVersion: 999 } },
};

test("pagina tutte le Validation e usa il Function handle come identità", async () => {
  const cursors: unknown[] = [];
  const pages = [
    {
      data: {
        shop: {
          name: "CF Ready Dev",
          plan: { partnerDevelopment: true },
          shopAddress: { countryCodeV2: "IT" },
        },
        validations: {
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: "page-2" },
        },
      },
    },
    {
      data: {
        shop: {
          name: "CF Ready Dev",
          plan: { partnerDevelopment: true },
          shopAddress: { countryCodeV2: "IT" },
        },
        validations: {
          nodes: [validation],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
  ];
  const data = await queryContext({
    graphql: async (_query, options) => {
      cursors.push(options?.variables?.after);
      return Response.json(pages.shift());
    },
  });

  expect(cursors).toEqual([null, "page-2"]);
  expect(data.shop.plan.partnerDevelopment).toBe(true);
  expect(findValidation(data.validations.nodes)?.id).toBe(validation.id);
});

test("interrompe la paginazione Shopify se il cursore non avanza", async () => {
  let calls = 0;
  const page = {
    data: {
      shop: {
        name: "CF Ready Dev",
        plan: { partnerDevelopment: true },
        shopAddress: { countryCodeV2: "IT" },
      },
      validations: {
        nodes: [],
        pageInfo: { hasNextPage: true, endCursor: "stalled" },
      },
    },
  };

  await expect(
    queryContext({
      graphql: async () => {
        calls += 1;
        return Response.json(page);
      },
    }),
  ).rejects.toMatchObject({ status: 502 });
  expect(calls).toBe(2);
});

test("trasforma una risposta GraphQL senza data in errore operativo", () => {
  expect(mutationError({ errors: [{ message: "errore temporaneo" }] }, "validationCreate")).toBe(
    "Operazione Shopify non riuscita.",
  );
});

test("un errore di trasporto Validation resta nel risultato tipizzato", async () => {
  const shop = "trasporto-validation.example.myshopify.com";
  await seedShop(shop);

  expect(
    await writeValidation(
      { graphql: async () => Promise.reject(new Error("Shopify non disponibile")) },
      env.DB,
      shop,
      {
        rules: DEFAULT_CONFIG.rules,
        errorDisplay: DEFAULT_CONFIG.errorDisplay,
        messages: DEFAULT_CONFIG.messages,
      },
      null,
    ),
  ).toEqual({ ok: false, errorCode: "validation_write_failed" });
});

test("mantiene un solo lock Validation mentre il proprietario lo rinnova", async () => {
  const now = 1_000;
  const shop = "concurrent.example.myshopify.com";
  const timestamp = "2026-07-28T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO shops (
       shop_domain, installation_status, installed_at, created_at, updated_at
     ) VALUES (?, 'active', ?, ?, ?)`,
  )
    .bind(shop, timestamp, timestamp, timestamp)
    .run();

  const locks = await Promise.all([
    acquireValidationLock(env.DB, shop, now, "request-a"),
    acquireValidationLock(env.DB, shop, now, "request-b"),
  ]);
  expect(locks.filter(Boolean)).toHaveLength(1);

  const owner = locks.find((lock): lock is string => Boolean(lock))!;
  expect(await renewValidationLock(env.DB, shop, owner, now + 40_000)).toBe(true);
  expect(await acquireValidationLock(env.DB, shop, now + 61_000, "request-c")).toBeNull();

  await releaseValidationLockBestEffort(env.DB, shop, owner);
  expect(await acquireValidationLock(env.DB, shop, now + 61_000, "request-c")).toBe("request-c");
});

test("il cleanup del lock non sovrascrive l'esito dell'operazione", async () => {
  const unavailableDb = {
    prepare: () => ({
      bind: () => ({
        run: async () => {
          throw new Error("D1 temporaneamente non disponibile");
        },
      }),
    }),
  } as unknown as D1Database;

  await expect(
    releaseValidationLockBestEffort(unavailableDb, "cleanup.example.myshopify.com", "owner"),
  ).resolves.toBeUndefined();
});

test("il heartbeat ritenta dopo un errore D1 transitorio", async () => {
  vi.useFakeTimers();
  let attempts = 0;
  const recoveringDb = {
    prepare: () => ({
      bind: () => ({
        first: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("D1 temporaneamente non disponibile");
          return { owner_token: "owner" };
        },
      }),
    }),
  } as unknown as D1Database;
  const heartbeat = startValidationLockHeartbeat(
    recoveringDb,
    "heartbeat.example.myshopify.com",
    "owner",
  );

  try {
    await vi.advanceTimersByTimeAsync(40_000);
    expect(attempts).toBe(2);
    expect(await heartbeat.isHeld()).toBe(true);
  } finally {
    await heartbeat.stop();
    vi.useRealTimers();
  }
});

test("la lease condivisa resta posseduta durante un'operazione lunga", async () => {
  vi.useFakeTimers();
  const shop = "heartbeat-lock.example.myshopify.com";
  await seedShop(shop);
  const startedAt = Date.now();

  try {
    const result = await withValidationLock(env.DB, shop, async (heartbeat) => {
      await vi.advanceTimersByTimeAsync(40_000);
      expect(await heartbeat.isHeld()).toBe(true);
      expect(await acquireValidationLock(env.DB, shop, startedAt + 61_000, "intruso")).toBeNull();
      return "completata";
    });

    expect(result).toEqual({ acquired: true, result: "completata" });
  } finally {
    vi.useRealTimers();
  }
});

test("una configurazione illeggibile o fuori contratto torna ai default senza lanciare", () => {
  expect(readConfig(undefined)).toMatchObject(DEFAULT_CONFIG);
  expect(readConfig({ schemaVersion: 99, rules: { taxCode: "required_validated" } })).toMatchObject(
    DEFAULT_CONFIG,
  );

  const config = readConfig({
    schemaVersion: 2,
    enabled: true,
    errorDisplay: "urlato",
    rules: { taxCode: "required_validated", pec: "chissà" },
    messages: {
      it: { taxCodeRequired: "  Inserisci il Codice Fiscale.  ", pecRequired: "x".repeat(201) },
      en: {},
    },
  });

  expect(config.rules).toEqual({ taxCode: "required_validated", pec: "unmanaged" });
  expect(config.errorDisplay).toBe("inline");
  expect(config.messages.it.taxCodeRequired).toBe("Inserisci il Codice Fiscale.");
  // FR-061: un messaggio vuoto o oltre i 200 caratteri non può restare nell'editor.
  expect(config.messages.it.pecRequired).toBe(DEFAULT_CONFIG.messages.it.pecRequired);
  expect(config.messages.en).toEqual(DEFAULT_CONFIG.messages.en);
});

// La prova non parte più all'installazione: la avvia il merchant. Questi test descrivono
// uno store già operativo, quindi la avviano subito; chi verifica il comportamento senza
// alcun diritto passa `trial: false`.
async function seedShop(shop: string, { trial = true }: { trial?: boolean } = {}) {
  const timestamp = "2026-07-31T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO shops (
       shop_domain, country_code, installation_status, installed_at, created_at, updated_at
     ) VALUES (?, 'IT', 'active', ?, ?, ?)`,
  )
    .bind(shop, timestamp, timestamp, timestamp)
    .run();
  if (trial) {
    await startTrial(env.DB, shop, { eligible: true, today: localDate("Europe/Rome") });
  }
}

function stubAdmin({
  existing,
  userErrors = [],
  billing = { subscription: null, oneTime: null, pendingOneTime: false },
  billingError = false,
  readback,
}: {
  existing?: { enabled: boolean; config?: CheckoutConfig };
  userErrors?: { message: string }[];
  billing?: ShopifyBilling;
  billingError?: boolean;
  readback?: (config: CheckoutConfig) => CheckoutConfig;
}) {
  const calls: { operation: string; enable?: boolean; config?: CheckoutConfig }[] = [];
  let node = existing
    ? {
        id: "gid://shopify/Validation/1",
        title: "CF Ready",
        enabled: existing.enabled,
        blockOnFailure: false,
        shopifyFunction: { handle: "cf-ready-validation" },
        metafield: { jsonValue: existing.config ?? DEFAULT_CONFIG },
      }
    : undefined;

  return {
    calls,
    admin: {
      graphql: async (query: string, options?: { variables?: Record<string, any> }) => {
        if (query.includes("CfReadyContext")) {
          return Response.json({
            data: {
              shop: {
                name: "CF Ready Dev",
                ianaTimezone: "Europe/Rome",
                shopAddress: { countryCodeV2: "IT" },
              },
              validations: {
                nodes: node ? [node] : [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          });
        }
        if (query.includes("CfReadyBilling")) {
          if (billingError) throw new Error("Shopify non disponibile");
          return Response.json({
            data: {
              currentAppInstallation: {
                activeSubscriptions: billing.subscription
                  ? [
                      {
                        ...billing.subscription,
                        status: "ACTIVE",
                        test: true,
                        lineItems: [
                          {
                            plan: {
                              pricingDetails: {
                                interval: billing.subscription.interval,
                                price: {
                                  amount: billing.subscription.amount,
                                  currencyCode: billing.subscription.currency,
                                },
                              },
                            },
                          },
                        ],
                      },
                    ]
                  : [],
                oneTimePurchases: {
                  nodes: billing.oneTime
                    ? [
                        {
                          ...billing.oneTime,
                          name: "CF Ready",
                          status: "ACTIVE",
                          test: true,
                          price: {
                            amount: billing.oneTime.amount,
                            currencyCode: billing.oneTime.currency,
                          },
                        },
                      ]
                    : [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          });
        }

        const operation = query.includes("CfReadyValidationCreate")
          ? "validationCreate"
          : "validationUpdate";
        const input = options?.variables?.validation;
        const config = JSON.parse(input.metafields[0].value) as CheckoutConfig;
        calls.push({ operation, enable: input.enable, config });

        if (!userErrors.length) {
          node = {
            id: "gid://shopify/Validation/1",
            title: "CF Ready",
            enabled: input.enable,
            blockOnFailure: false,
            shopifyFunction: { handle: "cf-ready-validation" },
            metafield: { jsonValue: readback?.(config) ?? config },
          };
        }
        return Response.json({ data: { [operation]: { userErrors } } });
      },
    },
  };
}

test("il primo salvataggio crea la Validation disattivata e non la attiva", async () => {
  const shop = "first-save.example.myshopify.com";
  await seedShop(shop);
  const { admin, calls } = stubAdmin({});

  const result = await writeValidation(
    admin,
    env.DB,
    shop,
    {
      rules: { taxCode: "required_validated", pec: "unmanaged" },
      errorDisplay: "preventive",
      messages: DEFAULT_CONFIG.messages,
    },
    null,
  );

  expect(result).toEqual({ ok: true, enabled: false });
  expect(calls).toHaveLength(1);
  expect(calls[0].operation).toBe("validationCreate");
  // FR-051: salvare non attiva. La configurazione esiste comunque, perché vive nel metafield
  // della Validation e senza owner non avrebbe dove stare.
  expect(calls[0].enable).toBe(false);
  expect(calls[0].config).toMatchObject({
    enabled: false,
    errorDisplay: "preventive",
    rules: { taxCode: "required_validated", pec: "unmanaged" },
  });
});

test("il salvataggio conserva lo stato di una Validation già attiva", async () => {
  const shop = "keep-enabled.example.myshopify.com";
  await seedShop(shop);
  const { admin, calls } = stubAdmin({ existing: { enabled: true } });

  const result = await writeValidation(
    admin,
    env.DB,
    shop,
    {
      rules: { taxCode: "optional_validated", pec: "optional_validated" },
      errorDisplay: "inline",
      messages: DEFAULT_CONFIG.messages,
    },
    null,
  );

  expect(result).toEqual({ ok: true, enabled: true });
  expect(calls[0].operation).toBe("validationUpdate");
  expect(calls[0].enable).toBe(true);
  expect(calls[0].config).toMatchObject({ enabled: true });
});

test("il salvataggio parziale conserva la configurazione osservata sotto la lease", async () => {
  const shop = "partial-save.example.myshopify.com";
  await seedShop(shop);
  const current = structuredClone(DEFAULT_CONFIG);
  current.errorDisplay = "preventive";
  current.messages.it.taxCodeRequired = "Messaggio personalizzato";
  const { admin, calls } = stubAdmin({ existing: { enabled: false, config: current } });

  expect(
    await writeValidation(
      admin,
      env.DB,
      shop,
      {
        rules: { taxCode: "required_validated", pec: "optional_validated" },
      },
      null,
    ),
  ).toEqual({ ok: true, enabled: false });
  expect(calls[0].config).toMatchObject({
    errorDisplay: "preventive",
    messages: { it: { taxCodeRequired: "Messaggio personalizzato" } },
    rules: { taxCode: "required_validated", pec: "optional_validated" },
  });
});

test.each(["messaggio", "entitlement"] as const)(
  "il readback rifiuta una configurazione con %s diverso",
  async (field) => {
    const shop = `readback-${field}.example.myshopify.com`;
    await seedShop(shop);
    const { admin } = stubAdmin({
      existing: { enabled: false },
      readback: (config) => {
        const altered = structuredClone(config);
        if (field === "messaggio") altered.messages.it.taxCodeRequired += " diverso";
        else altered.entitlement = { kind: "none", validThrough: null };
        return altered;
      },
    });

    expect(
      await writeValidation(
        admin,
        env.DB,
        shop,
        {
          rules: DEFAULT_CONFIG.rules,
          errorDisplay: DEFAULT_CONFIG.errorDisplay,
          messages: DEFAULT_CONFIG.messages,
        },
        null,
      ),
    ).toEqual({ ok: false, errorCode: "validation_readback_failed" });
  },
);

test("ogni scrittura riconcilia il billing Shopify prima dell'entitlement", async () => {
  const activeShop = "write-paid.example.myshopify.com";
  await seedShop(activeShop);
  // Mezzogiorno UTC, non l'ora corrente: `entitlementFor` esprime la scadenza nel fuso
  // dello store (`Europe/Rome` nello stub), quindi una scadenza che cade fra le 22:00 e la
  // mezzanotte UTC a Roma è già il giorno dopo. Con l'ora corrente il confronto qui sotto
  // falliva per due ore al giorno, ovunque, CI compresa.
  const currentPeriodEnd = (() => {
    const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
    end.setUTCHours(12, 0, 0, 0);
    return end.toISOString();
  })();
  const subscription: ShopifyBilling = {
    subscription: {
      id: "gid://shopify/AppSubscription/write-paid",
      name: "launch-monthly",
      currentPeriodEnd,
      interval: "EVERY_30_DAYS",
      amount: "2.99",
      currency: "EUR",
    },
    oneTime: null,
    pendingOneTime: false,
  };
  const active = stubAdmin({ existing: { enabled: false }, billing: subscription });

  await writeValidation(
    active.admin,
    env.DB,
    activeShop,
    {
      rules: DEFAULT_CONFIG.rules,
      errorDisplay: DEFAULT_CONFIG.errorDisplay,
      messages: DEFAULT_CONFIG.messages,
    },
    null,
  );
  expect(active.calls[0].config?.entitlement).toEqual({
    kind: "subscription",
    validThrough: currentPeriodEnd.slice(0, 10),
  });

  const refundedShop = "write-refunded.example.myshopify.com";
  // Prova già esaurita: la riga viene inserita qui sotto, non avviata adesso.
  await seedShop(refundedShop, { trial: false });
  await env.DB.prepare(
    `INSERT INTO trials (
       shop_id, status, eligible_at, started_at, ends_at, pricing_generation, created_at, updated_at
     ) SELECT id, 'expired', '2026-01-01', '2026-01-01', '2026-01-14', 'launch',
              '2026-01-01', '2026-01-15' FROM shops WHERE shop_domain = ?`,
  )
    .bind(refundedShop)
    .run();
  await syncBillingAccount(
    env.DB,
    refundedShop,
    {
      subscription: null,
      oneTime: {
        id: "gid://shopify/AppPurchaseOneTime/write-refunded",
        createdAt: "2026-01-01T00:00:00Z",
        amount: "89.90",
        currency: "EUR",
      },
      pendingOneTime: false,
    },
    { today: "2026-01-01", timeZone: "Europe/Rome", pricingGeneration: "launch" },
  );
  const refunded = stubAdmin({ existing: { enabled: false } });

  await writeValidation(
    refunded.admin,
    env.DB,
    refundedShop,
    {
      rules: DEFAULT_CONFIG.rules,
      errorDisplay: DEFAULT_CONFIG.errorDisplay,
      messages: DEFAULT_CONFIG.messages,
    },
    null,
  );
  expect(refunded.calls[0].config?.entitlement).toEqual({ kind: "none", validThrough: null });

  const cachedShop = "write-billing-cache.example.myshopify.com";
  await seedShop(cachedShop);
  await syncBillingAccount(env.DB, cachedShop, subscription, {
    today: "2026-08-01",
    timeZone: "Europe/Rome",
    pricingGeneration: "launch",
  });
  const cached = stubAdmin({ existing: { enabled: false }, billingError: true });
  await writeValidation(
    cached.admin,
    env.DB,
    cachedShop,
    {
      rules: DEFAULT_CONFIG.rules,
      errorDisplay: DEFAULT_CONFIG.errorDisplay,
      messages: DEFAULT_CONFIG.messages,
    },
    null,
  );
  expect(cached.calls[0].config?.entitlement).toEqual({ kind: "none", validThrough: null });

  const syncFailureShop = "write-billing-sync-failure.example.myshopify.com";
  await seedShop(syncFailureShop);
  await syncBillingAccount(
    env.DB,
    syncFailureShop,
    {
      subscription: null,
      oneTime: {
        id: "gid://shopify/AppPurchaseOneTime/write-sync-failure",
        createdAt: "2026-01-01T00:00:00Z",
        amount: "89.90",
        currency: "EUR",
      },
      pendingOneTime: false,
    },
    { today: "2026-01-01", timeZone: "Europe/Rome", pricingGeneration: "launch" },
  );
  await env.DB.prepare(
    `CREATE TRIGGER fail_validation_billing_sync BEFORE UPDATE ON billing_accounts
     WHEN OLD.shop_id = (
       SELECT id FROM shops
       WHERE shop_domain = 'write-billing-sync-failure.example.myshopify.com'
     )
     BEGIN SELECT RAISE(ABORT, 'd1 transient failure'); END`,
  ).run();
  const syncFailure = stubAdmin({ existing: { enabled: false } });
  try {
    expect(
      await writeValidation(
        syncFailure.admin,
        env.DB,
        syncFailureShop,
        {
          rules: DEFAULT_CONFIG.rules,
          errorDisplay: DEFAULT_CONFIG.errorDisplay,
          messages: DEFAULT_CONFIG.messages,
        },
        null,
      ),
    ).toEqual({ ok: false, errorCode: "validation_write_failed" });
    expect(syncFailure.calls).toHaveLength(0);
  } finally {
    await env.DB.prepare("DROP TRIGGER fail_validation_billing_sync").run();
  }
});

test("il limite di Validation attive ha un codice stabile e non perde la configurazione", async () => {
  const shop = "limit.example.myshopify.com";
  await seedShop(shop);
  const { admin } = stubAdmin({
    userErrors: [{ message: "You have reached the maximum number of active validations." }],
  });

  const result = await writeValidation(
    admin,
    env.DB,
    shop,
    {
      rules: { taxCode: "required_validated", pec: "unmanaged" },
      errorDisplay: "inline",
      messages: DEFAULT_CONFIG.messages,
    },
    true,
  );

  // FR-098: nessuna Validation di terzi toccata, codice stabile, stato locale non falsamente attivo.
  expect(result).toEqual({ ok: false, errorCode: "validation_limit_reached" });
  const state = await env.DB.prepare(
    `SELECT validation_enabled, last_error_code FROM app_state
     WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
  )
    .bind(shop)
    .first<{ validation_enabled: number; last_error_code: string }>();
  expect(state).toMatchObject({
    validation_enabled: 0,
    last_error_code: "validation_limit_reached",
  });
});

test("il salvataggio non sovrascrive la configurazione cambiata da un'altra sessione", async () => {
  const shop = "conflict.example.myshopify.com";
  await seedShop(shop);
  const { admin, calls } = stubAdmin({ existing: { enabled: false } });

  const stale = await writeValidation(
    admin,
    env.DB,
    shop,
    {
      rules: { taxCode: "required_validated", pec: "unmanaged" },
      errorDisplay: "inline",
      messages: DEFAULT_CONFIG.messages,
    },
    null,
    "firma-di-una-configurazione-precedente",
  );

  // §11.4: nessuna mutazione parte, così il lavoro dell'altra sessione resta intatto.
  expect(stale).toEqual({ ok: false, errorCode: "config_conflict" });
  expect(calls).toHaveLength(0);

  const current = await writeValidation(
    admin,
    env.DB,
    shop,
    {
      rules: { taxCode: "required_validated", pec: "unmanaged" },
      errorDisplay: "inline",
      messages: DEFAULT_CONFIG.messages,
    },
    null,
    await configHash(DEFAULT_CONFIG),
  );

  expect(current).toEqual({ ok: true, enabled: false });
  expect(calls).toHaveLength(1);
});

test("la dichiarazione D1 cambia soltanto dopo il successo Shopify", async () => {
  const shop = "declaration-after-shopify.example.myshopify.com";
  await seedShop(shop);
  let lockHeldDuringDeclaration = false;
  const observedDb = {
    prepare(query: string) {
      const statement = env.DB.prepare(query);
      if (!query.includes("SET address2_conflict_declared_at")) return statement;
      return {
        bind(...values: unknown[]) {
          const bound = statement.bind(...values);
          return {
            async run() {
              lockHeldDuringDeclaration = Boolean(
                await env.DB.prepare(
                  "SELECT 1 FROM validation_operation_locks WHERE shop_domain = ?",
                )
                  .bind(shop)
                  .first(),
              );
              return bound.run();
            },
          };
        },
      } as unknown as D1PreparedStatement;
    },
    batch: env.DB.batch.bind(env.DB),
  } as unknown as D1Database;
  const { admin } = stubAdmin({ existing: { enabled: false } });
  const next = {
    rules: DEFAULT_CONFIG.rules,
    errorDisplay: DEFAULT_CONFIG.errorDisplay,
    messages: DEFAULT_CONFIG.messages,
  };

  expect(
    await writeValidation(admin, observedDb, shop, next, null, "configurazione-superata", true),
  ).toEqual({ ok: false, errorCode: "config_conflict" });
  expect(await readAddress2Declaration(env.DB, shop)).toBeNull();

  expect(
    await writeValidation(
      admin,
      observedDb,
      shop,
      next,
      null,
      await configHash(DEFAULT_CONFIG),
      true,
    ),
  ).toEqual({ ok: true, enabled: false });
  expect(lockHeldDuringDeclaration).toBe(true);
  expect(await readAddress2Declaration(env.DB, shop)).not.toBeNull();
});

test("l'attivazione conserva la configurazione letta dentro la lease", async () => {
  const shop = "activate-no-hash.example.myshopify.com";
  await seedShop(shop);
  const current = structuredClone(DEFAULT_CONFIG);
  current.rules = { taxCode: "optional_validated", pec: "required_validated" };
  current.messages.it.taxCodeRequired = "Messaggio corrente";
  const { admin, calls } = stubAdmin({ existing: { enabled: false, config: current } });

  const result = await writeValidation(admin, env.DB, shop, null, true);

  expect(result).toEqual({ ok: true, enabled: true });
  expect(calls[0].enable).toBe(true);
  expect(calls[0].config).toMatchObject({
    rules: current.rules,
    messages: { it: { taxCodeRequired: "Messaggio corrente" } },
  });
});

test("una Validation spenta non si attiva senza diritto valido", async () => {
  const shop = "activate-no-entitlement.example.myshopify.com";
  await seedShop(shop, { trial: false });
  await env.DB.prepare(
    `INSERT INTO trials (
       shop_id, status, eligible_at, started_at, ends_at, pricing_generation, created_at, updated_at
     ) SELECT id, 'expired', '2026-01-01', '2026-01-01', '2026-01-14', 'launch',
              '2026-01-01', '2026-01-15' FROM shops WHERE shop_domain = ?`,
  )
    .bind(shop)
    .run();
  const { admin, calls } = stubAdmin({ existing: { enabled: false } });

  expect(await writeValidation(admin, env.DB, shop, null, true)).toEqual({
    ok: false,
    errorCode: "entitlement_required",
  });
  expect(calls).toHaveLength(0);
});
