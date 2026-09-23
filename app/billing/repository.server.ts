import { recordEvent } from "../events.server";
import { trialLedgerHash } from "../hash.server";
import { planFor } from "../plans.server";
import { billingCycleStart, localDate, pricingGeneration, trialEnd } from "./domain";
import type {
  BillingAccount,
  ComplimentaryEntitlement,
  PricingGeneration,
  ShopifyBilling,
  Trial,
} from "./types";

// La prova nasce solo su richiesta esplicita del merchant.
export async function startTrial(
  db: D1Database,
  shopDomain: string,
  { today }: { today: string },
): Promise<Trial | null> {
  const existing = await readTrial(db, shopDomain);
  if (existing) return existing;

  const now = new Date().toISOString();
  const consumed = await db
    .prepare("SELECT trial_ends_at, pricing_generation FROM trial_ledger WHERE shop_hash = ?")
    .bind(await trialLedgerHash(shopDomain))
    .first<{ trial_ends_at: string | null; pricing_generation: PricingGeneration }>();

  const inserted = await db
    .prepare(
      `INSERT INTO trials (
         shop_id, status, eligible_at, started_at, ends_at, pricing_generation,
         created_at, updated_at
       )
       SELECT id, ?, ?, ?, ?, ?, ?, ? FROM shops WHERE shop_domain = ?
       ON CONFLICT(shop_id) DO NOTHING
       RETURNING shop_id`,
    )
    .bind(
      consumed ? "expired" : "active",
      now,
      consumed ? null : now,
      consumed ? consumed.trial_ends_at : trialEnd(today),
      consumed ? consumed.pricing_generation : pricingGeneration(today),
      now,
      now,
      shopDomain,
    )
    .first<{ shop_id: number }>();

  // La rilettura dipende dall'inserimento appena eseguito, non dal suo valore di ritorno.
  // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
  const trial = await readTrial(db, shopDomain);

  if (inserted && trial?.status === "active") {
    await recordEvent(db, {
      shopDomain,
      name: "trial_started",
      class: "billing",
      metadata: { pricing_generation: trial.pricing_generation },
    });
  }

  return trial;
}

export async function syncTrial(
  db: D1Database,
  shopDomain: string,
  { today }: { today: string },
): Promise<Trial | null> {
  const now = new Date().toISOString();
  const trial = await readTrial(db, shopDomain);

  if (!trial) return null;
  if (trial.status !== "active" || !trial.ends_at || trial.ends_at >= today) return trial;

  const expired = await db
    .prepare(
      `UPDATE trials SET status = 'expired', updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?) AND status = 'active'
       RETURNING shop_id`,
    )
    .bind(now, shopDomain)
    .first<{ shop_id: number }>();

  if (expired) {
    await recordEvent(db, {
      shopDomain,
      name: "trial_expired",
      class: "billing",
      metadata: { pricing_generation: trial.pricing_generation },
    });
  }

  return { ...trial, status: "expired" };
}

// Normalizza lo stato Shopify in D1. Il periodo residuo di un abbonamento cancellato resta
// rappresentato come `ending`, senza trasformare D1 in una fonte alternativa dei diritti.
export async function syncBillingAccount(
  db: D1Database,
  shopDomain: string,
  billing: ShopifyBilling,
  {
    today,
    timeZone,
    pricingGeneration,
    storedAccount,
  }: {
    today: string;
    timeZone: string;
    pricingGeneration: PricingGeneration;
    storedAccount?: BillingAccount | null;
  },
): Promise<BillingAccount> {
  const stored =
    storedAccount === undefined ? await readBillingAccount(db, shopDomain) : storedAccount;
  const ordinaryCancellation = billing.latestSubscription
    ? await readOrdinaryCancellationIntent(db, shopDomain, billing.latestSubscription.id)
    : null;

  const next = nextAccount(stored, billing, {
    today,
    timeZone,
    pricingGeneration,
    ordinaryCancellation,
  });
  const now = new Date().toISOString();
  const oneTimePurchasedAt = billing.oneTime ? billing.oneTime.createdAt : null;

  const accountStatement = db
    .prepare(
      `INSERT INTO billing_accounts (
         shop_id, entitlement_status, plan_kind, pricing_generation, shopify_charge_gid,
         current_period_start, current_period_end, one_time_purchased_at, last_reconciled_at,
         reconciliation_attempted_at, created_at, updated_at, shopify_status, is_test
       )
       SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM shops WHERE shop_domain = ?
       ON CONFLICT(shop_id) DO UPDATE SET
         entitlement_status = excluded.entitlement_status,
         plan_kind = excluded.plan_kind,
         pricing_generation = excluded.pricing_generation,
         shopify_charge_gid = excluded.shopify_charge_gid,
         current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end,
         one_time_purchased_at = COALESCE(excluded.one_time_purchased_at, billing_accounts.one_time_purchased_at),
         last_reconciled_at = excluded.last_reconciled_at,
         reconciliation_attempted_at = excluded.last_reconciled_at,
         reconciliation_error_code = NULL,
         shopify_status = excluded.shopify_status,
         is_test = excluded.is_test,
         sale_observed_at = CASE
           WHEN billing_accounts.shopify_charge_gid = excluded.shopify_charge_gid
             AND COALESCE(billing_accounts.current_period_start, '') = COALESCE(excluded.current_period_start, '')
           THEN billing_accounts.sale_observed_at ELSE NULL END,
         sale_checked_at = CASE
           WHEN billing_accounts.shopify_charge_gid = excluded.shopify_charge_gid
             AND COALESCE(billing_accounts.current_period_start, '') = COALESCE(excluded.current_period_start, '')
           THEN billing_accounts.sale_checked_at ELSE NULL END,
         sale_charge_gid = CASE
           WHEN billing_accounts.shopify_charge_gid = excluded.shopify_charge_gid
             AND COALESCE(billing_accounts.current_period_start, '') = COALESCE(excluded.current_period_start, '')
           THEN billing_accounts.sale_charge_gid ELSE NULL END,
         sale_cycle_start = CASE
           WHEN billing_accounts.shopify_charge_gid = excluded.shopify_charge_gid
             AND COALESCE(billing_accounts.current_period_start, '') = COALESCE(excluded.current_period_start, '')
           THEN billing_accounts.sale_cycle_start ELSE NULL END,
         sale_transaction_gid = CASE
           WHEN billing_accounts.shopify_charge_gid = excluded.shopify_charge_gid
             AND COALESCE(billing_accounts.current_period_start, '') = COALESCE(excluded.current_period_start, '')
           THEN billing_accounts.sale_transaction_gid ELSE NULL END,
         charge_accepted_at = CASE
           WHEN billing_accounts.shopify_charge_gid = excluded.shopify_charge_gid
           THEN billing_accounts.charge_accepted_at ELSE NULL END,
         charge_activated_at = CASE
           WHEN billing_accounts.shopify_charge_gid = excluded.shopify_charge_gid
           THEN billing_accounts.charge_activated_at ELSE NULL END,
         updated_at = excluded.updated_at`,
    )
    .bind(
      next.entitlement_status,
      next.plan_kind,
      next.pricing_generation,
      next.shopify_charge_gid,
      next.current_period_start,
      next.current_period_end,
      oneTimePurchasedAt,
      now,
      now,
      now,
      now,
      next.shopify_status,
      next.is_test,
      shopDomain,
    );

  const changed =
    next.entitlement_status !== stored?.entitlement_status ||
    next.shopify_charge_gid !== stored?.shopify_charge_gid;

  const statements = [accountStatement];
  if (billing.oneTime && billing.latestSubscription?.status === "CANCELLED") {
    statements.push(
      historicalConversionStatement(db, shopDomain, billing.oneTime, billing.latestSubscription),
    );
  }
  if (changed && next.shopify_charge_gid) {
    const charge = next.plan_kind === "one_time" ? billing.oneTime : billing.subscription;
    statements.push(
      db
        .prepare(
          `INSERT INTO billing_events (
             shop_id, shopify_resource_gid, event_type, status, amount_minor, currency,
             period_start, period_end, occurred_at, created_at,
             previous_entitlement_status, previous_plan_kind, is_test
           )
           SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM shops WHERE shop_domain = ?
           ON CONFLICT (shopify_resource_gid, event_type) DO NOTHING`,
        )
        .bind(
          next.shopify_charge_gid,
          next.entitlement_status,
          next.plan_kind,
          charge?.amount === null || charge?.amount === undefined
            ? null
            : Math.round(Number(charge.amount) * 100),
          charge?.currency ?? null,
          next.current_period_start,
          next.current_period_end,
          now,
          now,
          stored?.entitlement_status ?? "none",
          stored?.plan_kind ?? "none",
          next.is_test,
          shopDomain,
        ),
    );
  }
  await db.batch(statements);

  return next;
}

function nextAccount(
  stored: BillingAccount | null,
  billing: ShopifyBilling,
  {
    today,
    timeZone,
    pricingGeneration,
    ordinaryCancellation,
  }: {
    today: string;
    timeZone: string;
    pricingGeneration: PricingGeneration;
    ordinaryCancellation: { period_end: string } | null;
  },
): BillingAccount {
  const generation =
    generationFromActiveCharge(billing) ??
    (stored?.entitlement_status === "active" || stored?.entitlement_status === "ending"
      ? stored.pricing_generation
      : pricingGeneration);

  if (billing.oneTime) {
    return {
      entitlement_status: "active",
      plan_kind: "one_time",
      pricing_generation: generation,
      shopify_charge_gid: billing.oneTime.id,
      shopify_status: "ACTIVE",
      is_test: Number(billing.oneTime.test),
      current_period_start: null,
      current_period_end: null,
    };
  }

  if (billing.subscription) {
    return {
      entitlement_status: "active",
      plan_kind: billing.subscription.interval === "ANNUAL" ? "annual" : "monthly",
      pricing_generation: generation,
      shopify_charge_gid: billing.subscription.id,
      shopify_status: "ACTIVE",
      is_test: Number(billing.subscription.test),
      current_period_start: billingCycleStart(billing.subscription, timeZone),
      current_period_end: billing.subscription.currentPeriodEnd
        ? localDate(timeZone, new Date(billing.subscription.currentPeriodEnd))
        : null,
    };
  }

  if (stored?.plan_kind === "one_time" && stored.entitlement_status === "active") {
    return { ...stored, entitlement_status: "refunded", shopify_status: "UNKNOWN" };
  }

  const latest = billing.latestSubscription;
  const inGracePeriod =
    latest?.status === "CANCELLED" &&
    latest.id === stored?.shopify_charge_gid &&
    ordinaryCancellation?.period_end === latest.currentPeriodEnd &&
    (stored?.entitlement_status === "active" || stored?.entitlement_status === "ending") &&
    stored.plan_kind !== "one_time" &&
    stored.current_period_end !== null &&
    stored.current_period_end >= today;

  if (inGracePeriod) {
    return { ...stored, entitlement_status: "ending", shopify_status: "CANCELLED" };
  }

  if (latest?.status === "FROZEN") {
    return {
      entitlement_status: "expired",
      plan_kind: latest.interval === "ANNUAL" ? "annual" : "monthly",
      pricing_generation: generation,
      shopify_charge_gid: latest.id,
      shopify_status: "FROZEN",
      is_test: Number(latest.test),
      current_period_start: stored?.current_period_start ?? null,
      current_period_end: stored?.current_period_end ?? null,
    };
  }

  return {
    entitlement_status: stored && stored.entitlement_status !== "none" ? "expired" : "none",
    plan_kind: "none",
    pricing_generation: generation,
    shopify_charge_gid: latest?.id ?? stored?.shopify_charge_gid ?? null,
    shopify_status: latest?.status ?? "UNKNOWN",
    is_test: latest ? Number(latest.test) : (stored?.is_test ?? null),
    current_period_start: stored?.current_period_start ?? null,
    current_period_end: stored?.current_period_end ?? null,
  };
}

function generationFromActiveCharge(billing: ShopifyBilling): PricingGeneration | null {
  const subscription = billing.subscription ?? billing.latestSubscription;
  const kind = billing.oneTime
    ? "one_time"
    : subscription?.interval === "ANNUAL"
      ? "annual"
      : subscription
        ? "monthly"
        : null;
  const charge = billing.oneTime ?? subscription;
  if (!kind || !charge?.amount || !charge.currency) return null;

  return (
    (["launch", "balanced"] as const).find((generation) => {
      const plan = planFor(generation, kind);
      return (
        plan.currency === charge.currency &&
        Math.round(plan.amount * 100) === Math.round(Number(charge.amount) * 100)
      );
    }) ?? null
  );
}

export async function recordTrialLedger(db: D1Database, shopDomain: string) {
  await db
    .prepare(
      `INSERT INTO trial_ledger (shop_hash, trial_ends_at, pricing_generation, recorded_at)
       SELECT ?, t.ends_at, t.pricing_generation, ?
       FROM trials t JOIN shops s ON s.id = t.shop_id
       WHERE s.shop_domain = ?
       ON CONFLICT(shop_hash) DO NOTHING`,
    )
    .bind(await trialLedgerHash(shopDomain), new Date().toISOString(), shopDomain)
    .run();
}

export async function markTrialConverted(db: D1Database, shopDomain: string) {
  const now = new Date().toISOString();
  const converted = await db
    .prepare(
      `UPDATE trials SET status = 'converted', updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?) AND status = 'active'
       RETURNING shop_id`,
    )
    .bind(now, shopDomain)
    .first<{ shop_id: number }>();
  if (converted) {
    await recordEvent(db, { shopDomain, name: "trial_converted", class: "billing" });
  }
}

export async function recordBillingConversion(
  db: D1Database,
  shopDomain: string,
  input: {
    subscriptionGid: string;
    oneTimeGid: string;
    creditEstimate: number | null;
    currency: string | null;
    isTest: boolean;
  },
) {
  const now = new Date().toISOString();
  const estimateMinor =
    input.creditEstimate === null ? null : Math.max(0, Math.round(input.creditEstimate * 100));
  await db
    .prepare(
      `INSERT INTO billing_conversions (
         shop_id, subscription_gid, one_time_gid, credit_estimate_minor, currency,
         credit_status, requested_at, source, is_test, created_at, updated_at
       )
       SELECT id, ?, ?, ?, ?, ?, ?, 'app_prorated', ?, ?, ? FROM shops WHERE shop_domain = ?
       ON CONFLICT(one_time_gid) DO UPDATE SET
         credit_estimate_minor = excluded.credit_estimate_minor,
         currency = excluded.currency,
         updated_at = excluded.updated_at`,
    )
    .bind(
      input.subscriptionGid,
      input.oneTimeGid,
      estimateMinor,
      input.currency,
      estimateMinor === null ? "needs_review" : estimateMinor === 0 ? "not_applicable" : "pending",
      now,
      Number(input.isTest),
      now,
      now,
      shopDomain,
    )
    .run();
}

export async function recordOrdinaryCancellationIntent(
  db: D1Database,
  shopDomain: string,
  subscription: NonNullable<ShopifyBilling["subscription"]>,
  today: string,
  timeZone: string,
) {
  if (
    subscription.status !== "ACTIVE" ||
    !subscription.interval ||
    !subscription.currentPeriodEnd ||
    localDate(timeZone, new Date(subscription.currentPeriodEnd)) < today
  ) {
    return false;
  }
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO billing_cancellation_intents (
         subscription_gid, shop_id, period_end, status, requested_at, updated_at
       )
       SELECT ?, id, ?, 'requested', ?, ? FROM shops WHERE shop_domain = ?
       ON CONFLICT(subscription_gid) DO UPDATE SET
         period_end = excluded.period_end,
         status = 'requested',
         requested_at = excluded.requested_at,
         confirmed_at = NULL,
         updated_at = excluded.updated_at`,
    )
    .bind(subscription.id, subscription.currentPeriodEnd, now, now, shopDomain)
    .run();
  return true;
}

export async function markOrdinaryCancellationConfirmed(db: D1Database, subscriptionGid: string) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE billing_cancellation_intents
          SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, ?), updated_at = ?
        WHERE subscription_gid = ?`,
    )
    .bind(now, now, subscriptionGid)
    .run();
}

export async function markBillingConversionCancelled(db: D1Database, oneTimeGid: string) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE billing_conversions SET cancelled_at = COALESCE(cancelled_at, ?), updated_at = ?
       WHERE one_time_gid = ?`,
    )
    .bind(now, now, oneTimeGid)
    .run();
}

export function readBillingAccount(db: D1Database, shopDomain: string) {
  return db
    .prepare(
      `SELECT b.entitlement_status, b.plan_kind, b.pricing_generation, b.shopify_charge_gid,
              b.shopify_status, b.is_test, b.current_period_start, b.current_period_end,
              b.reconciliation_attempted_at, b.reconciliation_error_code
       FROM billing_accounts b JOIN shops s ON s.id = b.shop_id
       WHERE s.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<BillingAccount>();
}

function readOrdinaryCancellationIntent(
  db: D1Database,
  shopDomain: string,
  subscriptionGid: string,
) {
  return db
    .prepare(
      `SELECT i.period_end
         FROM billing_cancellation_intents i
         JOIN shops s ON s.id = i.shop_id
        WHERE s.shop_domain = ? AND i.subscription_gid = ?
          AND i.status IN ('requested', 'confirmed')`,
    )
    .bind(shopDomain, subscriptionGid)
    .first<{ period_end: string }>();
}

function historicalConversionStatement(
  db: D1Database,
  shopDomain: string,
  oneTime: NonNullable<ShopifyBilling["oneTime"]>,
  subscription: NonNullable<ShopifyBilling["latestSubscription"]>,
) {
  return db
    .prepare(
      `INSERT INTO billing_conversions (
         shop_id, subscription_gid, one_time_gid, credit_estimate_minor, currency,
         credit_status, requested_at, source, is_test, created_at, updated_at
       )
       SELECT id, ?, ?, NULL, COALESCE(?, ?), 'needs_review', ?,
              'historical_reconciliation', ?, ?, ?
         FROM shops WHERE shop_domain = ?
       ON CONFLICT(one_time_gid) DO NOTHING`,
    )
    .bind(
      subscription.id,
      oneTime.id,
      subscription.currency,
      oneTime.currency,
      oneTime.createdAt,
      Number(oneTime.test || subscription.test),
      new Date().toISOString(),
      new Date().toISOString(),
      shopDomain,
    );
}

export function readLatestBillingConversion(db: D1Database, shopDomain: string) {
  return db
    .prepare(
      `SELECT c.credit_estimate_minor, c.currency, c.credit_status,
              c.credit_amount_minor, c.credit_currency, c.credit_observed_at
         FROM billing_conversions c JOIN shops s ON s.id = c.shop_id
        WHERE s.shop_domain = ?
        ORDER BY c.requested_at DESC, c.id DESC LIMIT 1`,
    )
    .bind(shopDomain)
    .first<{
      credit_estimate_minor: number | null;
      currency: string | null;
      credit_status: "pending" | "confirmed" | "not_applicable" | "needs_review";
      credit_amount_minor: number | null;
      credit_currency: string | null;
      credit_observed_at: string | null;
    }>();
}

export function readComplimentaryEntitlement(db: D1Database, shopDomain: string) {
  return db
    .prepare(
      `SELECT c.status, c.granted_at, c.revoked_at
       FROM complimentary_entitlements c JOIN shops s ON s.id = c.shop_id
       WHERE s.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<ComplimentaryEntitlement>();
}

function readTrial(db: D1Database, shopDomain: string) {
  return db
    .prepare(
      `SELECT t.status, t.started_at, t.ends_at, t.pricing_generation
       FROM trials t JOIN shops s ON s.id = t.shop_id
       WHERE s.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<Trial>();
}
