import {
  requestPartnerApi,
  type PartnerInstallConfig,
} from "../owner-notifications/partner-source.server";
import { readOwnerControlState, writeOwnerControlState } from "./repository.server";

const REVENUE_CACHE_KEY = "revenue_v1";
const REVENUE_CACHE_TTL_MS = 15 * 60 * 1000;
const REVENUE_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

// Le transazioni Partner che modificano gli accrediti dell'app, raggruppate per la vista Billing.
const TRANSACTION_KINDS = {
  AppSubscriptionSale: "subscriptions",
  AppUsageSale: "subscriptions",
  AppOneTimeSale: "lifetime",
  AppSaleAdjustment: "adjustments",
  AppSaleCredit: "adjustments",
} as const;
type TransactionTypename = keyof typeof TRANSACTION_KINDS;

const AMOUNTS = "grossAmount { amount currencyCode } netAmount { amount currencyCode }";

const REVENUE_QUERY = `#graphql
  query OwnerControlRevenue($appId: ID!, $after: String, $first: Int!) {
    transactions(
      appId: $appId, after: $after, first: $first,
      types: [
        APP_SUBSCRIPTION_SALE APP_USAGE_SALE APP_ONE_TIME_SALE
        APP_SALE_ADJUSTMENT APP_SALE_CREDIT
      ]
    ) {
      edges {
        cursor
        node {
          __typename
          ${Object.keys(TRANSACTION_KINDS)
            .map((type) => `... on ${type} { ${AMOUNTS} }`)
            .join("\n          ")}
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

export type RevenueTotals = { count: number; grossMinor: number; netMinor: number };
export type RevenueReport = {
  generatedAt: string;
  currency: string | null;
  totals: RevenueTotals;
  subscriptions: RevenueTotals;
  lifetime: RevenueTotals;
  adjustments: RevenueTotals;
};

type RevenuePayload = {
  data?: {
    transactions?: {
      edges?: Array<{
        cursor?: string;
        node?: { __typename?: string; grossAmount?: unknown; netAmount?: unknown } | null;
      }>;
      pageInfo?: { hasNextPage?: boolean };
    } | null;
  };
};

export async function readRevenueReport(
  db: D1Database,
  config: PartnerInstallConfig,
  options: { now?: Date; force?: boolean; fetcher?: typeof fetch } = {},
) {
  const now = options.now ?? new Date();
  const cached = await readOwnerControlState<RevenueReport>(db, REVENUE_CACHE_KEY);
  const cacheAge = cached ? now.getTime() - Date.parse(cached.updatedAt) : Number.POSITIVE_INFINITY;
  const maxAge = options.force ? REVENUE_REFRESH_COOLDOWN_MS : REVENUE_CACHE_TTL_MS;
  if (cached && cacheAge >= 0 && cacheAge < maxAge) {
    return { ...cached.value, cachedAt: cached.updatedAt };
  }

  const report = await fetchRevenueReport(config, now, options.fetcher);
  await writeOwnerControlState(db, REVENUE_CACHE_KEY, report, now);
  return { ...report, cachedAt: now.toISOString() };
}

export async function fetchRevenueReport(
  config: PartnerInstallConfig,
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<RevenueReport> {
  const report: RevenueReport = {
    generatedAt: now.toISOString(),
    currency: null,
    totals: emptyTotals(),
    subscriptions: emptyTotals(),
    lifetime: emptyTotals(),
    adjustments: emptyTotals(),
  };
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload: RevenuePayload = await requestPartnerApi<RevenuePayload>(
      config,
      REVENUE_QUERY,
      { appId: config.appId, after, first: PAGE_SIZE },
      fetcher,
    );
    const transactions: NonNullable<RevenuePayload["data"]>["transactions"] =
      payload.data?.transactions;
    if (!transactions || !Array.isArray(transactions.edges) || !transactions.pageInfo) {
      throw new Error("partner_api_invalid_payload");
    }
    for (const { node } of transactions.edges) {
      const kind = TRANSACTION_KINDS[node?.__typename as TransactionTypename];
      const net = money(node?.netAmount);
      // I crediti possono non avere un lordo: in quel caso contribuiscono soltanto al netto.
      const gross = node?.grossAmount == null ? null : money(node.grossAmount);
      if (!kind || !net || gross === undefined) {
        throw new Error("partner_api_invalid_transaction");
      }
      for (const amount of gross ? [net, gross] : [net]) {
        report.currency ??= amount.currencyCode;
        if (amount.currencyCode !== report.currency) {
          throw new Error("partner_api_mixed_currency");
        }
      }
      for (const totals of [report.totals, report[kind]]) {
        totals.count += 1;
        totals.grossMinor += gross?.minor ?? net.minor;
        totals.netMinor += net.minor;
      }
    }
    if (!transactions.pageInfo.hasNextPage) return report;
    const cursor: string | undefined = transactions.edges.at(-1)?.cursor;
    if (!cursor || cursor === after) throw new Error("partner_api_invalid_cursor");
    after = cursor;
  }
  throw new Error("partner_api_page_limit");
}

function money(input: unknown) {
  const value = input as { amount?: unknown; currencyCode?: unknown } | null | undefined;
  if (
    typeof value?.amount !== "string" ||
    !/^-?\d+(\.\d+)?$/.test(value.amount) ||
    typeof value.currencyCode !== "string" ||
    !/^[A-Z]{3}$/.test(value.currencyCode)
  ) {
    return undefined;
  }
  return { minor: Math.round(Number(value.amount) * 100), currencyCode: value.currencyCode };
}

function emptyTotals(): RevenueTotals {
  return { count: 0, grossMinor: 0, netMinor: 0 };
}
