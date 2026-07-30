CREATE TABLE app_state (
  shop_id INTEGER PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  validation_gid TEXT,
  validation_enabled INTEGER NOT NULL DEFAULT 0 CHECK (validation_enabled IN (0, 1)),
  config_schema_version INTEGER,
  config_hash TEXT,
  last_sync_at TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE webhook_events (
  webhook_id TEXT PRIMARY KEY,
  shop_domain TEXT,
  topic TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  received_at TEXT NOT NULL,
  processed_at TEXT,
  error_code TEXT
) STRICT;

CREATE TABLE app_events (
  id INTEGER PRIMARY KEY,
  shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_class TEXT NOT NULL
    CHECK (event_class IN ('lifecycle', 'billing', 'validation', 'onboarding', 'support', 'error')),
  metadata_json TEXT,
  occurred_at TEXT NOT NULL
) STRICT;

CREATE INDEX app_events_shop_id_occurred_at_idx ON app_events(shop_id, occurred_at);
