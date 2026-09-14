CREATE TABLE installation_engagement (
  shop_id INTEGER PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  installed_at TEXT NOT NULL,
  first_opened_at TEXT NOT NULL,
  onboarding_started_at TEXT
);

CREATE TABLE uninstall_feedback (
  shop_id INTEGER PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  installed_at TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  reason TEXT,
  description TEXT,
  fetched_at TEXT NOT NULL
);

-- Il passato non viene trasformato in aperture o mancate aperture.
INSERT INTO owner_notification_state (state_key, state_value, updated_at)
VALUES (
  'engagement_tracking_started_at',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

-- Il timestamp di installazione protegge anche dalle richieste di una vecchia scheda.
CREATE TRIGGER reset_installation_diagnostics
AFTER UPDATE OF installed_at ON shops
WHEN OLD.installed_at != NEW.installed_at
BEGIN
  DELETE FROM installation_engagement WHERE shop_id = NEW.id;
  DELETE FROM uninstall_feedback WHERE shop_id = NEW.id;
END;
