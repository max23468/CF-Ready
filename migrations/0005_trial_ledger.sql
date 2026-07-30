CREATE TABLE trial_ledger (
  shop_hash TEXT PRIMARY KEY,
  trial_ends_at TEXT,
  pricing_generation TEXT NOT NULL
    CHECK (pricing_generation IN ('launch', 'balanced', 'value')),
  recorded_at TEXT NOT NULL
) STRICT;
