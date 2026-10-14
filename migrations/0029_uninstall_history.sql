-- Disinstallazioni da store di review Shopify o interni, separate dai merchant (D-189).
ALTER TABLE owner_metric_counters ADD COLUMN review_value INTEGER NOT NULL DEFAULT 0
  CHECK (review_value >= 0);

-- Storico anonimo: nessun nome, dominio o identificatore, così sopravvive a `shop/redact`.
-- Giorno e durata in giorni bastano alle tendenze senza ricostruire l'istante dell'evento.
CREATE TABLE uninstall_history (
  id INTEGER PRIMARY KEY,
  uninstalled_on TEXT NOT NULL,
  installed_days INTEGER NOT NULL CHECK (installed_days >= 0),
  store_kind TEXT NOT NULL CHECK (store_kind IN ('merchant', 'review')),
  billing_category TEXT NOT NULL CHECK (billing_category IN (
    'monthly', 'annual', 'one_time', 'ending', 'complimentary', 'trial',
    'expired', 'refunded', 'trial_expired', 'trial_never', 'other'
  )),
  validation_enabled INTEGER NOT NULL CHECK (validation_enabled IN (0, 1)),
  onboarding_completed INTEGER NOT NULL CHECK (onboarding_completed IN (0, 1))
) STRICT;

CREATE INDEX uninstall_history_uninstalled_on_idx ON uninstall_history(uninstalled_on);

-- Le disinstallazioni precedenti non si ricostruiscono: la vista dichiara da quando conta.
INSERT INTO owner_control_state (state_key, state_value, updated_at)
VALUES (
  'uninstall_history_v1',
  json_object('startedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
