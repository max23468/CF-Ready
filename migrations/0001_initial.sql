PRAGMA foreign_keys = ON;

CREATE TABLE shops (
  id INTEGER PRIMARY KEY,
  shop_domain TEXT NOT NULL UNIQUE,
  shopify_installation_gid TEXT,
  country_code TEXT,
  shop_currency TEXT,
  billing_currency TEXT,
  installation_status TEXT NOT NULL DEFAULT 'active'
    CHECK (installation_status IN ('active', 'uninstalled', 'blocked_country', 'suspended')),
  installed_at TEXT NOT NULL,
  uninstalled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE shopify_sessions (
  id TEXT PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  is_online INTEGER NOT NULL CHECK (is_online IN (0, 1)),
  scope TEXT,
  access_token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  access_token_expires_at TEXT,
  refresh_token_expires_at TEXT,
  online_user_id TEXT,
  session_payload_ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX shopify_sessions_shop_id_idx ON shopify_sessions(shop_id);
