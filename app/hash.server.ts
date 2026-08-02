import { TRIAL_LEDGER_HMAC_KEY } from "./env.server";

export async function trialLedgerHash(value: string) {
  const bytes = Uint8Array.from(atob(TRIAL_LEDGER_HMAC_KEY), (character) =>
    character.charCodeAt(0),
  );
  if (bytes.byteLength !== 32) throw new Error("TRIAL_LEDGER_HMAC_KEY non valida");

  const key = await crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
