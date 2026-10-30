-- La conferma owner è distinta dalle osservazioni Partner e non inventa transazioni API.
CREATE TABLE billing_conversion_reviews (
  conversion_id INTEGER PRIMARY KEY REFERENCES billing_conversions(id) ON DELETE CASCADE,
  reviewed_at TEXT NOT NULL,
  evidence_event_id INTEGER REFERENCES app_events(id) ON DELETE SET NULL,
  evidence_json TEXT CHECK (evidence_json IS NULL OR json_valid(evidence_json)),
  subscription_sale_transaction_gid TEXT,
  credit_transaction_gid TEXT,
  credit_amount_minor INTEGER,
  credit_currency TEXT
) STRICT;
