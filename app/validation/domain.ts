import { DEFAULT_CONFIG } from "../config";
import type { Entitlement } from "../config";
import type { Validation } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function entitlementDiffers(config: unknown, entitlement: Entitlement) {
  const current = isRecord(config) ? config.entitlement : undefined;
  return (
    !isRecord(current) ||
    current.kind !== entitlement.kind ||
    (current.validThrough ?? null) !== entitlement.validThrough
  );
}

export function configWithEntitlement(config: unknown, entitlement: Entitlement) {
  const base =
    isRecord(config) && config.schemaVersion === 2 && isRecord(config.rules)
      ? config
      : DEFAULT_CONFIG;
  return { ...base, entitlement };
}

export async function observedConfigHash(validation: Validation | undefined) {
  const config = validation?.metafield?.jsonValue;
  return config === undefined || config === null ? null : await configHash(config);
}

export async function configHash(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
