ALTER TABLE owner_notifications RENAME TO owner_notifications_before_operational_incidents;

CREATE TABLE owner_notifications (
  id INTEGER PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  notification_kind TEXT NOT NULL
    CHECK (notification_kind IN ('lifecycle', 'billing', 'trial', 'operational')),
  shop_domain TEXT,
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

INSERT INTO owner_notifications
SELECT * FROM owner_notifications_before_operational_incidents;

DROP TABLE owner_notifications_before_operational_incidents;

CREATE INDEX owner_notifications_delivery_idx
  ON owner_notifications(status, available_at, id);
CREATE INDEX owner_notifications_created_at_idx
  ON owner_notifications(created_at);
CREATE INDEX owner_notifications_shop_domain_idx
  ON owner_notifications(shop_domain);

CREATE TABLE owner_operational_incidents (
  incident_key TEXT PRIMARY KEY,
  incident_kind TEXT NOT NULL
    CHECK (incident_kind IN ('webhooks', 'partner', 'checkout_labels')),
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

CREATE INDEX owner_operational_incidents_shop_id_idx
  ON owner_operational_incidents(shop_id);
