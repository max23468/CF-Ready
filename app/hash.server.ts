import { TRIAL_LEDGER_HMAC_KEY } from "./env.server";

function trialLedgerKeyBytes() {
  const bytes = Uint8Array.from(atob(TRIAL_LEDGER_HMAC_KEY), (character) =>
    character.charCodeAt(0),
  );
  if (bytes.byteLength !== 32) throw new Error("TRIAL_LEDGER_HMAC_KEY non valida");
  return bytes;
}

// Le chiavi derivano da un secret fisso per isolate: il ciclo owner calcola un hash per ogni
// evento, e importarle o derivarle ogni volta costava CPU senza cambiare il risultato.
let ledgerKey: Promise<CryptoKey> | undefined;
let reportKey: Promise<CryptoKey> | undefined;

export async function trialLedgerHash(value: string) {
  ledgerKey ??= crypto.subtle.importKey(
    "raw",
    trialLedgerKeyBytes(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const key = await ledgerKey;
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Chiave HMAC separata per i report prestazioni, derivata con HKDF dallo stesso secret: una firma
// esposta al browser non vale mai come hash del ledger, e non serve un secret in più.
export function performanceReportKey() {
  reportKey ??= deriveReportKey();
  return reportKey;
}

async function deriveReportKey() {
  const material = await crypto.subtle.importKey("raw", trialLedgerKeyBytes(), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(),
      info: new TextEncoder().encode("cf-ready/performance-report/v1"),
    },
    material,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"],
  );
}
