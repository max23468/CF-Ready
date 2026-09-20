CREATE INDEX webhook_events_status_received_at_idx
  ON webhook_events(status, received_at);

CREATE INDEX webhook_events_recovery_idx
  ON webhook_events(topic, shop_domain, received_at)
  WHERE status = 'processed';
