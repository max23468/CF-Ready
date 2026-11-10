-- Pagamento unico su richiesta (D-221): l'owner concorda il prezzo con il merchant e lo assegna
-- allo store. L'importo è in centesimi di euro; l'addebito resta un acquisto Shopify approvato.
CREATE TABLE one_time_offers (
  shop_id INTEGER PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
