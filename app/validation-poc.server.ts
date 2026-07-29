export const FUNCTION_HANDLE = "cf-ready-validation";
export const isPocStore = (shop: string) => shop === "cf-ready-dev.myshopify.com";
export const POC_CONFIG = {
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
  query PocContext($after: String) {
    shop {
      name
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

type Validation = {
  id: string;
  title: string;
  enabled: boolean;
  blockOnFailure: boolean;
  shopifyFunction: { handle: string };
  metafield: { jsonValue: unknown } | null;
};

type Context = {
  shop: { name: string; shopAddress: { countryCodeV2: string } };
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

export async function queryContext(admin: {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}) {
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

export function findPocValidation(validations: Validation[]) {
  const matches = validations.filter(
    ({ shopifyFunction }) => shopifyFunction.handle === FUNCTION_HANDLE,
  );
  if (matches.length > 1) {
    throw new Response("Sono presenti più Validation CF Ready PoC.", {
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
