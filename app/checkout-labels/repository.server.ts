import { classifyVisibleAddress2, observedLabelForSlot } from "./domain";
import type {
  Address2Decision,
  CheckoutLabelsDecision,
  CheckoutLabelSlot,
  CheckoutLabelsMode,
  CheckoutLabelState,
  StoredCheckoutLabelSlot,
} from "./domain";

const DEFAULT_STATE: CheckoutLabelState = {
  mode: "off",
  managementEpoch: null,
  enabledAt: null,
  lastSyncAt: null,
  lastErrorCode: null,
  decision: "pending",
  acceptedRevision: null,
  reviewedAt: null,
  address2Classification: "unknown",
  address2HasMarketOverride: false,
  address2ExternalChangeAt: null,
  address2Decision: "pending",
  address2ReviewedAt: null,
  address2FormMode: null,
};

export async function readCheckoutLabelState(
  db: D1Database,
  shopDomain: string,
): Promise<CheckoutLabelState> {
  const row = await db
    .prepare(
      `SELECT checkout_labels_mode, checkout_labels_management_epoch,
              checkout_labels_enabled_at, checkout_labels_last_sync_at,
              checkout_labels_last_error_code, checkout_labels_decision,
              checkout_labels_accepted_revision, checkout_labels_reviewed_at,
              address2_classification,
              address2_has_market_override, address2_external_change_at,
              address2_decision, address2_reviewed_at, address2_form_mode,
              address2_form_hidden
       FROM app_state
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(shopDomain)
    .first<{
      checkout_labels_mode: CheckoutLabelsMode;
      checkout_labels_management_epoch: string | null;
      checkout_labels_enabled_at: string | null;
      checkout_labels_last_sync_at: string | null;
      checkout_labels_last_error_code: string | null;
      checkout_labels_decision: CheckoutLabelsDecision;
      checkout_labels_accepted_revision: string | null;
      checkout_labels_reviewed_at: string | null;
      address2_classification: CheckoutLabelState["address2Classification"];
      address2_has_market_override: number;
      address2_external_change_at: string | null;
      address2_decision: Address2Decision;
      address2_reviewed_at: string | null;
      address2_form_mode: Exclude<CheckoutLabelState["address2FormMode"], "hidden">;
      address2_form_hidden: number;
    }>();

  return row
    ? {
        mode: row.checkout_labels_mode,
        managementEpoch: row.checkout_labels_management_epoch,
        enabledAt: row.checkout_labels_enabled_at,
        lastSyncAt: row.checkout_labels_last_sync_at,
        lastErrorCode: row.checkout_labels_last_error_code,
        decision: row.checkout_labels_decision,
        acceptedRevision: row.checkout_labels_accepted_revision,
        reviewedAt: row.checkout_labels_reviewed_at,
        address2Classification: row.address2_classification,
        address2HasMarketOverride: Boolean(row.address2_has_market_override),
        address2ExternalChangeAt: row.address2_external_change_at,
        address2Decision: row.address2_decision,
        address2ReviewedAt: row.address2_reviewed_at,
        address2FormMode: row.address2_form_hidden ? "hidden" : row.address2_form_mode,
      }
    : DEFAULT_STATE;
}

export async function readStoredCheckoutLabelSlots(db: D1Database, shopDomain: string) {
  const rows = await db
    .prepare(
      `SELECT resource_id, translation_key, locale, market_id, slot_kind,
              write_capability, management_epoch, original_present, original_value,
              last_write_present, last_written_value, source_digest,
              last_observed_value, last_observed_at,
              guided_confirmed_value, guided_confirmed_at
       FROM checkout_label_slots
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(shopDomain)
    .all<{
      resource_id: string;
      translation_key: StoredCheckoutLabelSlot["key"];
      locale: string;
      market_id: string;
      slot_kind: StoredCheckoutLabelSlot["kind"];
      write_capability: StoredCheckoutLabelSlot["capability"];
      management_epoch: string | null;
      original_present: number;
      original_value: string | null;
      last_write_present: number | null;
      last_written_value: string | null;
      source_digest: string;
      last_observed_value: string | null;
      last_observed_at: string;
      guided_confirmed_value: string | null;
      guided_confirmed_at: string | null;
    }>();

  return rows.results.map((row) => ({
    resourceId: row.resource_id,
    key: row.translation_key,
    locale: row.locale,
    marketId: row.market_id || null,
    kind: row.slot_kind,
    capability: row.write_capability,
    managementEpoch: row.management_epoch,
    originalPresent: Boolean(row.original_present),
    originalValue: row.original_value,
    lastWritePresent: row.last_write_present === null ? null : Boolean(row.last_write_present),
    lastWrittenValue: row.last_written_value,
    sourceDigest: row.source_digest,
    lastObservedValue: row.last_observed_value,
    lastObservedAt: row.last_observed_at,
    guidedConfirmedValue: row.guided_confirmed_value,
    guidedConfirmedAt: row.guided_confirmed_at,
  }));
}

export async function persistCheckoutLabelObservation(
  db: D1Database,
  shopDomain: string,
  slots: CheckoutLabelSlot[],
  _address2: {
    classification: CheckoutLabelState["address2Classification"];
    hasMarketOverride: boolean;
  },
) {
  const now = new Date().toISOString();
  const requiredAddress2 = classifyVisibleAddress2(slots, "required");
  const optionalAddress2 = classifyVisibleAddress2(slots, "optional");
  const statements = slots.map((slot) =>
    db
      .prepare(
        `INSERT INTO checkout_label_slots (
           shop_id, resource_id, translation_key, locale, market_id, slot_kind,
           write_capability, management_epoch, original_present, original_value,
           last_write_present, last_written_value, source_digest,
           last_observed_value, last_observed_at
         ) VALUES (
           (SELECT id FROM shops WHERE shop_domain = ?), ?, ?, ?, ?, ?, ?, NULL, 0,
           NULL, NULL, NULL, ?, ?, ?
         )
         ON CONFLICT(shop_id, resource_id, translation_key, locale, market_id, slot_kind)
         DO UPDATE SET write_capability = excluded.write_capability,
                       source_digest = excluded.source_digest,
                       last_observed_value = excluded.last_observed_value,
                       last_observed_at = excluded.last_observed_at,
                       guided_confirmed_value = CASE
                         WHEN lower(checkout_label_slots.guided_confirmed_value) = lower(excluded.last_observed_value)
                           THEN checkout_label_slots.guided_confirmed_value
                         ELSE NULL
                       END,
                       guided_confirmed_at = CASE
                         WHEN lower(checkout_label_slots.guided_confirmed_value) = lower(excluded.last_observed_value)
                           THEN checkout_label_slots.guided_confirmed_at
                         ELSE NULL
                       END`,
      )
      .bind(
        shopDomain,
        slot.resourceId,
        slot.key,
        slot.locale,
        slot.marketId ?? "",
        slot.kind,
        slot.capability,
        slot.sourceDigest,
        observedLabelForSlot(slot),
        now,
      ),
  );
  statements.push(
    db
      .prepare(
        `UPDATE app_state
         SET address2_classification = CASE
               WHEN address2_form_hidden = 1 THEN 'unknown'
               WHEN address2_form_mode = 'required' THEN ?
               WHEN address2_form_mode = 'optional' THEN ?
               ELSE 'unknown'
             END,
             address2_has_market_override = CASE
               WHEN address2_form_hidden = 1 THEN 0
               WHEN address2_form_mode = 'required' THEN ?
               WHEN address2_form_mode = 'optional' THEN ?
               ELSE 0
             END,
             updated_at = ?
         WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
      )
      .bind(
        requiredAddress2.classification,
        optionalAddress2.classification,
        Number(requiredAddress2.hasMarketOverride),
        Number(optionalAddress2.hasMarketOverride),
        now,
        shopDomain,
      ),
  );
  await db.batch(statements);
}

export async function enableCheckoutLabels(
  db: D1Database,
  shopDomain: string,
  mode: Exclude<CheckoutLabelsMode, "off">,
) {
  const now = new Date().toISOString();
  const epoch = crypto.randomUUID();
  await db
    .prepare(
      `UPDATE app_state
       SET checkout_labels_mode = ?, checkout_labels_management_epoch = ?,
           checkout_labels_enabled_at = ?, checkout_labels_last_error_code = NULL,
           checkout_labels_decision = 'pending', checkout_labels_accepted_revision = NULL,
           checkout_labels_reviewed_at = NULL,
           updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(mode, epoch, now, now, shopDomain)
    .run();
  return epoch;
}

export async function markCheckoutLabelsResult(
  db: D1Database,
  shopDomain: string,
  result: {
    mode?: CheckoutLabelsMode;
    errorCode: string | null;
    synced: boolean;
    externalChange?: boolean;
  },
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE app_state
       SET checkout_labels_mode = COALESCE(?, checkout_labels_mode),
           checkout_labels_last_sync_at = CASE WHEN ? = 1 THEN ? ELSE checkout_labels_last_sync_at END,
           checkout_labels_last_error_code = ?,
           address2_external_change_at = CASE WHEN ? = 1 THEN ? ELSE address2_external_change_at END,
           updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(
      result.mode ?? null,
      Number(result.synced),
      now,
      result.errorCode,
      Number(result.externalChange ?? false),
      now,
      now,
      shopDomain,
    )
    .run();
}

export async function claimCheckoutLabelSlot(
  db: D1Database,
  shopDomain: string,
  slot: CheckoutLabelSlot,
  epoch: string,
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO checkout_label_slots (
         shop_id, resource_id, translation_key, locale, market_id, slot_kind,
         write_capability, management_epoch, original_present, original_value,
         last_write_present, last_written_value, source_digest,
         last_observed_value, last_observed_at
       ) VALUES (
         (SELECT id FROM shops WHERE shop_domain = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?
       )
       ON CONFLICT(shop_id, resource_id, translation_key, locale, market_id, slot_kind)
       DO UPDATE SET management_epoch = CASE
                         WHEN checkout_label_slots.management_epoch IS NULL THEN excluded.management_epoch
                         ELSE checkout_label_slots.management_epoch
                       END,
                     original_present = CASE
                         WHEN checkout_label_slots.management_epoch IS NULL THEN excluded.original_present
                         ELSE checkout_label_slots.original_present
                       END,
                     original_value = CASE
                         WHEN checkout_label_slots.management_epoch IS NULL THEN excluded.original_value
                         ELSE checkout_label_slots.original_value
                       END,
                     write_capability = excluded.write_capability,
                     source_digest = excluded.source_digest,
                     last_observed_value = excluded.last_observed_value,
                     last_observed_at = excluded.last_observed_at`,
    )
    .bind(
      shopDomain,
      slot.resourceId,
      slot.key,
      slot.locale,
      slot.marketId ?? "",
      slot.kind,
      slot.capability,
      epoch,
      Number(slot.currentValue !== null),
      observedLabelForSlot(slot),
      slot.sourceDigest,
      slot.currentValue,
      now,
    )
    .run();
}

export async function saveCheckoutLabelWrite(
  db: D1Database,
  shopDomain: string,
  slot: CheckoutLabelSlot,
  value: string | null,
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE checkout_label_slots
       SET last_write_present = ?, last_written_value = ?, source_digest = ?,
           last_observed_value = ?, last_observed_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
         AND resource_id = ? AND translation_key = ? AND locale = ?
         AND market_id = ? AND slot_kind = ?`,
    )
    .bind(
      Number(value !== null),
      value,
      slot.sourceDigest,
      value,
      now,
      shopDomain,
      slot.resourceId,
      slot.key,
      slot.locale,
      slot.marketId ?? "",
      slot.kind,
    )
    .run();
}

export async function stopCheckoutLabelManagement(db: D1Database, shopDomain: string) {
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE app_state
         SET checkout_labels_mode = 'off', checkout_labels_management_epoch = NULL,
             checkout_labels_enabled_at = NULL, checkout_labels_last_error_code = NULL,
             updated_at = ?
         WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
      )
      .bind(now, shopDomain),
    db
      .prepare(
        `UPDATE checkout_label_slots
         SET management_epoch = NULL, original_present = 0, original_value = NULL,
             last_write_present = NULL, last_written_value = NULL,
             guided_confirmed_value = NULL, guided_confirmed_at = NULL
         WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
      )
      .bind(shopDomain),
  ]);
}

export async function confirmGuidedCheckoutLabelSlots(
  db: D1Database,
  shopDomain: string,
  slots: CheckoutLabelSlot[],
) {
  const now = new Date().toISOString();
  await db.batch(
    slots.map((slot) =>
      db
        .prepare(
          `UPDATE checkout_label_slots
           SET guided_confirmed_value = ?, guided_confirmed_at = ?
           WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
             AND resource_id = ? AND translation_key = ? AND locale = ?
             AND market_id = ? AND slot_kind = ?`,
        )
        .bind(
          observedLabelForSlot(slot),
          now,
          shopDomain,
          slot.resourceId,
          slot.key,
          slot.locale,
          slot.marketId ?? "",
          slot.kind,
        ),
    ),
  );
}

export async function saveAddress2Decision(
  db: D1Database,
  shopDomain: string,
  decision: Address2Decision,
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE app_state
       SET address2_decision = ?, address2_reviewed_at = ?,
           address2_external_change_at = NULL, updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(decision, now, now, shopDomain)
    .run();
}

export async function saveAddress2FormMode(
  db: D1Database,
  shopDomain: string,
  mode: NonNullable<CheckoutLabelState["address2FormMode"]>,
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE app_state
       SET address2_form_mode = CASE WHEN ? = 'hidden' THEN address2_form_mode ELSE ? END,
           address2_form_hidden = CASE WHEN ? = 'hidden' THEN 1 ELSE 0 END,
           updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(mode, mode, mode, now, shopDomain)
    .run();
}

export async function saveCheckoutLabelsDecision(
  db: D1Database,
  shopDomain: string,
  decision: CheckoutLabelsDecision,
  acceptedRevision: string | null,
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE app_state
       SET checkout_labels_decision = ?, checkout_labels_accepted_revision = ?,
           checkout_labels_reviewed_at = ?, updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(decision, acceptedRevision, decision === "accepted" ? now : null, now, shopDomain)
    .run();
}

export async function markCheckoutLabelsScopeRequired(db: D1Database, shopDomain: string) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE app_state
       SET checkout_labels_mode = CASE
             WHEN checkout_labels_mode = 'off' THEN 'off' ELSE 'guided' END,
           checkout_labels_last_error_code = CASE
             WHEN checkout_labels_mode = 'off' THEN NULL ELSE 'checkout_labels_scope_required' END,
           updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(now, shopDomain)
    .run();
}
