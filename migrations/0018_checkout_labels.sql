ALTER TABLE app_state ADD COLUMN checkout_labels_mode TEXT NOT NULL DEFAULT 'off'
  CHECK (checkout_labels_mode IN ('off', 'guided', 'automatic', 'partial'));
ALTER TABLE app_state ADD COLUMN checkout_labels_management_epoch TEXT;
ALTER TABLE app_state ADD COLUMN checkout_labels_enabled_at TEXT;
ALTER TABLE app_state ADD COLUMN checkout_labels_last_sync_at TEXT;
ALTER TABLE app_state ADD COLUMN checkout_labels_last_error_code TEXT;
ALTER TABLE app_state ADD COLUMN address2_classification TEXT NOT NULL DEFAULT 'unknown'
  CHECK (address2_classification IN ('unknown', 'expected', 'nonstandard', 'fiscal_conflict'));
ALTER TABLE app_state ADD COLUMN address2_has_market_override INTEGER NOT NULL DEFAULT 0
  CHECK (address2_has_market_override IN (0, 1));
ALTER TABLE app_state ADD COLUMN address2_external_change_at TEXT;
ALTER TABLE app_state ADD COLUMN address2_decision TEXT NOT NULL DEFAULT 'pending'
  CHECK (address2_decision IN ('pending', 'accepted', 'restored', 'manual_restore_required'));
ALTER TABLE app_state ADD COLUMN address2_reviewed_at TEXT;

UPDATE app_state
SET address2_classification = 'fiscal_conflict',
    address2_decision = 'pending',
    address2_reviewed_at = address2_conflict_declared_at
WHERE address2_conflict_declared_at IS NOT NULL;

CREATE TABLE checkout_label_slots (
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL,
  translation_key TEXT NOT NULL CHECK (translation_key IN (
    'shopify.checkout.localized_fields.additional_information.tax_credential_it',
    'shopify.checkout.localized_fields.additional_information.tax_email_it',
    'shopify.checkout.contact.address2_label',
    'shopify.checkout.contact.optional_address2_label'
  )),
  locale TEXT NOT NULL,
  market_id TEXT NOT NULL DEFAULT '',
  slot_kind TEXT NOT NULL CHECK (slot_kind IN ('source', 'global_translation', 'market_translation')),
  write_capability TEXT NOT NULL CHECK (write_capability IN ('read_only', 'guided', 'automatic')),
  management_epoch TEXT,
  original_present INTEGER NOT NULL DEFAULT 0 CHECK (original_present IN (0, 1)),
  original_value TEXT,
  last_write_present INTEGER CHECK (last_write_present IN (0, 1)),
  last_written_value TEXT,
  source_digest TEXT NOT NULL,
  last_observed_value TEXT,
  last_observed_at TEXT NOT NULL,
  guided_confirmed_value TEXT,
  guided_confirmed_at TEXT,
  PRIMARY KEY (shop_id, resource_id, translation_key, locale, market_id, slot_kind)
) STRICT;

CREATE INDEX checkout_label_slots_shop_id_idx ON checkout_label_slots(shop_id);
