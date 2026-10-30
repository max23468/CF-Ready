import { recordTrialLedger } from "./billing.server";
import { trialLedgerHash } from "./hash.server";
import { logEvent, recordEvent } from "./events.server";
import { BFS_PLAN_STATE_PREFIX, BILLING_STATUS_CATEGORY_SQL } from "./owner-control/model";
import { reviewStoreSql } from "./owner-control/review-stores";

// Installazione da uno store non ammesso: si cancella tutto ciò che l'autenticazione ha
// appena creato, così non resta né una sessione utilizzabile né uno store sconosciuto.
export async function refuseInstall(db: D1Database, shopDomain: string) {
  await db.batch([
    db
      .prepare(
        `DELETE FROM shopify_sessions
         WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
      )
      .bind(shopDomain),
    db.prepare("DELETE FROM shops WHERE shop_domain = ?").bind(shopDomain),
  ]);

  // Registrato dopo, e senza riferimento allo store: la cancellazione porterebbe via anche
  // l'evento, e lo store rifiutato non è nostro.
  await recordEvent(db, {
    name: "install_refused",
    class: "lifecycle",
    metadata: { reason: "shop_not_allowed" },
  });
}

// Con la managed installation ogni rinnovo del token completa un'autenticazione e riesegue
// `afterAuth`: l'evento vale una sola volta per installazione, cioè finché non arriva una
// disinstallazione successiva.
export async function recordInstallOnce(db: D1Database, shopDomain: string) {
  const occurredAt = new Date().toISOString();
  const inserted = await db
    .prepare(
      `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
       SELECT s.id, 'app_installed', 'lifecycle', ?
       FROM shops s
       WHERE s.shop_domain = ?
         AND NOT EXISTS (
           SELECT 1 FROM app_events installed
           WHERE installed.shop_id = s.id
             AND installed.event_name = 'app_installed'
             AND installed.occurred_at > COALESCE((
               SELECT MAX(uninstalled.occurred_at) FROM app_events uninstalled
               WHERE uninstalled.shop_id = s.id AND uninstalled.event_name = 'app_uninstalled'
             ), '')
         )
       RETURNING id`,
    )
    .bind(occurredAt, shopDomain)
    .first<{ id: number }>();

  if (inserted) {
    logEvent({ name: "app_installed", class: "lifecycle" }, occurredAt);
  }
  return inserted !== null;
}

// Vale una sola volta per installazione: snapshot, contatore ed evento condividono la condizione.
const FIRST_UNINSTALL_SQL = `NOT EXISTS (
  SELECT 1 FROM app_events
  WHERE shop_id = s.id AND event_name = 'app_uninstalled' AND occurred_at >= s.installed_at
)`;
const BFS_DEVELOPMENT_SQL = `(json_extract(o.state_value, '$.classification') = 'development'
  AND json_extract(o.state_value, '$.installedAt') = s.installed_at)`;
const REVIEW_STORE_SQL = reviewStoreSql("s.display_name", "s.shop_domain", BFS_DEVELOPMENT_SQL);

export async function markUninstalled(
  db: D1Database,
  shopDomain: string,
  installationStartedAt: string,
  webhookId: string,
) {
  const now = new Date().toISOString();
  const results = await db.batch([
    // Primo del batch: legge Validation e onboarding prima che la disinstallazione li azzeri.
    // Lo storico è anonimo e sopravvive a `shop/redact` (D-189).
    db
      .prepare(
        `INSERT INTO uninstall_history (
           uninstalled_on, installed_days, store_kind, billing_category,
           validation_enabled, onboarding_completed
         )
         SELECT date(?), MAX(0, CAST(julianday(?) - julianday(s.installed_at) AS INTEGER)),
                CASE WHEN ${REVIEW_STORE_SQL} THEN 'review' ELSE 'merchant' END,
                ${BILLING_STATUS_CATEGORY_SQL},
                coalesce(a.validation_enabled, 0),
                coalesce(a.onboarding_status = 'completed', 0)
         FROM shops s
         LEFT JOIN app_state a ON a.shop_id = s.id
         LEFT JOIN trials t ON t.shop_id = s.id
         LEFT JOIN billing_accounts b ON b.shop_id = s.id
         LEFT JOIN complimentary_entitlements c ON c.shop_id = s.id
         LEFT JOIN owner_control_state o ON o.state_key = '${BFS_PLAN_STATE_PREFIX}' || s.id
         WHERE s.shop_domain = ? AND s.installed_at = ? AND ${FIRST_UNINSTALL_SQL}`,
      )
      .bind(now, now, shopDomain, installationStartedAt),
    db
      .prepare(
        `UPDATE shops SET installation_status = 'uninstalled', uninstalled_at = ?, updated_at = ?
         WHERE shop_domain = ? AND installed_at = ?`,
      )
      .bind(now, now, shopDomain, installationStartedAt),
    // Shopify rimuove le risorse dell'app disinstallata e revoca i permessi facoltativi: lo stato
    // dell'installazione riparte da zero, così la reinstallazione ripropone l'onboarding e non
    // eredita una gestione etichette che senza quei permessi bloccherebbe il salvataggio.
    // Prova, pagamento unico e omaggio restano: vivono in altre tabelle o in Shopify.
    db
      .prepare(
        `UPDATE app_state SET validation_gid = NULL, validation_enabled = 0,
           last_error_code = NULL, onboarding_status = 'not_started', onboarding_step = 0,
           setup_checklist_dismissed_at = NULL, address2_conflict_declared_at = NULL,
           checkout_labels_mode = 'off', checkout_labels_management_epoch = NULL,
           checkout_labels_enabled_at = NULL, checkout_labels_last_sync_at = NULL,
           checkout_labels_last_error_code = NULL, address2_classification = 'unknown',
           address2_has_market_override = 0, address2_external_change_at = NULL,
           address2_decision = 'pending', address2_reviewed_at = NULL, address2_form_mode = NULL,
           address2_form_hidden = 0, checkout_labels_decision = 'pending',
           checkout_labels_accepted_revision = NULL, checkout_labels_reviewed_at = NULL,
           updated_at = ?
         WHERE shop_id = (
           SELECT id FROM shops WHERE shop_domain = ? AND installed_at = ?
         )`,
      )
      .bind(now, shopDomain, installationStartedAt),
    db
      .prepare(
        `DELETE FROM shopify_sessions
         WHERE shop_id = (
           SELECT id FROM shops WHERE shop_domain = ? AND installed_at = ?
         )`,
      )
      .bind(shopDomain, installationStartedAt),
    // Precede l'evento: il batch è una transazione, quindi il contatore aggregato sale una
    // sola volta per installazione anche con webhook ritentati.
    db
      .prepare(
        `UPDATE owner_metric_counters
         SET value = value + 1,
             review_value = review_value + (
               SELECT CASE WHEN ${REVIEW_STORE_SQL} THEN 1 ELSE 0 END
               FROM shops s
               LEFT JOIN owner_control_state o
                 ON o.state_key = '${BFS_PLAN_STATE_PREFIX}' || s.id
               WHERE s.shop_domain = ? AND s.installed_at = ?
             ),
             updated_at = ?
         WHERE metric = 'app_uninstalled' AND EXISTS (
           SELECT 1 FROM shops s
           WHERE s.shop_domain = ? AND s.installed_at = ? AND ${FIRST_UNINSTALL_SQL}
         )`,
      )
      .bind(shopDomain, installationStartedAt, now, shopDomain, installationStartedAt),
    db
      .prepare(
        `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
         SELECT s.id, 'app_uninstalled', 'lifecycle', ? FROM shops s
         WHERE s.shop_domain = ? AND s.installed_at = ? AND ${FIRST_UNINSTALL_SQL}`,
      )
      .bind(now, shopDomain, installationStartedAt),
  ]);
  const inserted = results[5].meta.changes === 1;
  if (inserted) {
    logEvent({ name: "app_uninstalled", class: "lifecycle", webhookId }, now);
  }
  return inserted;
}

// Shopify invia `shop/redact` 48 ore dopo la disinstallazione e non annulla l'invio se
// nel frattempo lo store reinstalla: cancellare i dati di un'installazione viva
// disconnetterebbe il merchant. Nessun dato acquirente è coinvolto, quindi la richiesta
// viene presa in carico senza cancellare finché l'installazione risulta attiva.
export async function redactShop(
  db: D1Database,
  shopDomain: string,
  webhookId: string,
  topic = "SHOP_REDACT",
) {
  const alreadyRedacted = await db
    .prepare(
      `SELECT id, occurred_at FROM app_events
       WHERE webhook_id = ? AND event_name = 'shop_redacted'`,
    )
    .bind(webhookId)
    .first<{ id: number; occurred_at: string }>();
  if (alreadyRedacted) {
    await db.batch([
      db.prepare("DELETE FROM owner_notifications WHERE shop_domain = ?").bind(shopDomain),
      ownerNotificationRedactionStatement(
        db,
        await trialLedgerHash(shopDomain),
        alreadyRedacted.occurred_at,
      ),
      db
        .prepare("UPDATE webhook_events SET shop_domain = NULL WHERE webhook_id = ?")
        .bind(webhookId),
    ]);
    return true;
  }

  const shop = await db
    .prepare("SELECT installation_status FROM shops WHERE shop_domain = ?")
    .bind(shopDomain)
    .first<{ installation_status: string }>();

  // Un Worker precedente può essersi fermato dopo la cancellazione dello store ma prima di
  // anonimizzare la ricevuta. Il dominio non deve restare nella riga ormai priva di owner.
  if (!shop) {
    const now = new Date().toISOString();
    const shopHash = await trialLedgerHash(shopDomain);
    const results = await db.batch([
      db
        .prepare(
          `INSERT INTO app_events (
             shop_id, webhook_id, event_name, event_class, metadata_json, occurred_at
           ) VALUES (NULL, ?, 'shop_redacted', 'lifecycle', ?, ?)
           ON CONFLICT(webhook_id, event_name) WHERE webhook_id IS NOT NULL DO NOTHING`,
        )
        .bind(webhookId, JSON.stringify({ topic }), now),
      db
        .prepare("UPDATE webhook_events SET shop_domain = NULL WHERE shop_domain = ?")
        .bind(shopDomain),
      db.prepare("DELETE FROM owner_notifications WHERE shop_domain = ?").bind(shopDomain),
      ownerNotificationRedactionStatement(db, shopHash, now),
    ]);
    if (results[0].meta.changes === 1) {
      logEvent(
        {
          name: "shop_redacted",
          class: "lifecycle",
          ...(topic === "SHOP_REDACT" ? { webhookId } : {}),
          metadata: { topic },
        },
        now,
      );
    }
    return true;
  }

  if (shop.installation_status !== "uninstalled") return false;

  // Il ledger conserva soltanto la prova fruita; Shopify resta autorevole per
  // l'acquisto una tantum. Va scritto prima perché la cancellazione rimuove lo store.
  await recordTrialLedger(db, shopDomain);

  const now = new Date().toISOString();
  const shopHash = await trialLedgerHash(shopDomain);
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO app_events (
           shop_id, webhook_id, event_name, event_class, metadata_json, occurred_at
         )
         SELECT NULL, ?, 'shop_redacted', 'lifecycle', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM shops
           WHERE shop_domain = ? AND installation_status = 'uninstalled'
         )
         ON CONFLICT(webhook_id, event_name) WHERE webhook_id IS NOT NULL DO NOTHING`,
      )
      .bind(webhookId, JSON.stringify({ topic }), now, shopDomain),
    db
      .prepare(`DELETE FROM shops WHERE shop_domain = ? AND installation_status = 'uninstalled'`)
      .bind(shopDomain),
    db.prepare("DELETE FROM owner_notifications WHERE shop_domain = ?").bind(shopDomain),
    ownerNotificationRedactionStatement(db, shopHash, now),
    db
      .prepare(
        `UPDATE webhook_events SET shop_domain = NULL
         WHERE shop_domain = ? AND EXISTS (
           SELECT 1 FROM app_events
           WHERE webhook_id = ? AND event_name = 'shop_redacted'
         )`,
      )
      .bind(shopDomain, webhookId),
  ]);

  if (results[0].meta.changes === 1) {
    logEvent(
      {
        name: "shop_redacted",
        class: "lifecycle",
        ...(topic === "SHOP_REDACT" ? { webhookId } : {}),
        metadata: { topic },
      },
      now,
    );
  }

  return (
    (await db
      .prepare(
        `SELECT id FROM app_events
         WHERE webhook_id = ? AND event_name = 'shop_redacted'`,
      )
      .bind(webhookId)
      .first()) !== null
  );
}

function ownerNotificationRedactionStatement(db: D1Database, shopHash: string, redactedAt: string) {
  return db
    .prepare(
      `INSERT INTO owner_notification_redactions (shop_hash, redacted_at)
       VALUES (?, ?)
       ON CONFLICT(shop_hash) DO UPDATE SET
         redacted_at = MAX(owner_notification_redactions.redacted_at, excluded.redacted_at)`,
    )
    .bind(shopHash, redactedAt);
}

export async function redactExpiredShops(db: D1Database, now = new Date()) {
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT shop_domain FROM shops
       WHERE installation_status = 'uninstalled' AND uninstalled_at <= ?
       ORDER BY uninstalled_at, id
       LIMIT 25`,
    )
    .bind(cutoff)
    .all<{ shop_domain: string }>();

  let redacted = 0;
  const errors: unknown[] = [];
  for (const { shop_domain: shopDomain } of results) {
    try {
      if (
        // Le cancellazioni restano seriali per limitare le operazioni D1 concorrenti del cron.
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        await redactShop(db, shopDomain, `retention-${crypto.randomUUID()}`, "RETENTION_EXPIRED")
      ) {
        redacted += 1;
      }
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, "Retention store incompleta");
  return redacted;
}

async function deleteExpiredPerformanceSamples(db: D1Database, cutoff: string) {
  let deleted = 0;
  for (;;) {
    const result =
      // I batch sono seriali: ogni iterazione deve osservare quanto resta dopo la precedente.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await db
        .prepare(
          `DELETE FROM performance_samples WHERE id IN (
             SELECT id FROM performance_samples WHERE observed_at <= ?
             ORDER BY observed_at LIMIT 1000
           )`,
        )
        .bind(cutoff)
        .run();
    deleted += result.meta.changes;
    if (result.meta.changes < 1000) return deleted;
  }
}

export async function applyRetention(db: D1Database, now = new Date()) {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000).toISOString();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1_000).toISOString();
  const [deleted, performanceSamples, shops] = await Promise.all([
    db.batch([
      db
        .prepare(
          `DELETE FROM webhook_events WHERE webhook_id IN (
             SELECT webhook_id FROM webhook_events WHERE received_at <= ?
             ORDER BY received_at LIMIT 1000
           )`,
        )
        .bind(ninetyDaysAgo),
      db
        .prepare(
          `DELETE FROM app_events WHERE id IN (
             SELECT id FROM app_events WHERE event_class = 'error' AND occurred_at <= ?
             ORDER BY occurred_at LIMIT 1000
           )`,
        )
        .bind(ninetyDaysAgo),
      db
        .prepare(
          `DELETE FROM app_events WHERE id IN (
             SELECT id FROM app_events
              WHERE event_class IN ('lifecycle', 'billing', 'validation', 'onboarding', 'support')
                AND occurred_at <= ?
             ORDER BY occurred_at LIMIT 1000
           )`,
        )
        .bind(oneYearAgo),
      db
        .prepare(
          `DELETE FROM billing_events WHERE id IN (
             SELECT id FROM billing_events WHERE occurred_at <= ?
             ORDER BY occurred_at LIMIT 1000
           )`,
        )
        .bind(oneYearAgo),
      db
        .prepare(
          `DELETE FROM owner_notifications WHERE id IN (
             SELECT id FROM owner_notifications WHERE created_at <= ?
             ORDER BY created_at LIMIT 1000
           )`,
        )
        .bind(ninetyDaysAgo),
      db
        .prepare(
          `DELETE FROM owner_notification_redactions WHERE shop_hash IN (
             SELECT shop_hash FROM owner_notification_redactions WHERE redacted_at <= ?
             ORDER BY redacted_at LIMIT 1000
           )`,
        )
        .bind(oneYearAgo),
      db
        .prepare(
          `DELETE FROM owner_control_updates WHERE update_id IN (
             SELECT update_id FROM owner_control_updates WHERE updated_at <= ?
             ORDER BY updated_at LIMIT 1000
           )`,
        )
        .bind(sevenDaysAgo),
      db
        .prepare(
          `DELETE FROM configuration_history WHERE id IN (
             SELECT id FROM configuration_history WHERE created_at <= ?
             ORDER BY created_at LIMIT 1000
           )`,
        )
        .bind(ninetyDaysAgo),
    ]),
    deleteExpiredPerformanceSamples(db, ninetyDaysAgo),
    redactExpiredShops(db, now),
  ]);
  return {
    events: deleted.reduce((total, result) => total + result.meta.changes, performanceSamples),
    shops,
  };
}
