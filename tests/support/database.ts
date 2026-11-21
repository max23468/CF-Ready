import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] } & Record<string, unknown>;

// I binding si scelgono per nome: un service binding risponde a qualsiasi proprietà via RPC.
const databases = () =>
  Object.entries(testEnv)
    .filter(([name]) => name === "DB" || name.startsWith("MIGRATION_"))
    .map(([, database]) => database as D1Database);

// Elimina trigger, viste e tabelle in ordine inverso di creazione, compresa `d1_migrations`,
// così le migrazioni successive ripartono da zero con gli stessi dati seminati.
async function dropSchema(database: D1Database) {
  const { results } = await database
    .prepare(
      `SELECT type, name FROM sqlite_master
       WHERE type IN ('table', 'view', 'trigger')
         AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
       ORDER BY CASE type WHEN 'trigger' THEN 0 WHEN 'view' THEN 1 ELSE 2 END, rowid DESC`,
    )
    .all<{ type: "table" | "view" | "trigger"; name: string }>();
  if (results.length === 0) return;
  await database.batch([
    database.prepare("PRAGMA defer_foreign_keys = ON"),
    ...results.map(({ type, name }) =>
      database.prepare(`DROP ${type.toUpperCase()} IF EXISTS "${name.replaceAll('"', '""')}"`),
    ),
  ]);
}

export async function clearDatabases() {
  await Promise.all(databases().map(dropSchema));
}

// Riporta `DB` allo schema appena migrato e svuota i database delle prove di migrazione.
export async function resetDatabase() {
  await clearDatabases();
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
}
