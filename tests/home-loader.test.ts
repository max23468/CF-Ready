import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { addDays, localDate } from "../app/billing/domain";
import { recordBillingConversion } from "../app/billing/repository.server";
import { DEFAULT_CONFIG } from "../app/config";
import { recordLatestConfiguration } from "../app/configuration-history.server";
import { createAppContext } from "../app/context.server";
import { readHomeOrderUsage } from "../app/features/home/home.server";
import { sessionReadsOrders } from "../app/order-usage.server";
import * as homeRoute from "../app/routes/app._index";
import { saveOnboarding } from "../app/validation/repository.server";
import { d1WithFault } from "./support/d1-fault";
import { eventsOf, merchant } from "./support/merchant";
import type { ShopifyAdminFake } from "./support/shopify-admin";

const auth = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("../app/shopify.server", () => ({ authenticate: { admin: auth.admin } }));

const CONFIGURED = {
  ...DEFAULT_CONFIG,
  rules: { ...DEFAULT_CONFIG.rules, taxCode: "required_validated" as const },
};
const ROME_TODAY = () => localDate("Europe/Rome");

let shop: string;
let shopify: ShopifyAdminFake;
let pending: Promise<unknown>[];
let releases: (() => void)[];

beforeEach(async () => {
  ({ shop, shopify } = await merchant("home-loader"));
  pending = [];
  releases = [];
  auth.admin.mockReset();
  auth.admin.mockResolvedValue({ admin: shopify.admin, session: { shop } });
});

afterEach(async () => {
  releases.forEach((release) => release());
  // Il primo giro attende la conferma, il secondo la persistenza che la conferma ha affidato a waitUntil.
  await Promise.allSettled(pending);
  await Promise.allSettled(pending);
});

function loadHome(db: D1Database = env.DB) {
  return homeRoute.loader({
    request: new Request("https://example.test/app?locale=it"),
    context: createAppContext(db, undefined, (promise) => pending.push(promise)),
    params: {},
  } as never);
}

// Shopify riceve la lettura della Home e non risponde finché il test non la rilascia.
function holdShopify() {
  let release!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  shopify.beforeNext("CfReadyHomeSnapshot", () => held);
  releases.push(release);
  return release;
}

async function savedHome(partnerDevelopment: number | null = null) {
  await env.DB.prepare(
    `UPDATE shops SET display_name = 'Negozio salvato', country_code = 'IT',
       iana_timezone = 'Europe/Rome', partner_development = ? WHERE shop_domain = ?`,
  )
    .bind(partnerDevelopment, shop)
    .run();
  await env.DB.prepare(
    `UPDATE app_state SET validation_enabled = 1, validation_gid = 'gid://shopify/Validation/1'
     WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
  )
    .bind(shop)
    .run();
  await saveOnboarding(env.DB, shop, { status: "in_progress", step: 2 });
  await recordLatestConfiguration(env.DB, shop, {
    rules: CONFIGURED.rules,
    messages: CONFIGURED.messages,
  });
}

async function savedSubscription() {
  const now = "2026-07-30T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO billing_accounts (
       shop_id, entitlement_status, plan_kind, pricing_generation,
       current_period_end, created_at, updated_at
     )
     SELECT id, 'active', 'monthly', 'launch', '2999-01-01', ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind(now, now, shop)
    .run();
}

function activeSubscription() {
  shopify.state.subscriptions.push({
    id: `gid://shopify/AppSubscription/${crypto.randomUUID()}`,
    currentPeriodEnd: `${addDays(ROME_TODAY(), 20)}T21:59:59Z`,
  });
}

async function savedConversion(isTest: boolean, reviewedAt: string | null = null) {
  const oneTimeGid = `gid://shopify/AppPurchaseOneTime/${crypto.randomUUID()}`;
  await recordBillingConversion(env.DB, shop, {
    subscriptionGid: "gid://shopify/AppSubscription/convertita",
    oneTimeGid,
    creditEstimate: null,
    currency: null,
    isTest,
  });
  if (!reviewedAt) return;
  await env.DB.prepare(
    `INSERT INTO billing_conversion_reviews (conversion_id, reviewed_at)
     SELECT id, ? FROM billing_conversions WHERE one_time_gid = ?`,
  )
    .bind(reviewedAt, oneTimeGid)
    .run();
}

test("la Home risponde con lo stato D1 senza attendere la riconciliazione Shopify", async () => {
  await savedHome();
  await savedSubscription();
  const release = holdShopify();

  // Prima di D-167 il loader restava fermo qui finché Shopify non rispondeva.
  const result = await loadHome();

  expect(result.data.home).toMatchObject({
    validationEnabled: true,
    rules: CONFIGURED.rules,
    entitlement: { kind: "subscription", validThrough: "2999-01-01" },
    onboarding: "in_progress",
    creditEstimate: null,
    showMerchantCheckIn: false,
    reviewDue: false,
  });
  expect(result.data.confirmed).toBeInstanceOf(Promise);
  expect(pending).toContainEqual(expect.any(Promise));

  const serverTiming = new Headers(result.init?.headers).get("Server-Timing");
  const parentHeaders = new Headers({ "X-Shopify-Test": "preserved" });
  const documentHeaders = new Headers(
    homeRoute.headers({
      loaderHeaders: new Headers(result.init?.headers),
      parentHeaders,
    } as never),
  );
  expect(serverTiming).toContain("d1_home;dur=");
  expect(serverTiming).toContain("d1_commercial;dur=");
  expect(serverTiming).toContain("total;dur=");
  expect(serverTiming).not.toContain("reconcile_total");
  expect(serverTiming).not.toContain(shop);
  expect(documentHeaders.get("Server-Timing")).toBe(serverTiming);
  expect(documentHeaders.get("X-Shopify-Test")).toBe("preserved");

  shopify.failNext("CfReadyHomeSnapshot", new Error("Shopify non disponibile"));
  release();
  await expect(result.data.confirmed).rejects.toThrow();
  // Validation e billing arrivano dalla stessa lettura combinata.
  expect(shopify.callsTo("CfReadyHomeSnapshot")).toHaveLength(1);
  expect(shopify.callsTo("CfReadyContext", "CfReadyBilling")).toEqual([]);
});

test("la conferma Shopify sostituisce lo stato salvato", async () => {
  await savedHome();
  shopify.addValidation(DEFAULT_CONFIG, false);
  activeSubscription();
  shopify.failNext("CfReadyValidationUpdate", new Error("Shopify non disponibile"));

  const result = await loadHome();

  expect(result.data.home).toMatchObject({
    validationEnabled: true,
    entitlement: { kind: "none", validThrough: null },
  });
  await expect(result.data.confirmed).resolves.toMatchObject({
    validationEnabled: false,
    rules: DEFAULT_CONFIG.rules,
    entitlement: { kind: "subscription", validThrough: addDays(ROME_TODAY(), 20) },
    // 2,99 € per 21 dei 31 giorni arrotondati fra inizio ciclo e fine periodo Shopify.
    creditEstimate: 2.03,
    errorCode: "entitlement_write_failed",
    onboarding: "in_progress",
  });
});

test("la persistenza in background lascia valida la conferma e registra il guasto", async () => {
  await savedHome();
  shopify.addValidation(CONFIGURED, true);
  const { db } = d1WithFault(env.DB, {
    sql: "validation_state_revision = app_state.validation_state_revision + 1",
    batchError: new Error("D1 non disponibile"),
  });

  const result = await loadHome(db);

  await expect(result.data.confirmed).resolves.toMatchObject({ rules: CONFIGURED.rules });
  await Promise.allSettled(pending);
  expect(await eventsOf(shop, "validation_state_persist_failed")).toEqual([
    { error_code: "validation_state_persist_failed" },
  ]);
});

test("con il billing Shopify non letto la conferma tiene il piano salvato (D-199)", async () => {
  await savedHome(0);
  await savedSubscription();
  const validation = shopify.addValidation(CONFIGURED, true);
  shopify.state.shop.plan.partnerDevelopment = false;
  // La riconciliazione non concede diritti senza readback: la Home non li toglie a vista.
  shopify.failNext("CfReadyHomeSnapshot", {
    data: {
      shop: shopify.state.shop,
      validations: {
        nodes: [
          {
            id: validation.id,
            title: "CF Ready",
            enabled: true,
            blockOnFailure: false,
            shopifyFunction: { handle: "cf-ready-validation" },
            metafield: { jsonValue: CONFIGURED },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      currentAppInstallation: null,
    },
  });

  const result = await loadHome();

  await expect(result.data.confirmed).resolves.toMatchObject({
    entitlement: { kind: "subscription", validThrough: "2999-01-01" },
    errorCode: "billing_read_failed",
    showMerchantCheckIn: false,
  });
});

test.each([
  { partnerDevelopment: true, showMerchantCheckIn: false },
  { partnerDevelopment: false, showMerchantCheckIn: true },
])(
  "il check-in si decide già sullo stato salvato e rispetta lo store Development: $partnerDevelopment",
  async ({ partnerDevelopment, showMerchantCheckIn }) => {
    await savedHome(Number(partnerDevelopment));
    await savedSubscription();
    shopify.state.shop.plan.partnerDevelopment = partnerDevelopment;
    shopify.addValidation(CONFIGURED, true);
    activeSubscription();
    const release = holdShopify();

    const result = await loadHome();
    // D-199: la Home mostra il check-in solo se c'è al primo paint.
    expect(result.data.home.showMerchantCheckIn).toBe(showMerchantCheckIn);

    release();
    await expect(result.data.confirmed).resolves.toMatchObject({ showMerchantCheckIn });
  },
);

test("senza configurazione salvata la Home parte dai valori predefiniti", async () => {
  holdShopify();

  const result = await loadHome();

  expect(result.data.home).toMatchObject({
    countryCode: "IT",
    rules: DEFAULT_CONFIG.rules,
    entitlement: { kind: "none", validThrough: null },
  });
});

test.each([
  { name: "di test", isTest: true, reviewedAt: null },
  { name: "verificato dall'owner", isTest: false, reviewedAt: "2026-10-30T07:00:00Z" },
])("un credito $name non resta in verifica per sempre", async ({ isTest, reviewedAt }) => {
  await savedConversion(isTest, reviewedAt);
  holdShopify();

  const result = await loadHome();

  expect(result.data.home.conversionCredit).toBeNull();
});

test("un credito reale ancora da verificare resta visibile", async () => {
  await savedConversion(false);
  holdShopify();

  const result = await loadHome();

  expect(result.data.home.conversionCredit).toEqual({ status: "needs_review" });
});

// D-231, BFS 4.2.3: la Home conta gli ordini recenti con Codice Fiscale e PEC leggendo le sole
// chiavi dei localized fields.
test("la Home conta in streaming gli ordini con Codice Fiscale e PEC", async () => {
  shopify.state.orders = [["TAX_CREDENTIAL_IT", "TAX_EMAIL_IT"], ["TAX_CREDENTIAL_IT"], []];

  const result = await loadHome();

  await expect(result.data.orderUsage).resolves.toEqual({
    status: "ok",
    taxCode: 2,
    pec: 1,
    truncated: false,
  });
  const [call] = shopify.callsTo("FiscalOrderUsage");
  expect(call.variables).toMatchObject({ first: 100 });
  expect(result.data.orderScopeHint).toBe(false);
  expect(String(call.variables.query)).toMatch(/^created_at:>='\d{4}-\d{2}-\d{2}'$/);
});

test("il conteggio della Home arriva anche se la conferma Shopify fallisce", async () => {
  shopify.state.orders = [["TAX_EMAIL_IT"]];
  const release = holdShopify();

  const result = await loadHome();

  shopify.failNext("CfReadyHomeSnapshot", new Error("Shopify non disponibile"));
  release();
  await expect(result.data.confirmed).rejects.toThrow();
  await expect(result.data.orderUsage).resolves.toMatchObject({ status: "ok", pec: 1 });
});

test("oltre due pagine il conteggio della Home è un minimo", async () => {
  shopify.state.orders = Array.from({ length: 201 }, () => ["TAX_CREDENTIAL_IT"]);

  await expect(readHomeOrderUsage(shopify.admin, new Date())).resolves.toEqual({
    status: "ok",
    taxCode: 200,
    pec: 0,
    truncated: true,
  });
  expect(shopify.callsTo("FiscalOrderUsage")).toHaveLength(2);
});

// Shopify rifiuta le query oltre 1.000 punti richiesti: 2 + 100 × (1 + 2 + 2) resta a 502.
test("la query della Home chiede pagine da 100 ordini con due localized fields", async () => {
  await readHomeOrderUsage(shopify.admin, new Date());
  const [call] = shopify.callsTo("FiscalOrderUsage");
  expect(call.variables).toMatchObject({ first: 100 });
});

test.each([
  ["write_validations,read_orders", true],
  ["write_validations, write_orders", true],
  ["write_validations", false],
  [undefined, false],
])("lo scope %s indica la lettura degli ordini: %s", (scope, expected) => {
  expect(sessionReadsOrders(scope)).toBe(expected);
});

test("senza permesso sugli ordini la Home lo segnala senza errori", async () => {
  shopify.failNext("FiscalOrderUsage", { errors: [{ extensions: { code: "ACCESS_DENIED" } }] });

  await expect(readHomeOrderUsage(shopify.admin, new Date())).resolves.toEqual({
    status: "no_scope",
  });
});
