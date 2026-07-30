CREATE TABLE trials (
  shop_id INTEGER PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN ('not_started', 'active', 'expired', 'converted')),
  eligible_at TEXT NOT NULL,
  started_at TEXT,
  ends_at TEXT,
  pricing_generation TEXT NOT NULL
    CHECK (pricing_generation IN ('launch', 'balanced', 'value')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
