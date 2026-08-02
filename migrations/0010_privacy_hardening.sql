DELETE FROM trial_ledger;

ALTER TABLE shopify_sessions DROP COLUMN online_user_id;

CREATE INDEX webhook_events_received_at_idx ON webhook_events(received_at);
CREATE INDEX app_events_class_occurred_at_idx ON app_events(event_class, occurred_at);
CREATE INDEX billing_events_occurred_at_idx ON billing_events(occurred_at);
