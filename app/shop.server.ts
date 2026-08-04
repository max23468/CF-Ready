import { recordTrialLedger } from "./billing.server";
import { logEvent, recordEvent } from "./events.server";

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

export async function markUninstalled(
  db: D1Database,
  shopDomain: string,
  installationStartedAt: string,
  webhookId: string,
) {
  const now = new Date().toISOString();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE shops SET installation_status = 'uninstalled', uninstalled_at = ?, updated_at = ?
         WHERE shop_domain = ? AND installed_at = ?`,
      )
      .bind(now, now, shopDomain, installationStartedAt),
    // Shopify rimuove le risorse dell'app disinstallata: uno stato locale "attiva" sarebbe falso.
    db
      .prepare(
        `UPDATE app_state SET validation_gid = NULL, validation_enabled = 0, updated_at = ?
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
    db
      .prepare(
        `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
         SELECT id, 'app_uninstalled', 'lifecycle', ? FROM shops
         WHERE shop_domain = ? AND installed_at = ?
           AND NOT EXISTS (
             SELECT 1 FROM app_events
             WHERE shop_id = shops.id AND event_name = 'app_uninstalled'
               AND occurred_at >= shops.installed_at
           )`,
      )
      .bind(now, shopDomain, installationStartedAt),
  ]);
  const inserted = results[3].meta.changes === 1;
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
      `SELECT id FROM app_events
       WHERE webhook_id = ? AND event_name = 'shop_redacted'`,
    )
    .bind(webhookId)
    .first<{ id: number }>();
  if (alreadyRedacted) {
    await db
      .prepare("UPDATE webhook_events SET shop_domain = NULL WHERE webhook_id = ?")
      .bind(webhookId)
      .run();
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

export async function applyRetention(db: D1Database, now = new Date()) {
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000).toISOString();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1_000).toISOString();
  const deleted = await db.batch([
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
           SELECT id FROM app_events WHERE event_class != 'error' AND occurred_at <= ?
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
  ]);
  return {
    events: deleted.reduce((total, result) => total + result.meta.changes, 0),
    shops: await redactExpiredShops(db, now),
  };
}
