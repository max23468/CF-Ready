ALTER TABLE app_state ADD COLUMN address2_form_mode_next TEXT
  CHECK (address2_form_mode_next IN ('required', 'optional', 'hidden'));

UPDATE app_state SET address2_form_mode_next = address2_form_mode;

ALTER TABLE app_state DROP COLUMN address2_form_mode;
ALTER TABLE app_state RENAME COLUMN address2_form_mode_next TO address2_form_mode;
