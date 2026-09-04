import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import { localDate, startTrial } from "../../app/billing.server";
import {
  acquireValidationLock,
  reconcile,
  releaseValidationLockBestEffort,
} from "../../app/validation.server";
import {
  insertShop,
  FUSO,
  SENZA_DIRITTO,
  shopContext,
  SENZA_ADDEBITI,
  adminStub,
  appState,
} from "../support/lifecycle";

test("la Home legge contesto e billing con una sola chiamata Shopify iniziale", async () => {
  const shop = await insertShop("prefetch-billing.example.myshopify.com");
  const queries: string[] = [];
  const context = shopContext("IT", false);
  const admin = {
    graphql: async (query: string) => {
      queries.push(query);
      return Response.json({
        data: { ...context.data, ...SENZA_ADDEBITI.data },
      });
    },
  };

  const timings: string[] = [];
  const state = await reconcile(admin, env.DB, shop, {
    prefetchBilling: true,
    reportTiming: (name) => timings.push(name),
  });

  expect(queries).toHaveLength(1);
  expect(queries[0]).toContain("validations(first: 100");
  expect(queries[0]).toContain("currentAppInstallation");
  expect(timings).toContain("shopify_snapshot");
  expect(state.errorCode).toBeNull();
});

test("un readback duplicati non disponibile conserva la lettura iniziale", async () => {
  const shop = await insertShop("duplicati-readback-fallito.example.myshopify.com");
  const context = shopContext("IT", true);
  context.data.validations.nodes.push({
    ...context.data.validations.nodes[0],
    id: "gid://shopify/Validation/2",
    enabled: false,
  });
  const admin = adminStub([
    context,
    { data: { validationUpdate: { userErrors: [] } } },
    { errors: [{ message: "readback non disponibile" }] },
    SENZA_ADDEBITI,
  ]);
  const state = await reconcile(admin, env.DB, shop);
  expect(state.validation).toBeUndefined();
  expect(state.errorCode).toBe("duplicate_validations_active");
  expect(state.retryable).toBe(true);
});

test("un omaggio confermato da Shopify concede solo il diritto complementare", async () => {
  const shop = await insertShop("omaggio-confermato.example.myshopify.com");
  const now = "2026-08-24T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO complimentary_entitlements
       (shop_id, status, granted_at, revoked_at, created_at, updated_at)
     SELECT id, 'active', ?, NULL, ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind(now, now, now, shop)
    .run();
  const entitlement = { kind: "one_time", validThrough: null };
  const state = await reconcile(
    adminStub([shopContext("IT", true, entitlement), SENZA_ADDEBITI]),
    env.DB,
    shop,
  );
  expect(state.entitlement).toEqual(entitlement);
  expect(state.complimentary).toMatchObject({ status: "active" });
});

test("un errore billing nello snapshot Home resta fail-open senza perdere il contesto", async () => {
  const shop = await insertShop("snapshot-billing-fallito.example.myshopify.com");
  const context = shopContext("IT", false);
  const admin = {
    graphql: async () =>
      Response.json({
        data: { ...context.data, currentAppInstallation: null },
        errors: [
          {
            message: "billing non disponibile",
            path: ["currentAppInstallation"],
          },
        ],
      }),
  };

  const state = await reconcile(admin, env.DB, shop, { prefetchBilling: true });

  expect(state.shopName).toBe("Store di prova");
  expect(state.entitlement).toEqual(SENZA_DIRITTO);
  expect(state.errorCode).toBe("billing_read_failed");
});

test("la riconciliazione riusa la lettura iniziale dell'account billing D1", async () => {
  const shop = await insertShop("billing-d1-unica.example.myshopify.com");
  let billingAccountReads = 0;
  const db = new Proxy(env.DB, {
    get(target, property) {
      if (property === "prepare") {
        return (sql: string) => {
          if (sql.includes("FROM billing_accounts b JOIN shops s")) billingAccountReads += 1;
          return target.prepare(sql);
        };
      }
      const value = target[property as keyof D1Database];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  await reconcile(adminStub([shopContext("IT", false), SENZA_ADDEBITI]), db, shop);

  expect(billingAccountReads).toBe(1);
});

test("uno store estero resta operativo e conserva la Validation", async () => {
  const shop = await insertShop("francia.example.myshopify.com");
  const admin = adminStub([shopContext("FR", true), SENZA_ADDEBITI]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.validation?.enabled).toBe(true);
  expect(state.errorCode).toBeNull();
  expect(admin.calls).toEqual(["context", "billing"]);
  expect(await appState(shop)).toMatchObject({
    installation_status: "active",
    country_code: "FR",
    validation_enabled: 1,
    config_schema_version: 2,
    last_error_code: null,
  });
});

test("uno store estero ripara una Validation senza metafield", async () => {
  const shop = await insertShop("francia-metafield-assente.example.myshopify.com");
  const senzaMetafield = shopContext("FR", true);
  (senzaMetafield.data.validations.nodes[0] as { metafield: unknown }).metafield = null;
  const riparata = shopContext("FR", true);
  const admin = adminStub([
    senzaMetafield,
    SENZA_ADDEBITI,
    senzaMetafield,
    { data: { validationUpdate: { userErrors: [] } } },
    riparata,
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.validation?.metafield?.jsonValue).toMatchObject({ entitlement: SENZA_DIRITTO });
  expect(state.errorCode).toBeNull();
  expect(admin.calls).toEqual(["context", "billing", "context", "update", "context"]);
});

test("la prima riconciliazione recupera un precedente blocco geografico", async () => {
  const shop = await insertShop("blocco-precedente.example.myshopify.com");
  await env.DB.prepare(
    "UPDATE shops SET installation_status = 'blocked_country' WHERE shop_domain = ?",
  )
    .bind(shop)
    .run();

  const state = await reconcile(
    adminStub([shopContext("FR", false), SENZA_ADDEBITI]),
    env.DB,
    shop,
  );

  expect(state.errorCode).toBeNull();
  expect(await appState(shop)).toMatchObject({
    installation_status: "active",
    country_code: "FR",
    validation_enabled: 0,
  });
});

test("un errore billing resta fail-open e produce soltanto timing tecnici", async () => {
  const shop = await insertShop("billing-fallito.example.myshopify.com");
  const admin = adminStub([
    shopContext("IT", false),
    { errors: [{ message: "servizio non disponibile" }] },
  ]);
  const timings: { name: string; durationMs: number }[] = [];

  const state = await reconcile(admin, env.DB, shop, {
    reportTiming: (name, durationMs) => {
      timings.push({ name, durationMs });
    },
  });

  expect(state.entitlement).toEqual(SENZA_DIRITTO);
  expect(state.errorCode).toBe("billing_read_failed");
  expect(admin.calls).toEqual(["context", "billing"]);
  expect(timings.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "shopify_context",
      "d1_commercial",
      "shopify_billing",
      "d1_validation_state",
    ]),
  );
  expect(timings.every(({ durationMs }) => Number.isFinite(durationMs) && durationMs >= 0)).toBe(
    true,
  );
  expect(JSON.stringify(timings)).not.toContain(shop);
});

test("la persistenza differita è recintata e rende il timing di scheduling", async () => {
  const shop = await insertShop("persistenza-differita.example.myshopify.com");
  const pending: Promise<unknown>[] = [];
  const timings: string[] = [];
  const state = await reconcile(
    adminStub([shopContext("IT", false), SENZA_ADDEBITI]),
    env.DB,
    shop,
    {
      waitUntil: (promise) => pending.push(promise),
      reportTiming: (name) => timings.push(name),
    },
  );
  expect(state.errorCode).toBeNull();
  expect(pending).toHaveLength(1);
  await Promise.all(pending);
  expect(timings).toContain("d1_validation_schedule");
  expect(timings).not.toContain("d1_validation_state");
});

test("un errore della persistenza differita viene registrato senza fallire la riconciliazione", async () => {
  const shop = await insertShop("persistenza-differita-fallita.example.myshopify.com");
  const pending: Promise<unknown>[] = [];
  let batchCalls = 0;
  const db = new Proxy(env.DB, {
    get(target, property) {
      if (property === "batch") {
        return (statements: D1PreparedStatement[]) => {
          batchCalls += 1;
          return batchCalls === 2
            ? Promise.reject(new Error("D1 non disponibile"))
            : target.batch(statements);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as D1Database;

  const state = await reconcile(adminStub([shopContext("IT", false), SENZA_ADDEBITI]), db, shop, {
    waitUntil: (promise) => pending.push(promise),
  });
  await Promise.all(pending);

  expect(state.errorCode).toBeNull();
  expect(
    await env.DB.prepare(
      "SELECT event_name FROM app_events WHERE event_name = 'validation_state_persist_failed'",
    ).first(),
  ).toMatchObject({ event_name: "validation_state_persist_failed" });
});

test("i duplicati misti disattivano solo la risorsa attiva", async () => {
  const shop = await insertShop("duplicati-misti.example.myshopify.com");
  const initial = shopContext("IT", true);
  initial.data.validations.nodes.push({
    ...initial.data.validations.nodes[0],
    id: "gid://shopify/Validation/2",
    enabled: false,
  });
  const readback = shopContext("IT", false);
  readback.data.validations.nodes.push({
    ...readback.data.validations.nodes[0],
    id: "gid://shopify/Validation/2",
    enabled: false,
  });
  const admin = adminStub([
    initial,
    { data: { validationUpdate: { userErrors: [] } } },
    readback,
    SENZA_ADDEBITI,
  ]);
  const state = await reconcile(admin, env.DB, shop);
  expect(state.validation).toBeUndefined();
  expect(state.errorCode).toBe("duplicate_validations");
  expect(admin.updates).toHaveLength(1);
});

test("una Validation rimossa prima della scrittura entitlement resta fail-open", async () => {
  const shop = await insertShop("entitlement-rimosso-prima-write.example.myshopify.com");
  await startTrial(env.DB, shop, { today: localDate(FUSO) });
  const admin = adminStub([shopContext("IT", true), SENZA_ADDEBITI, shopContext("IT", null)]);
  const state = await reconcile(admin, env.DB, shop);
  expect(state.errorCode).toBe("entitlement_write_failed");
  expect(state.retryable).toBe(false);
  expect(admin.updates).toEqual([]);
});

test("un errore nel contesto sotto lease diventa errore entitlement stabile", async () => {
  const shop = await insertShop("entitlement-context-error.example.myshopify.com");
  await startTrial(env.DB, shop, { today: localDate(FUSO) });
  const admin = adminStub([
    shopContext("IT", true),
    SENZA_ADDEBITI,
    new Error("contesto non disponibile"),
  ]);
  const state = await reconcile(admin, env.DB, shop);
  expect(state.errorCode).toBe("entitlement_write_failed");
  expect(state.retryable).toBe(false);
});

test("gli user error Shopify nella scrittura entitlement restano fail-open", async () => {
  const shop = await insertShop("entitlement-user-error.example.myshopify.com");
  await startTrial(env.DB, shop, { today: localDate(FUSO) });
  const admin = adminStub([
    shopContext("IT", true),
    SENZA_ADDEBITI,
    shopContext("IT", true),
    { data: { validationUpdate: { userErrors: [{ message: "metafield non valido" }] } } },
    shopContext("IT", true),
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.errorCode).toBe("entitlement_write_failed");
  expect(state.retryable).toBe(false);
  expect(admin.calls).toEqual(["context", "billing", "context", "update", "context"]);
});

test("un readback entitlement non disponibile resta fail-open", async () => {
  const shop = await insertShop("readback-entitlement.example.myshopify.com");
  await startTrial(env.DB, shop, { today: localDate(FUSO) });
  const admin = adminStub([
    shopContext("IT", true),
    SENZA_ADDEBITI,
    shopContext("IT", true),
    { data: { validationUpdate: { userErrors: [] } } },
    { errors: [{ message: "servizio non disponibile" }] },
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.validationEnabled).toBe(true);
  expect(state.errorCode).toBe("entitlement_readback_failed");
  expect(admin.calls).toEqual(["context", "billing", "context", "update", "context"]);
  expect(await appState(shop)).toMatchObject({
    validation_enabled: 1,
    last_error_code: "entitlement_readback_failed",
  });
});

test("una scrittura entitlement bloccata espone il retry al webhook", async () => {
  const shop = await insertShop("entitlement-occupato.example.myshopify.com");
  await startTrial(env.DB, shop, { today: localDate(FUSO) });
  const lockToken = await acquireValidationLock(env.DB, shop);
  expect(lockToken).not.toBeNull();
  const admin = adminStub([shopContext("IT", true), SENZA_ADDEBITI]);

  try {
    const state = await reconcile(admin, env.DB, shop);

    expect(state.errorCode).toBe("validation_locked");
    expect(admin.calls).toEqual(["context", "billing"]);
  } finally {
    await releaseValidationLockBestEffort(env.DB, shop, lockToken!);
  }
});

test("una lease entitlement persa preserva i duplicati attivi del readback", async () => {
  vi.useFakeTimers();
  const shop = await insertShop("entitlement-lease-persa.example.myshopify.com");
  await startTrial(env.DB, shop, { today: localDate(FUSO) });
  const entitlementAttivo = { kind: "trial", validThrough: "2026-08-20" };
  const readback = shopContext("IT", true, entitlementAttivo);
  readback.data.validations.nodes.push({
    ...readback.data.validations.nodes[0],
    id: "gid://shopify/Validation/2",
    enabled: false,
  });
  const admin = adminStub([
    shopContext("IT", true, entitlementAttivo),
    { errors: [{ message: "servizio billing non disponibile" }] },
    shopContext("IT", true, entitlementAttivo),
    readback,
  ]);
  const graphql = admin.graphql;
  admin.graphql = async (query, options) => {
    const response = await graphql(query, options);
    if (admin.calls.length === 3) {
      await env.DB.prepare(
        `UPDATE validation_operation_locks
         SET owner_token = 'intruso', expires_at = ?
         WHERE shop_domain = ?`,
      )
        .bind(Date.now() + 60_000, shop)
        .run();
      await vi.advanceTimersByTimeAsync(20_000);
    }
    return response;
  };

  try {
    const state = await reconcile(admin, env.DB, shop);

    expect(state.errorCode).toBe("duplicate_validations_active");
    expect(state.retryable).toBe(true);
    expect(admin.calls).toEqual(["context", "billing", "context", "context"]);
    expect(admin.updates).toEqual([]);
  } finally {
    await env.DB.prepare("DELETE FROM validation_operation_locks WHERE shop_domain = ?")
      .bind(shop)
      .run();
    vi.useRealTimers();
  }
});
