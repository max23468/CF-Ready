import { recordTrialLedger } from "./billing/repository.server";
import { CHECKOUT_LABELS_STATE_RESET_SQL } from "./checkout-labels/domain";
import { trialLedgerHash } from "./hash.server";
import { logEvent, recordEvent } from "./events.server";
import {
  FIRST_UNINSTALL_SQL,
  uninstallCounterStatement,
  uninstallHistoryStatement,
} from "./owner-control/uninstall-history.server";

// Ogni salvataggio sessione conferma l'installazione: una reinstallazione riparte da qui.
export function activateShopStatement(db: D1Database, shopDomain: string, now: string) {
  return db
    .prepare(
      `INSERT INTO shops (
         shop_domain, installation_status, installed_at, created_at, updated_at
       ) VALUES (?, 'active', ?, ?, ?)
       ON CONFLICT(shop_domain) DO UPDATE SET
         installed_at = CASE
           WHEN shops.installation_status = 'uninstalled' THEN excluded.installed_at
           ELSE shops.installed_at
         END,
         installation_status = CASE
           WHEN shops.installation_status = 'uninstalled' THEN 'active'
           ELSE shops.installation_status
         END,
         uninstalled_at = NULL,
         updated_at = excluded.updated_at`,
    )
    .bind(shopDomain, now, now, now);
}

export function deleteShopSessionsStatement(db: D1Database, shopDomain: string) {
  return db
    .prepare(
      `DELETE FROM shopify_sessions
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(shopDomain);
}

export async function refuseInstall(db: D1Database, shopDomain: string) {
  await db.batch([
    deleteShopSessionsStatement(db, shopDomain),
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
// disinstallazione successiva. `install_recorded_at` conserva il fatto oltre la retention degli
// eventi: senza, dopo 12 mesi un rinnovo del token registrerebbe una nuova installazione.
const INSTALL_NOT_RECORDED_SQL = `(s.install_recorded_at IS NULL OR s.install_recorded_at < s.installed_at)`;

export async function recordInstallOnce(db: D1Database, shopDomain: string) {
  const occurredAt = new Date().toISOString();
  const [inserted] = await db.batch([
    db
      .prepare(
        `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
         SELECT s.id, 'app_installed', 'lifecycle', ?
         FROM shops s
         WHERE s.shop_domain = ?
           AND ${INSTALL_NOT_RECORDED_SQL}
           AND NOT EXISTS (
             SELECT 1 FROM app_events installed
             WHERE installed.shop_id = s.id
               AND installed.event_name = 'app_installed'
               AND installed.occurred_at > COALESCE((
                 SELECT MAX(uninstalled.occurred_at) FROM app_events uninstalled
                 WHERE uninstalled.shop_id = s.id AND uninstalled.event_name = 'app_uninstalled'
               ), '')
           )`,
      )
      .bind(occurredAt, shopDomain),
    db
      .prepare(
        `UPDATE shops AS s SET install_recorded_at = ?
          WHERE s.shop_domain = ? AND ${INSTALL_NOT_RECORDED_SQL}`,
      )
      .bind(occurredAt, shopDomain),
  ]);

  const recorded = inserted.meta.changes > 0;
  if (recorded) {
    logEvent({ name: "app_installed", class: "lifecycle" }, occurredAt);
  }
  return recorded;
}

export async function markUninstalled(
  db: D1Database,
  shopDomain: string,
  installationStartedAt: string,
  webhookId: string,
) {
  const now = new Date().toISOString();
  const firstUninstallEvent = db
    .prepare(
      `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
       SELECT s.id, 'app_uninstalled', 'lifecycle', ? FROM shops s
       WHERE s.shop_domain = ? AND s.installed_at = ? AND ${FIRST_UNINSTALL_SQL}`,
    )
    .bind(now, shopDomain, installationStartedAt);
  const statements = [
    // Primo del batch: legge Validation e onboarding prima che la disinstallazione li azzeri.
    // Lo storico è anonimo e sopravvive a `shop/redact` (D-189).
    uninstallHistoryStatement(db, shopDomain, installationStartedAt, now),
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
           ${CHECKOUT_LABELS_STATE_RESET_SQL},
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
    // Il batch è una transazione: il contatore aggregato sale una sola volta per installazione
    // anche con webhook ritentati.
    uninstallCounterStatement(db, shopDomain, installationStartedAt, now),
    firstUninstallEvent,
  ];
  const results = await db.batch(statements);
  const inserted = results[statements.indexOf(firstUninstallEvent)].meta.changes === 1;
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
    const [receipt] = await db.batch([
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
    if (receipt.meta.changes === 1) logShopRedacted(webhookId, topic, now);
    return true;
  }

  if (shop.installation_status !== "uninstalled") return false;

  // Il ledger conserva soltanto la prova fruita; Shopify resta autorevole per
  // l'acquisto una tantum. Va scritto prima perché la cancellazione rimuove lo store.
  await recordTrialLedger(db, shopDomain);

  const now = new Date().toISOString();
  const shopHash = await trialLedgerHash(shopDomain);
  const [receipt] = await db.batch([
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

  if (receipt.meta.changes === 1) logShopRedacted(webhookId, topic, now);

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

// La retention usa una ricevuta sintetica, che non identifica una consegna Shopify.
function logShopRedacted(webhookId: string, topic: string, now: string) {
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

export async function redactExpiredShops(db: D1Database, now: Date, retentionDays: number) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1_000).toISOString();
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
