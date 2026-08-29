import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";

export function verifyNoPendingMigrations(output) {
  if (!output.includes("No migrations to apply!")) {
    throw new Error("Il readback D1 segnala migrazioni ancora pendenti.");
  }
}

export function verifyMigrationSafety(migrations) {
  const unsafe = migrations.find(
    ({ name, sql }) =>
      name > "0010_privacy_hardening.sql" &&
      /\bDROP\s+(?:TABLE|COLUMN)\b|\bALTER\s+TABLE\b[\s\S]*\bRENAME\b|\bDELETE\s+FROM\b/i.test(sql),
  );
  if (unsafe) {
    throw new Error(`La migrazione ${unsafe.name} richiede un deploy in due fasi.`);
  }
}

export function verifyWorkerSecrets(secrets, { ownerNotifications = false } = {}) {
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

export function run(command, args, inherit = true) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
  });
  if (result.status !== 0) {
    throw new Error(`Preflight fallito: ${command} ${args.slice(0, 2).join(" ")}`);
  }
  return result.stdout;
}
