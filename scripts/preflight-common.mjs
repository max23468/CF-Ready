import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// `cf d1 migrations list` stampa in JSON le sole migrazioni non ancora applicate.
export function verifyNoPendingMigrations(output) {
  let pending;
  try {
    pending = JSON.parse(output);
  } catch {
    throw new Error("Il readback D1 non ha restituito JSON valido.");
  }
  if (!Array.isArray(pending) || pending.length) {
    throw new Error("Il readback D1 segnala migrazioni ancora pendenti.");
  }
}

// Valuta `cloudflare.config.ts` nella mode richiesta, come fanno build e deploy.
export async function loadWorkerConfig(mode, root = process.cwd()) {
  const module = await import(pathToFileURL(path.join(root, "cloudflare.config.ts")).href);
  const config =
    typeof module.default === "function" ? await module.default({ mode }) : module.default;
  return config.worker;
}

// Riduce la configurazione Worker di `cf`, sorgente o Build Output, ai target che i preflight
// confrontano: hanno la stessa forma camelCase con binding tipizzati.
export function workerTargets(worker = {}) {
  const env = worker.env ?? {};
  const triggers = worker.triggers ?? [];
  return {
    name: worker.name,
    vars: Object.fromEntries(
      Object.entries(env)
        .filter(([, binding]) => binding?.type === "text")
        .map(([name, binding]) => [name, binding.value]),
    ),
    database: env.DB?.type === "d1" ? env.DB : undefined,
    queue: env.WEBHOOK_QUEUE?.type === "queue" ? env.WEBHOOK_QUEUE.name : undefined,
    versionMetadata: env.CF_VERSION_METADATA?.type === "version-metadata",
    sendsEmail: Object.values(env).some((binding) => /email/i.test(binding?.type ?? "")),
    consumers: Object.fromEntries(
      triggers.filter(({ type }) => type === "queue").map((trigger) => [trigger.name, trigger]),
    ),
    crons: triggers.filter(({ type }) => type === "scheduled").map(({ schedule }) => schedule),
    workersDev: worker.workersDev,
    domains: worker.domains ?? [],
  };
}

// Database, coda webhook con DLQ reciproca e metadati versione, comuni ai due ambienti.
export function sharesWorkerTopology(targets, expected) {
  const consumer = targets.consumers[expected.queueName];
  const failureConsumer = targets.consumers[expected.failureQueueName];
  return (
    targets.name === expected.workerName &&
    targets.vars.SHOPIFY_API_KEY === expected.clientId &&
    targets.vars.SHOPIFY_APP_URL === expected.appUrl &&
    targets.vars.SCOPES === "write_validations" &&
    targets.versionMetadata &&
    targets.database?.name === expected.databaseName &&
    targets.database?.id === expected.databaseId &&
    targets.queue === expected.queueName &&
    consumer?.maxBatchSize === 1 &&
    consumer?.maxRetries === 5 &&
    consumer?.deadLetterQueue === expected.failureQueueName &&
    failureConsumer?.maxBatchSize === 1 &&
    failureConsumer?.maxRetries === 100 &&
    failureConsumer?.deadLetterQueue === expected.queueName
  );
}

// Le code webhook vivono nella jurisdiction `eu` (D-184), fissata da Cloudflare solo alla
// creazione: una coda omonima creata altrove non si corregge e va ricreata. Production
// tollera le code assenti, perché il workflow le crea subito dopo con `--jurisdiction eu`.
export function verifyQueueJurisdiction(listing, names, { allowMissing = false } = {}) {
  for (const name of names) {
    const queue = listing.find(({ queue_name }) => queue_name === name);
    if (!queue && allowMissing) continue;
    if (!queue) throw new Error(`La coda ${name} non esiste: creala con --jurisdiction eu.`);
    if (queue.jurisdiction !== "eu") {
      throw new Error(`La coda ${name} non è nella jurisdiction eu.`);
    }
  }
}

// `cf workers deployments list` mette per primo il deployment che serve il traffico; ha la
// stessa forma che `wrangler deployments status --json` restituiva da solo.
export function activeDeployment(listing) {
  return listing?.deployments?.[0] ?? {};
}

export function verifyMigrationSafety(migrations, policy = { migrations: [] }) {
  const unsafe = migrations.find(({ name, sql }) => {
    if (name <= "0010_privacy_hardening.sql" || !destructiveMigration(sql)) return false;
    const registered = policy.migrations.find((entry) => entry.name === name);
    return !(
      registered?.deployStrategy === "atomic-compatible-table-rebuild" &&
      registered.sha256 === createHash("sha256").update(sql).digest("hex") &&
      isCompatibleTableRebuild(sql)
    );
  });
  if (unsafe) {
    throw new Error(`La migrazione ${unsafe.name} richiede un deploy in due fasi.`);
  }
}

function destructiveMigration(sql) {
  const migrationStatements = sql.replace(
    /^\s*CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b[\s\S]*?^\s*END\s*;\s*$/gim,
    "",
  );
  return /\bDROP\s+(?:TABLE|COLUMN)\b|\bALTER\s+TABLE\b[\s\S]*\bRENAME\b|\bDELETE\s+FROM\b/i.test(
    migrationStatements,
  );
}

function isCompatibleTableRebuild(sql) {
  if (/\bDROP\s+COLUMN\b|\bDELETE\s+FROM\b/i.test(sql)) return false;
  const rename = sql.match(
    /\bALTER\s+TABLE\s+([a-z_][a-z0-9_]*)\s+RENAME\s+TO\s+([a-z_][a-z0-9_]*)\s*;/i,
  );
  if (!rename) return false;
  const [, table, previousTable] = rename;
  const escapedTable = escapeRegex(table);
  const escapedPrevious = escapeRegex(previousTable);
  const dropTables = [...sql.matchAll(/\bDROP\s+TABLE\s+([a-z_][a-z0-9_]*)\s*;/gi)];
  return (
    dropTables.length === 1 &&
    dropTables[0][1].toLowerCase() === previousTable.toLowerCase() &&
    new RegExp(`\\bCREATE\\s+TABLE\\s+${escapedTable}\\s*\\(`, "i").test(sql) &&
    new RegExp(
      `\\bINSERT\\s+INTO\\s+${escapedTable}\\s+SELECT\\s+\\*\\s+FROM\\s+${escapedPrevious}\\s*;`,
      "i",
    ).test(sql)
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Shopify risolve un URI relativo sull'`application_url`, che è `/app` (D-166): i webhook
// finirebbero su `/app/webhooks/*`, dove il Worker risponde 404. Solo URI assoluti sull'origine.
export function verifyWebhookUris(shopifyConfig, appUrl) {
  const uris = [...shopifyConfig.matchAll(/^\s*uri\s*=\s*"([^"]*)"\s*$/gm)].map(([, uri]) => uri);
  const invalid = uris.filter((uri) => !uri.startsWith(`${appUrl}/webhooks/`));
  if (uris.length === 0 || invalid.length > 0) {
    throw new Error(
      `I webhook devono usare URI assoluti su ${appUrl}/webhooks/: ${invalid.join(", ") || "nessuno"}.`,
    );
  }
}

export function verifyWorkerSecrets(
  secrets,
  { ownerNotifications = false, ownerControl = false } = {},
) {
  const names = new Set(secrets.map(({ name }) => name));
  if (
    !["SHOPIFY_API_SECRET", "SESSION_ENCRYPTION_KEY", "TRIAL_LEDGER_HMAC_KEY"].every((name) =>
      names.has(name),
    )
  ) {
    throw new Error("Mancano secret runtime sul Worker.");
  }
  if (
    ownerNotifications &&
    ![
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_CHAT_ID",
      "SHOPIFY_PARTNER_ORGANIZATION_ID",
      "SHOPIFY_PARTNER_APP_ID",
      "SHOPIFY_PARTNER_ACCESS_TOKEN",
    ].every((name) => names.has(name))
  ) {
    throw new Error("Mancano i secret delle notifiche owner sul Worker.");
  }
  if (
    ownerControl &&
    ![
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_CHAT_ID",
      "TELEGRAM_WEBHOOK_SECRET",
      "TELEGRAM_OWNER_USER_ID",
      "SHOPIFY_PARTNER_ORGANIZATION_ID",
      "SHOPIFY_PARTNER_APP_ID",
      "SHOPIFY_PARTNER_ACCESS_TOKEN",
    ].every((name) => names.has(name))
  ) {
    throw new Error("Mancano i secret del Control Center owner sul Worker.");
  }
}

export async function readMigrations() {
  const names = (await readdir("migrations")).filter((name) => name.endsWith(".sql"));
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(`migrations/${name}`, "utf8"),
    })),
  );
}

export async function readMigrationPolicy() {
  return JSON.parse(await readFile("config/migration-policy.json", "utf8"));
}

// Il preflight esegue solo letture provider: un errore transitorio di rete o API
// si ritenta prima di far fallire il deploy.
export function run(command, args, inherit = true, { attempts = 3, delayMs = 2_000 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      stdio: inherit ? "inherit" : "pipe",
    });
    if (result.status === 0) return result.stdout;
    if (attempt >= attempts) {
      throw new Error(`Preflight fallito: ${command} ${args.slice(0, 2).join(" ")}`);
    }
    console.warn(`Lettura ${command} ${args.slice(0, 2).join(" ")} fallita, nuovo tentativo.`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs * attempt);
  }
}
