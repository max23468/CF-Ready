ALTER TABLE app_state
ADD COLUMN validation_state_revision INTEGER NOT NULL DEFAULT 0
CHECK (validation_state_revision >= 0);
