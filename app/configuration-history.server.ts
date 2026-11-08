import type { CheckoutConfig } from "./config";
import { sha256Hex } from "./primitives";

type ConfigurationSnapshot = Pick<CheckoutConfig, "rules" | "messages">;

export function configurationSnapshot(config: CheckoutConfig): ConfigurationSnapshot {
  return { rules: config.rules, messages: config.messages };
}

// D-174: resta soltanto l'ultima configurazione confermata, letta dalla Home per il primo
// paint (D-167). Le voci precedenti si cancellano alla scrittura.
export async function recordLatestConfiguration(
  db: D1Database,
  shopDomain: string,
  snapshot: ConfigurationSnapshot,
) {
  const hash = await sha256Hex(JSON.stringify(snapshot));
  await db.batch([
    db
      .prepare(
        `INSERT INTO configuration_history (
           shop_id, snapshot_hash, rules_json, messages_json, created_at
         )
         SELECT id, ?, ?, ?, ? FROM shops WHERE shop_domain = ?
         ON CONFLICT(shop_id, snapshot_hash) DO UPDATE SET created_at = excluded.created_at`,
      )
      .bind(
        hash,
        JSON.stringify(snapshot.rules),
        JSON.stringify(snapshot.messages),
        new Date().toISOString(),
        shopDomain,
      ),
    db
      .prepare(
        `DELETE FROM configuration_history
          WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
            AND snapshot_hash <> ?`,
      )
      .bind(shopDomain, hash),
  ]);
}
