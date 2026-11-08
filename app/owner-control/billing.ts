import { activeTrialSql } from "../reporting/operational";

// Prima dei 37 giorni vendita e credito del piano sostituito possono ancora arrivare da Partner.
export const FINANCIAL_OBSERVATION_DAYS = 37;
export const BILLING_READBACK_STALE_HOURS = 48;

export const BILLING_STATUS_CATEGORIES = [
  "monthly",
  "annual",
  "one_time",
  "ending",
  "complimentary",
  "trial",
  "expired",
  "refunded",
  "trial_expired",
  "trial_never",
  "other",
] as const;

export type BillingStatusCategory = (typeof BILLING_STATUS_CATEGORIES)[number];

export const BILLING_STATUS_CATEGORY_SQL = `CASE
  WHEN b.is_test = 0 AND b.entitlement_status = 'active'
       AND b.plan_kind IN ('monthly', 'annual', 'one_time') THEN b.plan_kind
  WHEN b.is_test = 0 AND b.entitlement_status = 'ending' THEN 'ending'
  WHEN c.status = 'active' THEN 'complimentary'
  WHEN ${activeTrialSql("t")} THEN 'trial'
  WHEN b.is_test = 0 AND b.entitlement_status = 'expired' THEN 'expired'
  WHEN b.is_test = 0 AND b.entitlement_status = 'refunded' THEN 'refunded'
  WHEN t.status IN ('active', 'expired') THEN 'trial_expired'
  WHEN t.status IS NULL OR t.status = 'not_started' THEN 'trial_never'
  ELSE 'other'
END`;

export function canCloseConversion(
  shop: {
    conversion_credit_status: string | null;
    conversion_credit_observed_at: string | null;
    conversion_requested_at: string | null;
    conversion_reviewed_at?: string | null;
    conversion_subscription_sale_observed_at?: string | null;
  },
  now: Date,
) {
  return (
    shop.conversion_credit_status === "needs_review" &&
    shop.conversion_reviewed_at == null &&
    shop.conversion_subscription_sale_observed_at == null &&
    shop.conversion_credit_observed_at === null &&
    shop.conversion_requested_at !== null &&
    Date.parse(shop.conversion_requested_at) <=
      now.getTime() - FINANCIAL_OBSERVATION_DAYS * 24 * 60 * 60 * 1000
  );
}

export function canConfirmConversion(shop: {
  installation_status: string;
  conversion_id: number | null;
  conversion_is_test: number | null;
  conversion_credit_status: string | null;
  conversion_reviewed_at: string | null;
  conversion_credit_observed_at: string | null;
  conversion_subscription_sale_observed_at: string | null;
}) {
  return (
    shop.installation_status === "active" &&
    shop.conversion_id !== null &&
    shop.conversion_is_test === 0 &&
    shop.conversion_reviewed_at === null &&
    shop.conversion_credit_status === "needs_review" &&
    (shop.conversion_credit_observed_at !== null ||
      shop.conversion_subscription_sale_observed_at !== null)
  );
}

// D-170: l'owner chiude una conversione verificata nel Partner Dashboard, solo dopo la stessa
// finestra degli incidenti finanziari e senza credito osservato.
export async function closeReviewedConversion(db: D1Database, shopId: number, now: Date) {
  const result = await db
    .prepare(
      `UPDATE billing_conversions
          SET credit_status = 'not_applicable', updated_at = ?
        WHERE id = (SELECT id FROM billing_conversions WHERE shop_id = ?
                     ORDER BY requested_at DESC, id DESC LIMIT 1)
          AND credit_status = 'needs_review' AND credit_transaction_gid IS NULL
          AND subscription_sale_transaction_gid IS NULL
          AND NOT EXISTS (SELECT 1 FROM billing_conversion_reviews r
                           WHERE r.conversion_id = billing_conversions.id)
          AND datetime(requested_at) <= datetime(?, '-${FINANCIAL_OBSERVATION_DAYS} days')`,
    )
    .bind(now.toISOString(), shopId, now.toISOString())
    .run();
  return result.meta.changes === 1;
}

export async function confirmReviewedConversion(
  db: D1Database,
  shopId: number,
  conversionId: number,
  now: Date,
) {
  const result = await db
    .prepare(
      `INSERT INTO billing_conversion_reviews (
       conversion_id, reviewed_at, evidence_event_id, evidence_json, subscription_sale_transaction_gid,
       credit_transaction_gid, credit_amount_minor, credit_currency
     )
     SELECT c.id, ?,
       (SELECT e.id FROM app_events e WHERE e.shop_id = c.shop_id
         AND e.event_name = 'billing_conversion_manually_reviewed'
         ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1),
       (SELECT e.metadata_json FROM app_events e WHERE e.shop_id = c.shop_id
         AND e.event_name = 'billing_conversion_manually_reviewed'
         ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1),
       c.subscription_sale_transaction_gid, c.credit_transaction_gid,
       c.credit_amount_minor, c.credit_currency
     FROM billing_conversions c JOIN shops s ON s.id = c.shop_id
     WHERE c.id = ? AND c.shop_id = ? AND s.installation_status = 'active'
       AND c.is_test = 0 AND c.credit_status = 'needs_review'
       AND (c.credit_observed_at IS NOT NULL OR c.subscription_sale_observed_at IS NOT NULL)
       AND c.id = (SELECT id FROM billing_conversions WHERE shop_id = ?
                    ORDER BY requested_at DESC, id DESC LIMIT 1)
     ON CONFLICT(conversion_id) DO NOTHING`,
    )
    .bind(now.toISOString(), conversionId, shopId, shopId)
    .run();
  return result.meta.changes === 1;
}
