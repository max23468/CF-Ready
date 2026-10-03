import { UNRESOLVED_WEBHOOK_FILTER } from "./queries.server";
import { CHECKOUT_LABEL_SYNC_ERRORS } from "../reporting/operational";
import {
  WEBHOOK_FAILED_MINUTES,
  WEBHOOK_PROCESSING_MINUTES,
  FINANCIAL_OBSERVATION_DAYS,
  BILLING_READBACK_STALE_HOURS,
} from "./model";

// Il diritto commerciale non è arrivato nel metafield: la Function può restare fail-open anche
// per un merchant pagante.
const ENTITLEMENT_SYNC_ERRORS = [
  "entitlement_readback_failed",
  "entitlement_write_failed",
] as const;

export type IncidentRow = {
  incident_key: string;
  incident_kind: "webhooks" | "partner" | "checkout_labels" | "billing";
  shop_id: number | null;
  status: "observing" | "active" | "resolved";
  fingerprint: string | null;
  consecutive_observations: number;
  first_observed_at: string;
  opened_at: string | null;
};

export type LabelErrorRow = {
  shop_id: number;
  shop_domain: string;
  display_name: string | null;
  error_code: string;
  last_read_at: string | null;
};

export type BillingIssueRow = {
  incident_key: string;
  shop_id: number;
  shop_domain: string;
  display_name: string | null;
  issue:
    | "sale"
    | "credit"
    | "credit_review"
    | "conversion_sale"
    | "reconciliation_stale"
    | "entitlement_sync";
  reference_at: string;
  attempted_at: string | null;
  error_code: string | null;
};

export async function readIncidentObservations(db: D1Database, now: Date) {
  const nowIso = now.toISOString();
  const failedCutoff = new Date(now.getTime() - WEBHOOK_FAILED_MINUTES * 60 * 1000).toISOString();
  const processingCutoff = new Date(
    now.getTime() - WEBHOOK_PROCESSING_MINUTES * 60 * 1000,
  ).toISOString();
  const [webhooks, partner, labels, billingIssues, entitlementIssues, incidents] = await db.batch([
    db
      .prepare(
        `SELECT
         COUNT(*) FILTER (WHERE ${UNRESOLVED_WEBHOOK_FILTER}) AS failed,
         COUNT(*) FILTER (WHERE w.status = 'processing') AS processing
       FROM webhook_events w
       WHERE (w.status = 'failed' AND w.received_at <= ?)
          OR (w.status = 'processing' AND w.received_at <= ?)`,
      )
      .bind(failedCutoff, processingCutoff),
    db.prepare(
      `SELECT state_value AS synced_at
           FROM owner_notification_state
          WHERE state_key = 'partner_events_polled_at'`,
    ),
    db
      .prepare(
        `SELECT s.id AS shop_id, s.shop_domain, s.display_name,
              a.checkout_labels_last_error_code AS error_code,
              (SELECT MAX(last_observed_at) FROM checkout_label_slots
                WHERE shop_id = s.id) AS last_read_at
         FROM app_state a
         JOIN shops s ON s.id = a.shop_id
        WHERE s.installation_status = 'active'
          AND a.checkout_labels_mode != 'off'
          AND a.checkout_labels_last_error_code IN (${CHECKOUT_LABEL_SYNC_ERRORS.map(() => "?").join(", ")})`,
      )
      .bind(...CHECKOUT_LABEL_SYNC_ERRORS),
    db
      .prepare(
        `SELECT 'billing_sale:' || s.id AS incident_key, s.id AS shop_id,
              s.shop_domain, s.display_name, 'sale' AS issue,
              CASE
                WHEN b.plan_kind = 'one_time'
                  THEN COALESCE(b.charge_accepted_at, b.charge_activated_at,
                                b.one_time_purchased_at, b.created_at)
                WHEN b.current_period_start IS NOT NULL
                 AND date(b.current_period_start) > date(COALESCE(b.charge_accepted_at,
                                                                  b.charge_activated_at,
                                                                  b.current_period_start))
                  THEN b.current_period_start
                ELSE COALESCE(b.charge_accepted_at, b.charge_activated_at,
                              b.current_period_start, b.created_at)
              END AS reference_at, NULL AS attempted_at, NULL AS error_code
         FROM billing_accounts b
         JOIN shops s ON s.id = b.shop_id
        WHERE s.installation_status = 'active'
          AND b.plan_kind IN ('monthly', 'annual', 'one_time')
          AND b.entitlement_status IN ('active', 'ending')
          AND b.is_test = 0
          AND b.sale_checked_at IS NOT NULL
          AND (b.plan_kind = 'one_time' OR b.current_period_start IS NOT NULL)
          AND (b.plan_kind = 'one_time' OR date(b.current_period_start) <= date(?))
          AND (b.sale_observed_at IS NULL
               OR b.sale_charge_gid IS NOT b.shopify_charge_gid
               OR (b.plan_kind IN ('monthly', 'annual')
                   AND b.sale_cycle_start IS NOT b.current_period_start))
          AND datetime(CASE
                WHEN b.plan_kind = 'one_time'
                  THEN COALESCE(b.charge_accepted_at, b.charge_activated_at,
                                b.one_time_purchased_at, b.created_at)
                WHEN b.current_period_start IS NOT NULL
                 AND date(b.current_period_start) > date(COALESCE(b.charge_accepted_at,
                                                                  b.charge_activated_at,
                                                                  b.current_period_start))
                  THEN b.current_period_start
                ELSE COALESCE(b.charge_accepted_at, b.charge_activated_at,
                              b.current_period_start, b.created_at)
              END) <= datetime(?, '-${FINANCIAL_OBSERVATION_DAYS} days')
       UNION ALL
       SELECT 'billing_credit:' || c.id AS incident_key, s.id AS shop_id,
              s.shop_domain, s.display_name, 'credit' AS issue,
              c.cancelled_at AS reference_at, NULL AS attempted_at, NULL AS error_code
         FROM billing_conversions c
         JOIN shops s ON s.id = c.shop_id
        WHERE c.credit_status = 'pending' AND c.is_test = 0
          AND c.cancelled_at IS NOT NULL
          AND c.last_checked_at IS NOT NULL
          AND datetime(c.cancelled_at) <= datetime(?, '-${FINANCIAL_OBSERVATION_DAYS} days')
       UNION ALL
       SELECT 'billing_credit_review:' || c.id AS incident_key, s.id AS shop_id,
              s.shop_domain, s.display_name, 'credit_review' AS issue,
              c.credit_observed_at AS reference_at, NULL AS attempted_at, NULL AS error_code
         FROM billing_conversions c
         JOIN shops s ON s.id = c.shop_id
        WHERE c.credit_status = 'needs_review' AND c.is_test = 0
          AND c.credit_transaction_gid IS NOT NULL
       UNION ALL
       SELECT 'billing_source_sale:' || c.id AS incident_key, s.id AS shop_id,
              s.shop_domain, s.display_name, 'conversion_sale' AS issue,
              COALESCE(c.subscription_accepted_at, c.subscription_activated_at,
                       c.requested_at) AS reference_at, NULL AS attempted_at, NULL AS error_code
         FROM billing_conversions c
         JOIN shops s ON s.id = c.shop_id
        WHERE c.credit_status IN ('pending', 'confirmed', 'needs_review')
          AND c.is_test = 0
          AND c.subscription_sale_transaction_gid IS NULL
          AND c.last_checked_at IS NOT NULL
          AND datetime(COALESCE(c.subscription_accepted_at, c.subscription_activated_at,
                                c.requested_at))
              <= datetime(?, '-${FINANCIAL_OBSERVATION_DAYS} days')
       UNION ALL
       SELECT 'billing_reconciliation:' || b.shop_id AS incident_key, s.id AS shop_id,
              s.shop_domain, s.display_name, 'reconciliation_stale' AS issue,
              COALESCE(b.last_reconciled_at, b.created_at) AS reference_at,
              b.reconciliation_attempted_at AS attempted_at,
              b.reconciliation_error_code AS error_code
         FROM billing_accounts b
         JOIN shops s ON s.id = b.shop_id
        WHERE s.installation_status = 'active'
          AND datetime(COALESCE(b.last_reconciled_at, b.created_at))
              <= datetime(?, '-${BILLING_READBACK_STALE_HOURS} hours')`,
      )
      .bind(nowIso, nowIso, nowIso, nowIso, nowIso),
    // D1 accetta al massimo cinque termini in una SELECT composta.
    db
      .prepare(
        `SELECT 'billing_entitlement:' || b.shop_id AS incident_key, s.id AS shop_id,
              s.shop_domain, s.display_name, 'entitlement_sync' AS issue,
              b.reconciliation_attempted_at AS reference_at,
              NULL AS attempted_at, NULL AS error_code
         FROM billing_accounts b
         JOIN shops s ON s.id = b.shop_id
        WHERE s.installation_status = 'active'
          AND b.reconciliation_attempted_at IS NOT NULL
          AND b.reconciliation_error_code IN (${ENTITLEMENT_SYNC_ERRORS.map(() => "?").join(", ")})`,
      )
      .bind(...ENTITLEMENT_SYNC_ERRORS),
    db.prepare(`SELECT incident_key, incident_kind, shop_id, status, fingerprint,
                       consecutive_observations, first_observed_at, opened_at
                  FROM owner_operational_incidents`),
  ]);
  if (
    ![webhooks, partner, labels, billingIssues, entitlementIssues, incidents].every(
      ({ success }) => success,
    )
  ) {
    throw new Error("owner_incident_read_failed");
  }

  const webhookCounts = webhooks.results[0] as
    | { failed: number | null; processing: number | null }
    | undefined;
  if (!webhookCounts) throw new Error("owner_incident_read_failed");
  return {
    webhookCounts,
    partner: partner.results[0] as { synced_at: string } | undefined,
    labels: labels.results as LabelErrorRow[],
    billing: [...billingIssues.results, ...entitlementIssues.results] as BillingIssueRow[],
    existing: new Map(
      (incidents.results as IncidentRow[]).map((incident) => [incident.incident_key, incident]),
    ),
  };
}
