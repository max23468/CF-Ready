ALTER TABLE app_state ADD COLUMN checkout_labels_decision TEXT NOT NULL DEFAULT 'pending'
  CHECK (checkout_labels_decision IN ('pending', 'accepted'));
ALTER TABLE app_state ADD COLUMN checkout_labels_accepted_revision TEXT;
ALTER TABLE app_state ADD COLUMN checkout_labels_reviewed_at TEXT;
