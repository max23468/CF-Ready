export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasGrantedScopes(
  required: readonly string[],
  granted: readonly string[] | undefined,
) {
  const grantedScopes = new Set(granted);
  return required.every((scope) => grantedScopes.has(scope));
}

// Una lettura fallita vale come permessi facoltativi non concessi: la pagina li richiede invece
// di fallire.
export function queryScopesOrNull<T>(scopes: { query: () => Promise<T> }) {
  return scopes.query().catch(() => null);
}

export function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

// Il messaggio di un errore imprevisto può contenere dati non sanitizzati.
export function stableErrorCode(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z0-9_]+$/.test(message) ? message : fallback;
}
