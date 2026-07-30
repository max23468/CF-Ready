import { entitlementFor, localDate, syncTrial } from "./billing.server";
import type { Entitlement } from "./billing.server";

export const FUNCTION_HANDLE = "cf-ready-validation";
export const VALIDATION_TITLE = "CF Ready";
export const ELIGIBLE_COUNTRY = "IT";
export const METAFIELD_NAMESPACE = "$app:cf-ready-validation";
export const METAFIELD_KEY = "function-configuration";
// ponytail: regole e messaggi fissi finché M6 non consegna l'editor merchant;
// `entitlement` diventa dinamico con il billing M5.
export const DEFAULT_CONFIG = {
  schemaVersion: 2,
  enabled: true,
  errorDisplay: "inline",
  entitlement: { kind: "one_time", validThrough: null },
  rules: {
    taxCode: "required_validated",
    pec: "optional_validated",
  },
  messages: {
    it: {
      taxCodeRequired: "Inserisci il Codice Fiscale per completare l’ordine.",
      taxCodeInvalid: "Il Codice Fiscale inserito non è formalmente valido. Controllalo e riprova.",
      pecRequired: "Inserisci l’indirizzo PEC per completare l’ordine.",
      pecInvalid: "L’indirizzo PEC inserito non ha un formato email valido.",
    },
    en: {
      taxCodeRequired: "Enter your Italian tax code to complete the order.",
      taxCodeInvalid: "The Italian tax code entered is not formally valid. Check it and try again.",
      pecRequired: "Enter your certified email address (PEC) to complete the order.",
      pecInvalid: "The certified email address (PEC) does not have a valid email format.",
    },
  },
} as const;
const VALIDATION_LOCK_TTL_MS = 60_000;
const VALIDATION_LOCK_RENEWAL_MS = 20_000;

const CONTEXT_QUERY = `#graphql
  query CfReadyContext($after: String) {
    shop {
      name
      ianaTimezone
      shopAddress {
        countryCodeV2
      }
    }
    validations(first: 100, after: $after) {
      nodes {
        id
        title
        enabled
        blockOnFailure
        shopifyFunction {
          handle
        }
        metafield(
          namespace: "$app:cf-ready-validation"
          key: "function-configuration"
        ) {
          jsonValue
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type Config = { schemaVersion?: number; rules?: unknown; messages?: unknown };

export type Validation = {
  id: string;
  title: string;
  enabled: boolean;
  blockOnFailure: boolean;
  shopifyFunction: { handle: string };
  metafield: { jsonValue: unknown } | null;
};

type Context = {
  shop: { name: string; ianaTimezone: string; shopAddress: { countryCodeV2: string } };
  validations: {
    nodes: Validation[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type MutationResult = {
  data?: {
    validationCreate?: { userErrors: { message: string }[] };
    validationUpdate?: { userErrors: { message: string }[] };
  };
  errors?: { message: string }[];
};

export type Admin = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export const CREATE_VALIDATION = `#graphql
  mutation CfReadyValidationCreate($validation: ValidationCreateInput!) {
    validationCreate(validation: $validation) {
      validation {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const UPDATE_VALIDATION = `#graphql
  mutation CfReadyValidationUpdate($id: ID!, $validation: ValidationUpdateInput!) {
    validationUpdate(id: $id, validation: $validation) {
      validation {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function queryContext(admin: Admin) {
  const nodes: Validation[] = [];
  const cursors = new Set<string>();
  let after: string | null = null;
  let shop: Context["shop"] | undefined;

  do {
    const response = await admin.graphql(CONTEXT_QUERY, { variables: { after } });
    const body = (await response.json()) as { data?: Context; errors?: { message: string }[] };
    if (!body.data || body.errors?.length) {
      throw new Response("Query Shopify non riuscita", { status: 502 });
    }
    shop = body.data.shop;
    nodes.push(...body.data.validations.nodes);
    const { hasNextPage, endCursor } = body.data.validations.pageInfo;
    if (hasNextPage && (!endCursor || cursors.has(endCursor))) {
      throw new Response("Paginazione Shopify non valida", { status: 502 });
    }
    if (endCursor) cursors.add(endCursor);
    after = hasNextPage ? endCursor : null;
  } while (after);

  return { shop: shop!, validations: { nodes } };
}

export function findValidation(validations: Validation[]) {
  const matches = validations.filter(
    ({ shopifyFunction }) => shopifyFunction.handle === FUNCTION_HANDLE,
  );
  if (matches.length > 1) {
    throw new Response("Sono presenti più Validation CF Ready.", {
      status: 409,
    });
  }
  return matches[0];
}

export function mutationError(
  result: MutationResult,
  operation: "validationCreate" | "validationUpdate",
) {
  if (result.errors?.length || !result.data?.[operation]) {
    return "Operazione Shopify non riuscita.";
  }
  const userErrors = result.data[operation].userErrors;
  return userErrors.length ? userErrors.map(({ message }) => message).join(" ") : null;
}

export async function reconcile(admin: Admin, db: D1Database, shopDomain: string) {
  const { shop, validations } = await queryContext(admin);
  const countryCode = shop.shopAddress.countryCodeV2;
  const eligible = countryCode === ELIGIBLE_COUNTRY;
  const today = localDate(shop.ianaTimezone);
  let validation = findValidation(validations.nodes);
  let errorCode: string | null = null;

  if (!eligible && validation?.enabled) {
    errorCode = await disableForCountry(admin, db, shopDomain, validation.id);
    validation = findValidation((await queryContext(admin)).validations.nodes);
    if (validation?.enabled) errorCode ??= "validation_still_enabled";
  }

  const trial = await syncTrial(db, shopDomain, { eligible, today });
  const entitlement = entitlementFor(trial, today);

  // Il diritto commerciale vive nel metafield: la Function lo confronta con la data locale e
  // si spegne da sola alla scadenza, senza job periodici.
  if (validation && entitlementDiffers(validation.metafield?.jsonValue, entitlement)) {
    const writeError = await writeEntitlement(admin, db, shopDomain, validation, entitlement);
    validation = findValidation((await queryContext(admin)).validations.nodes);
    if (writeError) errorCode ??= writeError;
    else if (entitlementDiffers(validation?.metafield?.jsonValue, entitlement)) {
      errorCode ??= "entitlement_readback_failed";
    }
  }

  await persistValidationState(db, shopDomain, { countryCode, eligible, validation, errorCode });

  return { shopName: shop.name, countryCode, eligible, validation, trial, entitlement, errorCode };
}

export function entitlementDiffers(config: unknown, entitlement: Entitlement) {
  const current = isRecord(config) ? config.entitlement : undefined;
  return (
    !isRecord(current) ||
    current.kind !== entitlement.kind ||
    (current.validThrough ?? null) !== entitlement.validThrough
  );
}

// La configurazione si scrive intera, mai a patch: rules e messaggi del merchant restano
// quelli osservati, si sostituisce soltanto il diritto commerciale.
export function configWithEntitlement(config: unknown, entitlement: Entitlement) {
  const base =
    isRecord(config) && config.schemaVersion === 2 && isRecord(config.rules)
      ? config
      : DEFAULT_CONFIG;
  return { ...base, entitlement };
}

async function writeEntitlement(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  validation: Validation,
  entitlement: Entitlement,
) {
  const lockToken = await acquireValidationLock(db, shopDomain);
  if (!lockToken) return "validation_locked";

  try {
    const response = await admin.graphql(UPDATE_VALIDATION, {
      variables: {
        id: validation.id,
        validation: {
          enable: validation.enabled,
          blockOnFailure: false,
          metafields: [
            {
              namespace: METAFIELD_NAMESPACE,
              key: METAFIELD_KEY,
              type: "json",
              value: JSON.stringify(
                configWithEntitlement(validation.metafield?.jsonValue, entitlement),
              ),
            },
          ],
        },
      },
    });
    const result = (await response.json()) as MutationResult;
    return mutationError(result, "validationUpdate") ? "entitlement_write_failed" : null;
  } catch {
    return "entitlement_write_failed";
  } finally {
    await releaseValidationLockBestEffort(db, shopDomain, lockToken);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Fail-open: uno store non idoneo perde la Validation, non le vendite. Nessun errore propagato.
async function disableForCountry(admin: Admin, db: D1Database, shopDomain: string, id: string) {
  const lockToken = await acquireValidationLock(db, shopDomain);
  if (!lockToken) return "validation_locked";

  try {
    const response = await admin.graphql(UPDATE_VALIDATION, {
      variables: { id, validation: { enable: false, blockOnFailure: false } },
    });
    const result = (await response.json()) as MutationResult;
    return mutationError(result, "validationUpdate") ? "validation_disable_failed" : null;
  } catch {
    return "validation_disable_failed";
  } finally {
    await releaseValidationLockBestEffort(db, shopDomain, lockToken);
  }
}

export async function persistValidationState(
  db: D1Database,
  shopDomain: string,
  state: {
    countryCode: string;
    eligible: boolean;
    validation: Validation | undefined;
    errorCode: string | null;
  },
) {
  const now = new Date().toISOString();
  const config = state.validation?.metafield?.jsonValue;
  const schemaVersion =
    config && typeof config === "object" && typeof (config as Config).schemaVersion === "number"
      ? (config as Config).schemaVersion
      : null;

  await db.batch([
    db
      .prepare(
        `UPDATE shops SET
           country_code = ?,
           installation_status = CASE
             WHEN ? = 0 AND installation_status = 'active' THEN 'blocked_country'
             WHEN ? = 1 AND installation_status = 'blocked_country' THEN 'active'
             ELSE installation_status
           END,
           updated_at = ?
         WHERE shop_domain = ?`,
      )
      .bind(state.countryCode, Number(state.eligible), Number(state.eligible), now, shopDomain),
    db
      .prepare(
        `INSERT INTO app_state (
           shop_id, validation_gid, validation_enabled, config_schema_version,
           config_hash, last_sync_at, last_error_code, updated_at
         ) VALUES ((SELECT id FROM shops WHERE shop_domain = ?), ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(shop_id) DO UPDATE SET
           validation_gid = excluded.validation_gid,
           validation_enabled = excluded.validation_enabled,
           config_schema_version = excluded.config_schema_version,
           config_hash = excluded.config_hash,
           last_sync_at = excluded.last_sync_at,
           last_error_code = excluded.last_error_code,
           updated_at = excluded.updated_at`,
      )
      .bind(
        shopDomain,
        state.validation?.id ?? null,
        Number(state.validation?.enabled ?? false),
        schemaVersion,
        config === undefined || config === null ? null : await configHash(config),
        now,
        state.errorCode,
        now,
      ),
  ]);
}

// Hash canonico: una riscrittura dei campi da parte di Shopify non deve sembrare un conflitto.
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

export async function acquireValidationLock(
  db: D1Database,
  shopDomain: string,
  now = Date.now(),
  ownerToken: string = crypto.randomUUID(),
) {
  const lock = await db
    .prepare(
      `INSERT INTO validation_operation_locks (shop_domain, owner_token, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT (shop_domain) DO UPDATE SET
         owner_token = excluded.owner_token,
         expires_at = excluded.expires_at
       WHERE validation_operation_locks.expires_at <= ?
       RETURNING owner_token`,
    )
    .bind(shopDomain, ownerToken, now + VALIDATION_LOCK_TTL_MS, now)
    .first<{ owner_token: string }>();
  return lock?.owner_token === ownerToken ? ownerToken : null;
}

export async function renewValidationLock(
  db: D1Database,
  shopDomain: string,
  ownerToken: string,
  now = Date.now(),
) {
  const lock = await db
    .prepare(
      `UPDATE validation_operation_locks
       SET expires_at = ?
       WHERE shop_domain = ? AND owner_token = ? AND expires_at > ?
       RETURNING owner_token`,
    )
    .bind(now + VALIDATION_LOCK_TTL_MS, shopDomain, ownerToken, now)
    .first<{ owner_token: string }>();
  return lock?.owner_token === ownerToken;
}

export function startValidationLockHeartbeat(
  db: D1Database,
  shopDomain: string,
  ownerToken: string,
) {
  let stopped = false;
  let renewal = Promise.resolve(true);
  const timer = setInterval(() => {
    renewal = renewal
      .catch(() => false)
      .then(() => (stopped ? true : renewValidationLock(db, shopDomain, ownerToken)));
    void renewal.catch(() => undefined);
  }, VALIDATION_LOCK_RENEWAL_MS);

  return {
    async isHeld() {
      return renewal.catch(() => false);
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await renewal.catch(() => undefined);
    },
  };
}

export async function releaseValidationLockBestEffort(
  db: D1Database,
  shopDomain: string,
  ownerToken: string,
) {
  try {
    await db
      .prepare(
        `DELETE FROM validation_operation_locks
         WHERE shop_domain = ? AND owner_token = ?`,
      )
      .bind(shopDomain, ownerToken)
      .run();
  } catch {
    // La lease scade comunque; Shopify resta autorevole sull'esito.
  }
}
