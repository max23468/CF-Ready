ALTER TABLE webhook_events ADD COLUMN claim_token TEXT;
ALTER TABLE webhook_events ADD COLUMN installation_started_at TEXT;
ALTER TABLE app_events ADD COLUMN webhook_id TEXT;

CREATE UNIQUE INDEX app_events_webhook_name_idx
  ON app_events(webhook_id, event_name)
  WHERE webhook_id IS NOT NULL;
