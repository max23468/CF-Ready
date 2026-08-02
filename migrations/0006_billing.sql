CREATE TABLE billing_accounts (
  shop_id INTEGER PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  entitlement_status TEXT NOT NULL
    CHECK (entitlement_status IN ('trial', 'active', 'ending', 'expired', 'refunded', 'none')),
  plan_kind TEXT NOT NULL
    CHECK (plan_kind IN ('monthly', 'annual', 'one_time', 'none')),
  pricing_generation TEXT NOT NULL
    CHECK (pricing_generation IN ('launch', 'balanced', 'value')),
  shopify_charge_gid TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  one_time_purchased_at TEXT,
  last_reconciled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE billing_events (
  id INTEGER PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  shopify_resource_gid TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_minor INTEGER,
  currency TEXT,
  period_start TEXT,
  period_end TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX billing_events_resource_type_idx
  ON billing_events(shopify_resource_gid, event_type);
