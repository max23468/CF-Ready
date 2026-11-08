const PARTNER_API_VERSION = "2026-07";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

export type PartnerInstallConfig = { organizationId: string; appId: string; accessToken: string };

export function partnerConfigFromEnv(env: {
  SHOPIFY_PARTNER_ORGANIZATION_ID?: string;
  SHOPIFY_PARTNER_APP_ID?: string;
  SHOPIFY_PARTNER_ACCESS_TOKEN?: string;
}): PartnerInstallConfig {
  return {
    organizationId: env.SHOPIFY_PARTNER_ORGANIZATION_ID ?? "",
    appId: env.SHOPIFY_PARTNER_APP_ID ?? "",
    accessToken: env.SHOPIFY_PARTNER_ACCESS_TOKEN ?? "",
  };
}

export function requirePartnerConfig(config: PartnerInstallConfig) {
  if (!config.organizationId.trim() || !config.appId.trim() || !config.accessToken.trim()) {
    throw new Error("partner_api_configuration_incomplete");
  }
}

export async function requestPartnerApi<T>(
  config: PartnerInstallConfig,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  requirePartnerConfig(config);
  // Tutti i consumatori eseguono query di lettura: i retry non ripetono mutazioni.
  for (let attempt = 0; ; attempt += 1) {
    let response: Response | undefined;
    let errorCode = "partner_api_network_failed";
    let retryable = true;
    const signal = AbortSignal.timeout(10_000);
    try {
      response = await fetch(
        `https://partners.shopify.com/${encodeURIComponent(config.organizationId)}/api/${PARTNER_API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": config.accessToken,
          },
          body: JSON.stringify({ query, variables }),
          signal,
        },
      );
    } catch {
      if (signal.aborted) errorCode = "partner_api_timeout";
    }
    if (response) {
      errorCode = `partner_api_http_${response.status}`;
      retryable = response.status === 429 || response.status >= 500;
      if (response.ok) {
        let payload: (T & { errors?: Array<{ extensions?: { code?: string } }> }) | undefined;
        try {
          payload = (await response.json()) as typeof payload;
        } catch {
          if (!signal.aborted) throw new Error("partner_api_invalid_json");
        }
        if (signal.aborted) {
          errorCode = "partner_api_timeout";
          retryable = true;
        } else {
          if (!payload || typeof payload !== "object")
            throw new Error("partner_api_invalid_payload");
          if (!payload.errors?.length) return payload;
          const codes = payload.errors.map((error) => error?.extensions?.code);
          retryable = codes.every((code) => code === "429" || code === "500");
          errorCode = retryable
            ? codes.includes("429")
              ? "partner_api_throttled"
              : "partner_api_internal_error"
            : "partner_api_graphql_error";
        }
      }
    }
    if (!retryable || attempt >= 2) throw new Error(errorCode);
    const retryAfter = response?.headers.get("Retry-After");
    const retryAfterMs = retryAfter
      ? /^\d+(?:\.\d+)?$/.test(retryAfter)
        ? Number(retryAfter) * 1000
        : Date.parse(retryAfter) - Date.now()
      : 0;
    // Un'attesa lunga passa al prossimo cron, senza anticipare il Retry-After del provider.
    if (retryAfterMs > 30_000) throw new Error(errorCode);
    const delay = Math.max(500 * 2 ** attempt, Number.isFinite(retryAfterMs) ? retryAfterMs : 0);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

type PartnerConnection<TNode> = {
  edges?: Array<{ cursor?: string; node?: TNode | null }>;
  pageInfo?: { hasNextPage?: boolean };
};

type PartnerPage<TNode> = {
  data?: {
    app?: { events?: PartnerConnection<TNode> } | null;
    transactions?: PartnerConnection<TNode> | null;
  };
};

type ConnectionSelector<TNode> = (
  page: PartnerPage<TNode>,
) => PartnerConnection<TNode> | null | undefined;

export function partnerEvents<TNode>(page: PartnerPage<TNode>) {
  return page.data?.app?.events;
}

export function partnerTransactions<TNode>(page: PartnerPage<TNode>) {
  return page.data?.transactions;
}

// Le query ricevono sempre $appId, $after e $first.
export async function forEachPartnerPage<TNode>(
  config: PartnerInstallConfig,
  query: string,
  variables: Record<string, unknown>,
  options: {
    connection: ConnectionSelector<TNode>;
    invalidPayloadCode?: string;
    maxPages?: number;
  },
  visit: (nodes: Array<TNode | null | undefined>) => void | Promise<void>,
) {
  const maxPages = options.maxPages ?? MAX_PAGES;
  let after: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    // Il cursore della pagina successiva dipende dalla risposta corrente.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    const payload: PartnerPage<TNode> = await requestPartnerApi<PartnerPage<TNode>>(config, query, {
      appId: config.appId,
      after,
      first: PAGE_SIZE,
      ...variables,
    });
    const connection: PartnerConnection<TNode> | null | undefined = options.connection(payload);
    if (!connection || !Array.isArray(connection.edges) || !connection.pageInfo) {
      throw new Error(options.invalidPayloadCode ?? "partner_api_invalid_payload");
    }
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    await visit(connection.edges.map(({ node }) => node));
    if (!connection.pageInfo.hasNextPage) return page + 1;
    const cursor: string | undefined = connection.edges.at(-1)?.cursor;
    if (!cursor || cursor === after) throw new Error("partner_api_invalid_cursor");
    after = cursor;
  }
  throw new Error("partner_api_page_limit");
}
