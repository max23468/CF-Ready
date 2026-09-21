ALTER TABLE billing_accounts ADD COLUMN shopify_status TEXT NOT NULL DEFAULT 'UNKNOWN'
  CHECK (shopify_status IN (
    'ACTIVE', 'CANCELLED', 'DECLINED', 'EXPIRED', 'FROZEN', 'PENDING', 'UNKNOWN'
  ));
ALTER TABLE billing_accounts ADD COLUMN is_test INTEGER
  CHECK (is_test IS NULL OR is_test IN (0, 1));
ALTER TABLE billing_accounts ADD COLUMN sale_observed_at TEXT;
ALTER TABLE billing_accounts ADD COLUMN sale_checked_at TEXT;
ALTER TABLE billing_accounts ADD COLUMN sale_charge_gid TEXT;
ALTER TABLE billing_accounts ADD COLUMN sale_cycle_start TEXT;
ALTER TABLE billing_accounts ADD COLUMN sale_transaction_gid TEXT;
ALTER TABLE billing_accounts ADD COLUMN charge_accepted_at TEXT;
ALTER TABLE billing_accounts ADD COLUMN charge_activated_at TEXT;
ALTER TABLE billing_accounts ADD COLUMN reconciliation_attempted_at TEXT;
ALTER TABLE billing_accounts ADD COLUMN reconciliation_error_code TEXT;

ALTER TABLE billing_events ADD COLUMN is_test INTEGER
  CHECK (is_test IS NULL OR is_test IN (0, 1));

CREATE TABLE billing_conversions (
  id INTEGER PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  subscription_gid TEXT NOT NULL,
  one_time_gid TEXT NOT NULL UNIQUE,
  credit_estimate_minor INTEGER CHECK (
    credit_estimate_minor IS NULL OR credit_estimate_minor >= 0
  ),
  currency TEXT,
  credit_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (credit_status IN ('pending', 'confirmed', 'not_applicable', 'needs_review')),
  requested_at TEXT NOT NULL,
  cancelled_at TEXT,
  credit_observed_at TEXT,
  credit_transaction_gid TEXT UNIQUE,
  credit_transaction_type TEXT CHECK (
    credit_transaction_type IS NULL OR credit_transaction_type IN ('AppSaleAdjustment', 'AppSaleCredit')
  ),
  credit_amount_minor INTEGER,
  credit_currency TEXT,
  subscription_sale_transaction_gid TEXT UNIQUE,
  subscription_sale_observed_at TEXT,
  subscription_sale_amount_minor INTEGER,
  subscription_sale_currency TEXT,
  subscription_accepted_at TEXT,
  subscription_activated_at TEXT,
  source TEXT NOT NULL DEFAULT 'app_prorated'
    CHECK (source IN ('app_prorated', 'historical_reconciliation')),
  is_test INTEGER NOT NULL CHECK (is_test IN (0, 1)),
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX billing_conversions_shop_id_idx ON billing_conversions(shop_id);
CREATE INDEX billing_conversions_subscription_gid_idx
  ON billing_conversions(subscription_gid);

CREATE TABLE billing_cancellation_intents (
  subscription_gid TEXT PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested', 'confirmed')),
  requested_at TEXT NOT NULL,
  confirmed_at TEXT,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX billing_cancellation_intents_shop_id_idx
  ON billing_cancellation_intents(shop_id);

ALTER TABLE owner_operational_incidents RENAME TO owner_operational_incidents_before_billing;

CREATE TABLE owner_operational_incidents (
  incident_key TEXT PRIMARY KEY,
  incident_kind TEXT NOT NULL
    CHECK (incident_kind IN ('webhooks', 'partner', 'checkout_labels', 'billing')),
  shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('observing', 'active', 'resolved')),
  fingerprint TEXT,
  consecutive_observations INTEGER NOT NULL DEFAULT 0
    CHECK (consecutive_observations >= 0),
  first_observed_at TEXT NOT NULL,
  opened_at TEXT,
  resolved_at TEXT,
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO owner_operational_incidents
SELECT * FROM owner_operational_incidents_before_billing;

DROP TABLE owner_operational_incidents_before_billing;

CREATE INDEX owner_operational_incidents_shop_id_idx
  ON owner_operational_incidents(shop_id);
