ALTER TABLE app_state ADD COLUMN address2_form_hidden INTEGER NOT NULL DEFAULT 0
  CHECK (address2_form_hidden IN (0, 1));
