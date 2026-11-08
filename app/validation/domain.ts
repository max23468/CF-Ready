import { readConfig } from "../config";
import type { Entitlement } from "../config";
import { isRecord, sha256Hex } from "../primitives";
import { METAFIELD_KEY, METAFIELD_NAMESPACE, type Validation } from "./types";

export function validationInput(enable: boolean, config?: unknown) {
  return {
    enable,
    blockOnFailure: false,
    ...(config === undefined
      ? {}
      : {
          metafields: [
            {
              namespace: METAFIELD_NAMESPACE,
              key: METAFIELD_KEY,
              type: "json",
              value: JSON.stringify(config),
            },
          ],
        }),
  };
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
  return { ...readConfig(config), entitlement };
}

export async function observedConfigHash(validation: Validation | undefined) {
  const config = validation?.metafield?.jsonValue;
  return config === undefined || config === null ? null : await configHash(config);
}

export function configHash(value: unknown) {
  return sha256Hex(canonicalJson(value));
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
