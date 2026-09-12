import { readConfig } from "./config";
import {
  configurationSnapshot,
  type ConfigurationHistoryEntry,
  type ConfigurationSnapshot,
} from "./configuration-history";

export { configurationSnapshot } from "./configuration-history";

async function snapshotHash(snapshot: ConfigurationSnapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function recordConfigurationHistory(
  db: D1Database,
  shopDomain: string,
  snapshots: readonly ConfigurationSnapshot[],
) {
  const createdAt = new Date().toISOString();
  const unique = new Map<string, ConfigurationSnapshot>();
  const hashed = await Promise.all(
    snapshots.map(async (snapshot) => [await snapshotHash(snapshot), snapshot] as const),
  );
  for (const [hash, snapshot] of hashed) unique.set(hash, snapshot);

  await db.batch([
    ...[...unique].map(([hash, snapshot]) =>
      db
        .prepare(
          `INSERT INTO configuration_history (
             shop_id, snapshot_hash, rules_json, messages_json, created_at
           )
           SELECT id, ?, ?, ?, ? FROM shops WHERE shop_domain = ?
           ON CONFLICT(shop_id, snapshot_hash) DO NOTHING`,
        )
        .bind(
          hash,
          JSON.stringify(snapshot.rules),
          JSON.stringify(snapshot.messages),
          createdAt,
          shopDomain,
        ),
    ),
    db
      .prepare(
        `DELETE FROM configuration_history
          WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
            AND (
              datetime(created_at) <= datetime(?, '-90 days')
              OR id NOT IN (
                SELECT id FROM configuration_history
                 WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
                 ORDER BY datetime(created_at) DESC, id DESC
                 LIMIT 10
              )
            )`,
      )
      .bind(shopDomain, createdAt, shopDomain),
  ]);
}

export async function readConfigurationHistory(
  db: D1Database,
  shopDomain: string,
): Promise<ConfigurationHistoryEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT history.id, history.rules_json, history.messages_json, history.created_at
         FROM configuration_history history
         JOIN shops ON shops.id = history.shop_id
        WHERE shops.shop_domain = ?
        ORDER BY datetime(history.created_at) DESC, history.id DESC
        LIMIT 10`,
    )
    .bind(shopDomain)
    .all<{
      id: number;
      rules_json: string;
      messages_json: string;
      created_at: string;
    }>();

  return results.flatMap((row) => {
    try {
      const config = readConfig({
        schemaVersion: 3,
        rules: JSON.parse(row.rules_json),
        messages: JSON.parse(row.messages_json),
      });
      return [
        {
          id: row.id,
          createdAt: row.created_at,
          ...configurationSnapshot(config),
        },
      ];
    } catch {
      return [];
    }
  });
}

export async function readConfigurationHistoryEntry(
  db: D1Database,
  shopDomain: string,
  id: number,
) {
  return (await readConfigurationHistory(db, shopDomain)).find((entry) => entry.id === id) ?? null;
}
