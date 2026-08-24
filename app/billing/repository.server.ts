import { recordEvent } from "../events.server";
import { trialLedgerHash } from "../hash.server";
import { planFor } from "../plans.server";
import { localDate, pricingGeneration, trialEnd } from "./domain";
import type {
  BillingAccount,
  ComplimentaryEntitlement,
  PricingGeneration,
  ShopifyBilling,
  Trial,
} from "./types";

// La prova nasce solo su richiesta esplicita del merchant. Uno store non idoneo non la consuma.
export async function startTrial(
  db: D1Database,
  shopDomain: string,
  { eligible, today }: { eligible: boolean; today: string },
): Promise<Trial | null> {
  if (!eligible) return null;
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

  const next = nextAccount(stored, billing, { today, timeZone, pricingGeneration });
  const now = new Date().toISOString();
  const oneTimePurchasedAt = billing.oneTime ? billing.oneTime.createdAt : null;

  const accountStatement = db
    .prepare(
      `INSERT INTO billing_accounts (
         shop_id, entitlement_status, plan_kind, pricing_generation, shopify_charge_gid,
         current_period_start, current_period_end, one_time_purchased_at, last_reconciled_at,
         created_at, updated_at
       )
       SELECT id, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ? FROM shops WHERE shop_domain = ?
       ON CONFLICT(shop_id) DO UPDATE SET
         entitlement_status = excluded.entitlement_status,
         plan_kind = excluded.plan_kind,
         pricing_generation = excluded.pricing_generation,
         shopify_charge_gid = excluded.shopify_charge_gid,
         current_period_end = excluded.current_period_end,
         one_time_purchased_at = COALESCE(excluded.one_time_purchased_at, billing_accounts.one_time_purchased_at),
         last_reconciled_at = excluded.last_reconciled_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      next.entitlement_status,
      next.plan_kind,
      next.pricing_generation,
      next.shopify_charge_gid,
      next.current_period_end,
      oneTimePurchasedAt,
      now,
      now,
      now,
      shopDomain,
    );

  const changed =
    next.entitlement_status !== stored?.entitlement_status ||
    next.shopify_charge_gid !== stored?.shopify_charge_gid;

  const statements = [accountStatement];
  if (changed && next.shopify_charge_gid) {
    const charge = next.plan_kind === "one_time" ? billing.oneTime : billing.subscription;
    statements.push(
      db
        .prepare(
          `INSERT INTO billing_events (
             shop_id, shopify_resource_gid, event_type, status, amount_minor, currency,
             period_start, period_end, occurred_at, created_at,
             previous_entitlement_status, previous_plan_kind
           )
           SELECT id, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ? FROM shops WHERE shop_domain = ?
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
          next.current_period_end,
          now,
          now,
          stored?.entitlement_status ?? "none",
          stored?.plan_kind ?? "none",
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
  }: { today: string; timeZone: string; pricingGeneration: PricingGeneration },
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
      current_period_end: null,
    };
  }

  if (billing.subscription) {
    return {
      entitlement_status: "active",
      plan_kind: billing.subscription.interval === "ANNUAL" ? "annual" : "monthly",
      pricing_generation: generation,
      shopify_charge_gid: billing.subscription.id,
      current_period_end: billing.subscription.currentPeriodEnd
        ? localDate(timeZone, new Date(billing.subscription.currentPeriodEnd))
        : null,
    };
  }

  if (stored?.plan_kind === "one_time" && stored.entitlement_status === "active") {
    return { ...stored, entitlement_status: "refunded" };
  }

  const inGracePeriod =
    (stored?.entitlement_status === "active" || stored?.entitlement_status === "ending") &&
    stored.plan_kind !== "one_time" &&
    stored.current_period_end !== null &&
    stored.current_period_end >= today;

  if (inGracePeriod) {
    return { ...stored, entitlement_status: "ending" };
  }

  return {
    entitlement_status: stored && stored.entitlement_status !== "none" ? "expired" : "none",
    plan_kind: "none",
    pricing_generation: generation,
    shopify_charge_gid: stored?.shopify_charge_gid ?? null,
    current_period_end: stored?.current_period_end ?? null,
  };
}

function generationFromActiveCharge(billing: ShopifyBilling): PricingGeneration | null {
  const kind = billing.oneTime
    ? "one_time"
    : billing.subscription?.interval === "ANNUAL"
      ? "annual"
      : billing.subscription
        ? "monthly"
        : null;
  const charge = billing.oneTime ?? billing.subscription;
  if (!kind || !charge?.amount || !charge.currency) return null;

  return (
    (["launch", "balanced"] as const).find((generation) => {
      const plan = planFor(generation, kind);
      return (
        plan?.currency === charge.currency &&
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

export function readBillingAccount(db: D1Database, shopDomain: string) {
  return db
    .prepare(
      `SELECT b.entitlement_status, b.plan_kind, b.pricing_generation, b.shopify_charge_gid,
              b.current_period_end
       FROM billing_accounts b JOIN shops s ON s.id = b.shop_id
       WHERE s.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<BillingAccount>();
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
