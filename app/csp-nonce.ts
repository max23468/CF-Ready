import { createContext, useContext } from "react";

// Nonce CSP del documento: `entry.server.tsx` lo genera per richiesta e lo fornisce al render.
// Nel browser si rilegge dagli script già marcati, che conservano il valore nella proprietà
// `nonce` anche quando il browser svuota l'attributo: l'idratazione trova lo stesso valore.
export const CspNonceContext = createContext<string | undefined>(undefined);

let documentNonce: string | undefined;

export function useNonce() {
  const nonce = useContext(CspNonceContext);
  if (nonce !== undefined || typeof document === "undefined") return nonce;
  documentNonce ??= [...document.querySelectorAll<HTMLScriptElement>("script[nonce]")].find(
    (script) => script.nonce,
  )?.nonce;
  return documentNonce;
}

export function createCspNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

// In sola osservazione: Shopify imposta già `Content-Security-Policy` con `frame-ancestors`, che
// resta separata. Le violazioni compaiono nella console finché la policy non diventa applicata.
export function cspReportOnly(nonce: string) {
  return [
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'report-sample'`,
    "object-src 'none'",
    "base-uri 'none'",
  ].join("; ");
}
