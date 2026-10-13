-- Contatori aggregati per il Control Center owner: nessun riferimento allo store,
-- così il valore sopravvive a `shop/redact` e alla retention degli eventi.
CREATE TABLE owner_metric_counters (
  metric TEXT PRIMARY KEY CHECK (metric IN ('app_uninstalled')),
  value INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO owner_metric_counters (metric, value, started_at, updated_at)
VALUES (
  'app_uninstalled',
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
