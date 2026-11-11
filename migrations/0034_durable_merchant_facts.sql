-- Fatti che la Home e le notifiche trattano come stato permanente vivevano solo in `app_events`,
-- che la retention cancella dopo 12 mesi: chiusura del check-in, recensione completata, ultima
-- attivazione della Validation e installazione già registrata. Passano su colonne dedicate.
ALTER TABLE app_state ADD COLUMN merchant_checkin_dismissed_at TEXT;
ALTER TABLE app_state ADD COLUMN review_completed_at TEXT;
ALTER TABLE app_state ADD COLUMN validation_enabled_since TEXT;
ALTER TABLE shops ADD COLUMN install_recorded_at TEXT;

UPDATE app_state SET
  merchant_checkin_dismissed_at = (
    SELECT MIN(e.occurred_at) FROM app_events e
     WHERE e.shop_id = app_state.shop_id AND e.event_name = 'merchant_checkin_dismissed'
  ),
  review_completed_at = (
    SELECT MIN(e.occurred_at) FROM app_events e
     WHERE e.shop_id = app_state.shop_id AND e.event_name = 'review_prompt_result'
       AND json_extract(e.metadata_json, '$.reason') IN ('success', 'already-reviewed')
  ),
  validation_enabled_since = (
    SELECT MAX(e.occurred_at) FROM app_events e
     WHERE e.shop_id = app_state.shop_id AND e.event_name = 'validation_enabled'
  );

UPDATE shops SET install_recorded_at = (
  SELECT MAX(e.occurred_at) FROM app_events e
   WHERE e.shop_id = shops.id AND e.event_name = 'app_installed'
);

-- La retention di `performance_samples` ordina per data senza un indice che parta da lì.
CREATE INDEX performance_samples_observed_at_idx ON performance_samples(observed_at);
-- Filtri per store e cascade della cancellazione dello store.
CREATE INDEX billing_events_shop_id_idx ON billing_events(shop_id, occurred_at);
-- Duplica la prima colonna della chiave primaria.
DROP INDEX checkout_label_slots_shop_id_idx;
