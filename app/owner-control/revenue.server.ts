import {
  forEachPartnerPage,
  partnerTransactions,
  type PartnerInstallConfig,
} from "../owner-notifications/partner-api.server";
import {
  readCachedReport,
  readOwnerControlState,
  writeOwnerControlState,
} from "./repository.server";

const REVENUE_CACHE_KEY = "revenue_v1";
const REVENUE_CACHE_TTL_MS = 15 * 60 * 1000;

export type EuroExchangeRate = { date: string; usdPerEuro: number };

export async function readEuroExchangeRate(
  db: D1Database,
  options: { now?: Date } = {},
): Promise<EuroExchangeRate> {
  const now = options.now ?? new Date();
  const valid = (rate: EuroExchangeRate) => {
    const age = now.getTime() - Date.parse(`${rate.date}T00:00:00Z`);
    return (
      Number.isFinite(rate.usdPerEuro) &&
      rate.usdPerEuro > 0 &&
      age >= 0 &&
      age < 7 * 24 * 60 * 60 * 1000
    );
  };
  const cached = await readOwnerControlState<EuroExchangeRate>(db, "exchange_rate_eur_usd_v1");
  const cacheAge = cached ? now.getTime() - Date.parse(cached.updatedAt) : Infinity;
  if (cached && valid(cached.value) && cacheAge >= 0 && cacheAge < 60 * 60 * 1000) {
    return cached.value;
  }
  try {
    const response = await fetch("https://api.frankfurter.dev/v2/rate/eur/usd", {
      signal: AbortSignal.timeout(5000),
      redirect: "manual",
    });
    if (!response.ok) throw new Error("exchange_rate_unavailable");
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") throw new Error("exchange_rate_invalid");
    const data = payload as { date?: unknown; base?: unknown; quote?: unknown; rate?: unknown };
    if (
      data.base !== "EUR" ||
      data.quote !== "USD" ||
      typeof data.rate !== "number" ||
      typeof data.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.date)
    ) {
      throw new Error("exchange_rate_invalid");
    }
    const rate = { date: data.date, usdPerEuro: data.rate };
    if (
      new Date(`${rate.date}T00:00:00Z`).toISOString().slice(0, 10) !== rate.date ||
      !valid(rate)
    ) {
      throw new Error("exchange_rate_invalid");
    }
    await writeOwnerControlState(db, "exchange_rate_eur_usd_v1", rate, now);
    return rate;
  } catch {
    if (cached && valid(cached.value)) return cached.value;
    throw new Error("exchange_rate_unavailable");
  }
}

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

type RevenueTotals = { count: number; grossMinor: number; netMinor: number };
export type RevenueReport = {
  generatedAt: string;
  currency: string | null;
  totals: RevenueTotals;
  subscriptions: RevenueTotals;
  lifetime: RevenueTotals;
  adjustments: RevenueTotals;
};

export function readRevenueReport(
  db: D1Database,
  config: PartnerInstallConfig,
  options: { now?: Date; force?: boolean } = {},
) {
  const now = options.now ?? new Date();
  return readCachedReport(
    db,
    REVENUE_CACHE_KEY,
    { now, force: options.force, ttlMs: REVENUE_CACHE_TTL_MS },
    () => fetchRevenueReport(config, now),
  );
}

async function fetchRevenueReport(config: PartnerInstallConfig, now: Date): Promise<RevenueReport> {
  const report: RevenueReport = {
    generatedAt: now.toISOString(),
    currency: null,
    totals: emptyTotals(),
    subscriptions: emptyTotals(),
    lifetime: emptyTotals(),
    adjustments: emptyTotals(),
  };

  await forEachPartnerPage<{ __typename?: string; grossAmount?: unknown; netAmount?: unknown }>(
    config,
    REVENUE_QUERY,
    {},
    { connection: partnerTransactions },
    (nodes) => {
      for (const node of nodes) {
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
    },
  );
  return report;
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
