export async function markUninstalled(db: D1Database, shopDomain: string) {
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE shops SET installation_status = 'uninstalled', uninstalled_at = ?, updated_at = ?
         WHERE shop_domain = ?`,
      )
      .bind(now, now, shopDomain),
    // Shopify rimuove le risorse dell'app disinstallata: uno stato locale "attiva" sarebbe falso.
    db
      .prepare(
        `UPDATE app_state SET validation_gid = NULL, validation_enabled = 0, updated_at = ?
         WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
      )
      .bind(now, shopDomain),
  ]);
}

export async function redactShop(db: D1Database, shopDomain: string) {
  // ponytail: cancellazione totale finché non esistono prova e diritto una tantum (M5) da
  // conservare in forma pseudonimizzata. Le ricevute webhook restano per l'idempotenza dei
  // retry, senza più riferimento allo store.
  await db.batch([
    db.prepare("DELETE FROM shops WHERE shop_domain = ?").bind(shopDomain),
    db
      .prepare("UPDATE webhook_events SET shop_domain = NULL WHERE shop_domain = ?")
      .bind(shopDomain),
  ]);
}
