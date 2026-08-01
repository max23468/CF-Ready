import {
  cancelSubscription,
  currentPricingGeneration,
  entitlementFor,
  localDate,
  markTrialConverted,
  proratedCredit,
  readBilling,
  readBillingAccount,
  syncBillingAccount,
  syncTrial,
} from "./billing.server";
import { DEFAULT_CONFIG, ELIGIBLE_COUNTRY, readConfig } from "./config";
import type { CheckoutConfig, Entitlement, ErrorDisplay, Rules } from "./config";
import { BILLING_IS_TEST } from "./env.server";
import { recordEvent } from "./events.server";

export {
  DEFAULT_CONFIG,
  ELIGIBLE_COUNTRY,
  ERROR_DISPLAYS,
  MESSAGE_KEYS,
  MESSAGE_MAX_LENGTH,
  RULE_MODES,
  readConfig,
} from "./config";
export type {
  CheckoutConfig,
  Entitlement,
  ErrorDisplay,
  Messages,
  RuleMode,
  Rules,
} from "./config";

export const FUNCTION_HANDLE = "cf-ready-validation";
export const VALIDATION_TITLE = "CF Ready";
export const METAFIELD_NAMESPACE = "$app:cf-ready-validation";
export const METAFIELD_KEY = "function-configuration";

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
  const matches = validationsForApp(validations);
  if (matches.length > 1) {
    throw new Response("Sono presenti più Validation CF Ready.", {
      status: 409,
    });
  }
  return matches[0];
}

function validationsForApp(validations: Validation[]) {
  return validations.filter(({ shopifyFunction }) => shopifyFunction.handle === FUNCTION_HANDLE);
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
  let matches = validationsForApp(validations.nodes);
  if (matches.length > 1 && matches.some(({ enabled }) => enabled)) {
    try {
      await disableDuplicateValidations(admin, db, shopDomain, matches);
      matches = validationsForApp((await queryContext(admin)).validations.nodes);
    } catch {
      // Il banner operativo resta disponibile usando l'ultima lettura certa.
    }
  }
  let validation = matches.length === 1 ? matches[0] : undefined;
  let errorCode: string | null =
    matches.length > 1
      ? matches.some(({ enabled }) => enabled)
        ? "duplicate_validations_active"
        : "duplicate_validations"
      : null;

  if (!eligible && validation?.enabled) {
    errorCode = await disableForCountry(admin, db, shopDomain, validation.id);
    validation = findValidation((await queryContext(admin)).validations.nodes);
    if (validation?.enabled) errorCode ??= "validation_still_enabled";
  }

  const [trial, storedAccount] = await Promise.all([
    syncTrial(db, shopDomain, { eligible, today }),
    readBillingAccount(db, shopDomain),
  ]);
  let account = storedAccount;
  let creditEstimate: number | null = null;

  if (eligible) {
    try {
      let state = await readBilling(admin, BILLING_IS_TEST);

      // Passaggio a una tantum: l'acquisto è già approvato e attivo, quindi ora si può
      // cancellare l'abbonamento con proratazione. Mai prima: un acquisto abbandonato deve
      // lasciare l'abbonamento intatto.
      if (state.oneTime && state.subscription) {
        const conversion = await withValidationLock(db, shopDomain, async () => {
          const current = await readBilling(admin, BILLING_IS_TEST);
          if (!current.oneTime || !current.subscription) {
            return { state: current, error: null, converted: false };
          }
          const error = await cancelSubscription(admin, current.subscription.id, { prorate: true });
          return {
            state: error ? current : await readBilling(admin, BILLING_IS_TEST),
            error,
            converted: !error,
          };
        });

        if (conversion.acquired) {
          state = conversion.result.state;
          if (conversion.result.error) errorCode ??= conversion.result.error;
          else if (conversion.result.converted) {
            await recordEvent(db, {
              shopDomain,
              name: "subscription_converted",
              class: "billing",
              metadata: { reason: "one_time_purchased" },
            });
          }
        }
      }

      creditEstimate = state.subscription
        ? proratedCredit({
            amount: state.subscription.amount,
            interval: state.subscription.interval,
            periodEnd: state.subscription.currentPeriodEnd,
            today,
          })
        : null;

      account = await syncBillingAccount(db, shopDomain, state, {
        today,
        timeZone: shop.ianaTimezone,
        pricingGeneration: currentPricingGeneration(trial, account, today),
      });

      if (account.entitlement_status === "active") {
        await markTrialConverted(db, shopDomain);
      }
    } catch {
      // Shopify non raggiungibile: si tiene lo stato noto invece di declassare il merchant
      // o di rompere la pagina, e l'ambiguità resta visibile come codice errore.
      account = await readBillingAccount(db, shopDomain);
      errorCode ??= "billing_read_failed";
    }
  }

  const entitlement = entitlementFor(trial, today, account);

  // Il diritto commerciale vive nel metafield: la Function lo confronta con la data locale e
  // si spegne da sola alla scadenza, senza job periodici.
  if (validation && entitlementDiffers(validation.metafield?.jsonValue, entitlement)) {
    const write = await writeEntitlement(admin, db, shopDomain, validation, entitlement);

    if (write.acquired) {
      validation = findValidation((await queryContext(admin)).validations.nodes);
      if (write.result) errorCode ??= write.result;
      else if (entitlementDiffers(validation?.metafield?.jsonValue, entitlement)) {
        errorCode ??= "entitlement_readback_failed";
      }
    }
  }

  const validationEnabled = validation?.enabled ?? matches.some(({ enabled }) => enabled);
  await persistValidationState(db, shopDomain, {
    countryCode,
    eligible,
    validation,
    validationEnabled,
    errorCode,
  });

  return {
    shopName: shop.name,
    countryCode,
    today,
    eligible,
    validation,
    validationEnabled,
    trial,
    account,
    entitlement,
    creditEstimate,
    errorCode,
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

// La configurazione si scrive intera, mai a patch: rules e messaggi del merchant restano
// quelli osservati, si sostituisce soltanto il diritto commerciale.
export function configWithEntitlement(config: unknown, entitlement: Entitlement) {
  const base =
    isRecord(config) && config.schemaVersion === 2 && isRecord(config.rules)
      ? config
      : DEFAULT_CONFIG;
  return { ...base, entitlement };
}

export type ValidationWriteResult =
  | { ok: true; enabled: boolean }
  | { ok: false; errorCode: string };

// Percorso unico di scrittura verso Shopify, condiviso da salvataggio delle regole e
// attivazione: lease per store, configurazione intera, readback, stato persistito. `enable` a
// `null` conserva lo stato corrente della Validation, che è ciò che FR-051 chiede al
// salvataggio; la Validation viene creata disattivata se non esiste ancora.
export async function writeValidation(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  next: { rules: Rules; errorDisplay: ErrorDisplay; messages: CheckoutConfig["messages"] } | null,
  enable: boolean | null,
  expectedHash?: string | null,
  declared?: boolean | null,
): Promise<ValidationWriteResult> {
  const lockToken = await acquireValidationLock(db, shopDomain);
  if (!lockToken) return { ok: false, errorCode: "validation_locked" };
  const heartbeat = startValidationLockHeartbeat(db, shopDomain, lockToken);

  try {
    const data = await queryContext(admin);
    const countryCode = data.shop.shopAddress.countryCodeV2;
    const eligible = countryCode === ELIGIBLE_COUNTRY;
    if (enable && !eligible) return { ok: false, errorCode: "country_not_eligible" };

    const existing = findValidation(data.validations.nodes);

    // §11.4: controllo ottimistico. Chi ha aperto la pagina dichiara la configurazione che
    // stava guardando; se nel frattempo un'altra sessione l'ha cambiata, la modifica non parte.
    // Attivazione e disattivazione non passano di qui: non modificano la configurazione.
    if (expectedHash !== undefined && (await observedConfigHash(existing)) !== expectedHash) {
      return { ok: false, errorCode: "config_conflict" };
    }

    const enabled = enable ?? existing?.enabled ?? false;
    const today = localDate(data.shop.ianaTimezone);
    const trial = await syncTrial(db, shopDomain, { eligible, today });
    let account = await readBillingAccount(db, shopDomain);
    let billing: Awaited<ReturnType<typeof readBilling>> | null = null;
    try {
      billing = await readBilling(admin, BILLING_IS_TEST);
    } catch {
      // Shopify non raggiungibile: come in `reconcile`, si conserva lo stato operativo noto.
    }
    if (billing) {
      account = await syncBillingAccount(db, shopDomain, billing, {
        today,
        timeZone: data.shop.ianaTimezone,
        pricingGeneration: currentPricingGeneration(trial, account, today),
      });
      if (account.entitlement_status === "active") await markTrialConverted(db, shopDomain);
    }
    const entitlement = entitlementFor(trial, today, account);
    if (enable === true && !existing?.enabled && entitlement.kind === "none") {
      return { ok: false, errorCode: "entitlement_required" };
    }
    if (enable === null && !next) return { ok: false, errorCode: "validation_write_failed" };
    const source = enable === null ? next! : readConfig(existing?.metafield?.jsonValue);
    const config: CheckoutConfig = {
      schemaVersion: 2,
      enabled,
      errorDisplay: source.errorDisplay,
      entitlement,
      rules: source.rules,
      messages: source.messages,
    };
    const metafields = [
      {
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEY,
        type: "json",
        value: JSON.stringify(config),
      },
    ];
    const variables = existing
      ? {
          id: existing.id,
          validation: {
            title: VALIDATION_TITLE,
            enable: enabled,
            blockOnFailure: false,
            metafields,
          },
        }
      : {
          validation: {
            title: VALIDATION_TITLE,
            functionHandle: FUNCTION_HANDLE,
            enable: enabled,
            blockOnFailure: false,
            metafields,
          },
        };

    if (!(await heartbeat.isHeld())) return { ok: false, errorCode: "validation_locked" };

    const operation = existing ? "validationUpdate" : "validationCreate";
    const response = await admin.graphql(existing ? UPDATE_VALIDATION : CREATE_VALIDATION, {
      variables,
    });
    const error = mutationError((await response.json()) as MutationResult, operation);

    if (error) {
      const errorCode = validationLimitReached(error)
        ? "validation_limit_reached"
        : "validation_write_failed";
      await persistValidationState(db, shopDomain, {
        countryCode,
        eligible,
        validation: existing,
        errorCode,
      });
      return { ok: false, errorCode };
    }

    const readback = findValidation((await queryContext(admin)).validations.nodes);
    const consistent = Boolean(
      readback &&
      readback.enabled === enabled &&
      readback.blockOnFailure === false &&
      (await observedConfigHash(readback)) === (await configHash(config)),
    );

    await persistValidationState(db, shopDomain, {
      countryCode,
      eligible,
      validation: readback,
      errorCode: consistent ? null : "validation_readback_failed",
    });
    if (!consistent) return { ok: false, errorCode: "validation_readback_failed" };
    if (declared !== undefined && declared !== null) {
      await saveAddress2Declaration(db, shopDomain, declared);
    }

    return { ok: true, enabled };
  } catch {
    return { ok: false, errorCode: "validation_write_failed" };
  } finally {
    await heartbeat.stop();
    await releaseValidationLockBestEffort(db, shopDomain, lockToken);
  }
}

// La stessa forma usata da `persistValidationState`, così il confronto è fra valori omogenei.
export async function observedConfigHash(validation: Validation | undefined) {
  const config = validation?.metafield?.jsonValue;
  return config === undefined || config === null ? null : await configHash(config);
}

// FR-098: lo store ha già 25 Validation Function attive. Shopify lo comunica solo nel testo
// dello userError, quindi il codice stabile si ricava da lì; se il testo cambia si ricade sul
// codice generico, che resta corretto ma meno utile.
// ponytail: match sul messaggio, unico segnale disponibile. Da rivedere se Shopify espone un
// codice tipizzato su ValidationUserError.
function validationLimitReached(message: string) {
  const text = message.toLowerCase();
  return text.includes("maximum") || text.includes("limit");
}

function writeEntitlement(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  validation: Validation,
  entitlement: Entitlement,
) {
  return withValidationLock(db, shopDomain, async () => {
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
  }).catch(() => ({ acquired: true as const, result: "entitlement_write_failed" }));
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

async function disableDuplicateValidations(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  validations: Validation[],
) {
  return withValidationLock(db, shopDomain, async (heartbeat) => {
    for (const { id, enabled } of validations) {
      if (!enabled) continue;
      if (!(await heartbeat.isHeld())) throw new Error("Validation lock persa");
      try {
        const response = await admin.graphql(UPDATE_VALIDATION, {
          variables: { id, validation: { enable: false, blockOnFailure: false } },
        });
        await response.json();
      } catch {
        // Il readback aggrega l'esito; un duplicato guasto non impedisce gli altri tentativi.
      }
    }
  });
}

export async function persistValidationState(
  db: D1Database,
  shopDomain: string,
  state: {
    countryCode: string;
    eligible: boolean;
    validation: Validation | undefined;
    validationEnabled?: boolean;
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
        Number(state.validationEnabled ?? state.validation?.enabled ?? false),
        schemaVersion,
        config === undefined || config === null ? null : await configHash(config),
        now,
        state.errorCode,
        now,
      ),
  ]);
}

// FR-058: dichiarazione del merchant sull'uso del campo “Interno”, non un rilevamento. Finché
// resta registrata, la Home mostra il promemoria di rimuovere quell'uso.
export async function readAddress2Declaration(db: D1Database, shopDomain: string) {
  const row = await db
    .prepare(
      `SELECT address2_conflict_declared_at FROM app_state
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(shopDomain)
    .first<{ address2_conflict_declared_at: string | null }>();
  return row?.address2_conflict_declared_at ?? null;
}

export async function saveAddress2Declaration(
  db: D1Database,
  shopDomain: string,
  declared: boolean,
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE app_state
         SET address2_conflict_declared_at = CASE
               WHEN ? = 0 THEN NULL
               WHEN address2_conflict_declared_at IS NULL THEN ?
               ELSE address2_conflict_declared_at
             END,
             updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(Number(declared), now, now, shopDomain)
    .run();
}

export type OnboardingStatus = "not_started" | "in_progress" | "completed";

export async function readOnboarding(db: D1Database, shopDomain: string) {
  const row = await db
    .prepare(
      `SELECT onboarding_status, onboarding_step, last_error_code, validation_enabled
       FROM app_state WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(shopDomain)
    .first<{
      onboarding_status: OnboardingStatus;
      onboarding_step: number;
      last_error_code: string | null;
      validation_enabled: number;
    }>();

  return {
    status: row?.onboarding_status ?? "not_started",
    // La colonna nasce a zero: `?? 1` non scatta su una riga che esiste già, e un passo zero
    // produce una schermata vuota. Il valore viene quindi riportato dentro l'intervallo.
    step: Math.min(4, Math.max(1, row?.onboarding_step ?? 1)),
    errorCode: row?.last_error_code ?? null,
    validationEnabled: Boolean(row?.validation_enabled),
  };
}

export async function saveOnboarding(
  db: D1Database,
  shopDomain: string,
  { status, step }: { status: OnboardingStatus; step: number },
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      // §15.9: riaprire la procedura non la riapre davvero. Una volta conclusa lo stato non
      // torna indietro, altrimenti la checklist della Home ricomparirebbe (D-063).
      `UPDATE app_state
         SET onboarding_status = CASE
               WHEN onboarding_status = 'completed' THEN 'completed'
               ELSE ?
             END,
             onboarding_step = CASE
               WHEN onboarding_status = 'completed' THEN 1
               ELSE ?
             END,
             setup_checklist_dismissed_at = CASE
               WHEN ? = 'completed' AND setup_checklist_dismissed_at IS NULL THEN ?
               ELSE setup_checklist_dismissed_at
             END,
             updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(status, step, status, now, now, shopDomain)
    .run();
}

// §15.10: la richiesta di recensione parte solo con Validation attiva da almeno sette giorni.
// Il momento dell'attivazione è già nel registro eventi, quindi non serve una colonna nuova.
export async function validationEnabledSince(db: D1Database, shopDomain: string) {
  const row = await db
    .prepare(
      `SELECT occurred_at FROM app_events
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
         AND event_name = 'validation_enabled'
       ORDER BY occurred_at DESC LIMIT 1`,
    )
    .bind(shopDomain)
    .first<{ occurred_at: string }>();
  return row?.occurred_at ?? null;
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

// La lease serializza le operazioni di lifecycle per store. Se è occupata, un'altra
// riconciliazione sta già facendo la stessa cosa: si esce senza fare nulla e senza segnalare
// un errore al merchant, perché non c'è nulla di rotto da segnalare.
export async function withValidationLock<T>(
  db: D1Database,
  shopDomain: string,
  operation: (heartbeat: ReturnType<typeof startValidationLockHeartbeat>) => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; result: T }> {
  const lockToken = await acquireValidationLock(db, shopDomain);
  if (!lockToken) return { acquired: false };
  const heartbeat = startValidationLockHeartbeat(db, shopDomain, lockToken);

  try {
    if (!(await heartbeat.isHeld())) return { acquired: false };
    return { acquired: true, result: await operation(heartbeat) };
  } finally {
    await heartbeat.stop();
    await releaseValidationLockBestEffort(db, shopDomain, lockToken);
  }
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
