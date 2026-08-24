ALTER TABLE billing_events ADD COLUMN previous_entitlement_status TEXT;
ALTER TABLE billing_events ADD COLUMN previous_plan_kind TEXT;

CREATE TABLE owner_notifications (
  id INTEGER PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  notification_kind TEXT NOT NULL CHECK (notification_kind IN ('lifecycle', 'billing', 'trial')),
  shop_domain TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  source_occurred_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TEXT NOT NULL,
  claim_token TEXT,
  claimed_at TEXT,
  sent_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX owner_notifications_delivery_idx
  ON owner_notifications(status, available_at, id);

CREATE INDEX owner_notifications_created_at_idx
  ON owner_notifications(created_at);

CREATE INDEX owner_notifications_shop_domain_idx
  ON owner_notifications(shop_domain);

CREATE TABLE owner_notification_redactions (
  shop_hash TEXT PRIMARY KEY,
  redacted_at TEXT NOT NULL
) STRICT;

CREATE INDEX owner_notification_redactions_retention_idx
  ON owner_notification_redactions(redacted_at);

CREATE TABLE owner_notification_state (
  state_key TEXT PRIMARY KEY,
  state_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
