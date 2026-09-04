-- Trasferimento una tantum: il runtime legge soltanto il cursore numerico.
-- Un cursore già presente resta autorevole; il timestamp storico resta una ricevuta inerte.
INSERT INTO owner_notification_state (state_key, state_value, updated_at)
SELECT 'local_notification_event_id',
       CAST((SELECT COALESCE(MAX(id), 0) FROM app_events WHERE occurred_at <= state_value) AS TEXT),
       updated_at
FROM owner_notification_state
WHERE state_key = 'local_notifications_polled_at' AND julianday(state_value) IS NOT NULL
ON CONFLICT(state_key) DO NOTHING;

-- Restringe il contratto senza ricostruire tabelle o riscrivere migrazioni applicate.
-- Eventuali valori storici fuori contratto interrompono la migrazione, senza conversioni.
CREATE TRIGGER trials_pricing_insert BEFORE INSERT ON trials
WHEN NEW.pricing_generation NOT IN ('launch', 'balanced')
BEGIN SELECT RAISE(ABORT, 'unsupported_pricing_generation'); END;
CREATE TRIGGER trials_pricing_update BEFORE UPDATE OF pricing_generation ON trials
WHEN NEW.pricing_generation NOT IN ('launch', 'balanced')
BEGIN SELECT RAISE(ABORT, 'unsupported_pricing_generation'); END;
CREATE TRIGGER trial_ledger_pricing_insert BEFORE INSERT ON trial_ledger
WHEN NEW.pricing_generation NOT IN ('launch', 'balanced')
BEGIN SELECT RAISE(ABORT, 'unsupported_pricing_generation'); END;
CREATE TRIGGER trial_ledger_pricing_update BEFORE UPDATE OF pricing_generation ON trial_ledger
WHEN NEW.pricing_generation NOT IN ('launch', 'balanced')
BEGIN SELECT RAISE(ABORT, 'unsupported_pricing_generation'); END;
CREATE TRIGGER billing_accounts_pricing_insert BEFORE INSERT ON billing_accounts
WHEN NEW.pricing_generation NOT IN ('launch', 'balanced')
BEGIN SELECT RAISE(ABORT, 'unsupported_pricing_generation'); END;
CREATE TRIGGER billing_accounts_pricing_update BEFORE UPDATE OF pricing_generation ON billing_accounts
WHEN NEW.pricing_generation NOT IN ('launch', 'balanced')
BEGIN SELECT RAISE(ABORT, 'unsupported_pricing_generation'); END;

UPDATE trials SET pricing_generation = pricing_generation WHERE pricing_generation NOT IN ('launch', 'balanced');
UPDATE trial_ledger SET pricing_generation = pricing_generation WHERE pricing_generation NOT IN ('launch', 'balanced');
UPDATE billing_accounts SET pricing_generation = pricing_generation WHERE pricing_generation NOT IN ('launch', 'balanced');
