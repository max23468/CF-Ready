CREATE TABLE complimentary_entitlements (
  shop_id INTEGER PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
