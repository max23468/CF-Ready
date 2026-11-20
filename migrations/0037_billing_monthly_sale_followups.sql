CREATE TABLE billing_monthly_sale_followups (
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  charge_gid TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  reference_at TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  checked_at TEXT,
  sale_transaction_gid TEXT UNIQUE,
  PRIMARY KEY (shop_id, charge_gid, period_start)
) STRICT;

CREATE INDEX billing_monthly_sale_followups_pending_idx
  ON billing_monthly_sale_followups(period_start)
  WHERE sale_transaction_gid IS NULL;

-- Conserva l'alert aperto se il suo riferimento appartiene ancora al ciclo corrente.
UPDATE owner_operational_incidents AS i
   SET incident_key = i.incident_key || ':' || b.shopify_charge_gid || ':' || b.current_period_start
  FROM billing_accounts b
 WHERE i.incident_key = 'billing_sale:' || b.shop_id
   AND i.status = 'active' AND b.plan_kind = 'monthly' AND b.is_test = 0
   AND b.shopify_charge_gid IS NOT NULL
   AND date(i.fingerprint) >= date(b.current_period_start);
