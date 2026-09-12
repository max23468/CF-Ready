CREATE TABLE configuration_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  snapshot_hash TEXT NOT NULL CHECK (length(snapshot_hash) = 64),
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
  messages_json TEXT NOT NULL CHECK (json_valid(messages_json)),
  created_at TEXT NOT NULL,
  UNIQUE (shop_id, snapshot_hash)
);

CREATE INDEX configuration_history_shop_created_idx
  ON configuration_history(shop_id, created_at DESC, id DESC);
