CREATE TABLE owner_control_updates (
  update_id INTEGER PRIMARY KEY CHECK (update_id >= 0),
  update_kind TEXT NOT NULL CHECK (update_kind IN ('message', 'callback_query')),
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  claim_token TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX owner_control_updates_retention_idx
  ON owner_control_updates(updated_at);

CREATE TABLE owner_control_state (
  state_key TEXT PRIMARY KEY,
  state_value TEXT NOT NULL CHECK (json_valid(state_value)),
  updated_at TEXT NOT NULL
) STRICT;
