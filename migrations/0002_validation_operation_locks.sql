CREATE TABLE validation_operation_locks (
  shop_domain TEXT PRIMARY KEY REFERENCES shops(shop_domain) ON DELETE CASCADE,
  owner_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
