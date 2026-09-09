ALTER TABLE app_state ADD COLUMN address2_form_mode TEXT
  CHECK (address2_form_mode IN ('required', 'optional'));
