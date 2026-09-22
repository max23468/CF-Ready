import { normalizeShopDomain, validIsoDate } from "./model";
import { requestPartnerApi, type PartnerInstallConfig } from "./partner-source.server";
import { writeNotificationState } from "./repository.server";

const PAGE_SIZE = 100;
const MAX_PAGES = 100;

const FINANCIAL_QUERY = `#graphql
  query OwnerFinancialObservations($appId: ID!, $after: String, $first: Int!) {
    transactions(
      appId: $appId, after: $after, first: $first,
      types: [APP_SUBSCRIPTION_SALE APP_ONE_TIME_SALE APP_SALE_ADJUSTMENT APP_SALE_CREDIT]
    ) {
      edges {
        cursor
        node {
          __typename
          ... on AppSubscriptionSale {
            id chargeId createdAt grossAmount { amount currencyCode }
            shop { myshopifyDomain }
          }
          ... on AppOneTimeSale {
            id chargeId createdAt grossAmount { amount currencyCode }
            shop { myshopifyDomain }
          }
          ... on AppSaleAdjustment {
            id chargeId createdAt grossAmount { amount currencyCode }
            shop { myshopifyDomain }
          }
          ... on AppSaleCredit {
            id chargeId createdAt grossAmount { amount currencyCode }
            shop { myshopifyDomain }
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

type Money = { amount?: string; currencyCode?: string } | null | undefined;
type FinancialNode = {
  __typename?: string;
  id?: string;
  chargeId?: string | null;
  createdAt?: string;
  grossAmount?: Money;
  shop?: { myshopifyDomain?: string } | null;
};

type FinancialPayload = {
  data?: {
    transactions?: {
      edges?: Array<{ cursor?: string; node?: FinancialNode | null }>;
      pageInfo?: { hasNextPage?: boolean };
    } | null;
  };
};

type Observation = {
  __typename: "AppSubscriptionSale" | "AppOneTimeSale" | "AppSaleAdjustment" | "AppSaleCredit";
  id: string;
  chargeId: string;
  createdAt: string;
  shopDomain: string;
  amountMinor: number | null;
  currency: string | null;
};

export async function syncPartnerFinancialObservations(
  db: D1Database,
  config: PartnerInstallConfig,
  options: { now?: Date; fetcher?: typeof fetch } = {},
) {
  const now = options.now ?? new Date();
  const pending = await db
    .prepare(
      `SELECT
         EXISTS(
           SELECT 1 FROM billing_accounts
            WHERE plan_kind IN ('monthly', 'annual', 'one_time') AND is_test = 0
              AND (plan_kind = 'one_time' OR current_period_start IS NOT NULL)
              AND (plan_kind = 'one_time' OR date(current_period_start) <= date('now'))
              AND (
                sale_observed_at IS NULL
                OR sale_charge_gid IS NOT shopify_charge_gid
                OR (plan_kind IN ('monthly', 'annual')
                    AND sale_cycle_start IS NOT current_period_start)
              )
         ) OR EXISTS(
           SELECT 1 FROM billing_conversions
            WHERE is_test = 0 AND (
                  credit_status = 'pending'
               OR (credit_status = 'needs_review' AND credit_transaction_gid IS NULL)
               OR (credit_status != 'not_applicable'
                   AND subscription_sale_transaction_gid IS NULL))
         ) AS pending`,
    )
    .first<number>("pending");
  const checkedAt = now.toISOString();
  if (!pending) {
    await writeNotificationState(db, "partner_financials_polled_at", checkedAt, now);
    return { observed: 0, checkedAt };
  }

  const observations: Observation[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload: FinancialPayload = await requestPartnerApi<FinancialPayload>(
      config,
      FINANCIAL_QUERY,
      { appId: config.appId, after, first: PAGE_SIZE },
      options.fetcher,
    );
    const transactions = payload.data?.transactions ?? undefined;
    if (!transactions || !Array.isArray(transactions.edges) || !transactions.pageInfo) {
      throw new Error("partner_api_invalid_financial_payload");
    }
    for (const { node } of transactions.edges) {
      if (
        !node?.id ||
        !node.chargeId ||
        !validIsoDate(node.createdAt) ||
        !node.shop?.myshopifyDomain ||
        !isFinancialType(node.__typename)
      ) {
        throw new Error("partner_api_invalid_financial_transaction");
      }
      observations.push({
        __typename: node.__typename,
        id: node.id,
        chargeId: node.chargeId,
        createdAt: node.createdAt,
        shopDomain: normalizeShopDomain(node.shop.myshopifyDomain),
        ...normalizeMoney(node.grossAmount),
      });
    }
    if (!transactions.pageInfo.hasNextPage) break;
    const cursor: string | undefined = transactions.edges.at(-1)?.cursor;
    if (!cursor || cursor === after) throw new Error("partner_api_invalid_cursor");
    after = cursor;
    if (page === MAX_PAGES - 1) throw new Error("partner_api_page_limit");
  }

  observations.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const statements: D1PreparedStatement[] = [];
  for (const observation of observations) {
    if (observation.__typename === "AppSubscriptionSale") {
      statements.push(subscriptionSaleStatement(db, observation, checkedAt));
      statements.push(conversionSubscriptionSaleStatement(db, observation, checkedAt));
    } else if (observation.__typename === "AppOneTimeSale") {
      statements.push(oneTimeSaleStatement(db, observation, checkedAt));
    } else {
      statements.push(creditStatement(db, observation, checkedAt));
    }
  }
  statements.push(
    db
      .prepare(
        `UPDATE billing_accounts SET sale_checked_at = ?
          WHERE plan_kind IN ('monthly', 'annual', 'one_time') AND is_test = 0`,
      )
      .bind(checkedAt),
    db.prepare("UPDATE billing_conversions SET last_checked_at = ?").bind(checkedAt),
  );
  await db.batch(statements);
  await writeNotificationState(db, "partner_financials_polled_at", checkedAt, now);
  return { observed: observations.length, checkedAt };
}

function isFinancialType(value: string | undefined): value is Observation["__typename"] {
  return (
    value === "AppSubscriptionSale" ||
    value === "AppOneTimeSale" ||
    value === "AppSaleAdjustment" ||
    value === "AppSaleCredit"
  );
}

function normalizeMoney(money: Money) {
  if (!money || typeof money.amount !== "string" || typeof money.currencyCode !== "string") {
    return { amountMinor: null, currency: null };
  }
  const amount = Number(money.amount);
  if (!Number.isFinite(amount) || !/^[A-Z]{3}$/.test(money.currencyCode)) {
    throw new Error("partner_api_invalid_financial_transaction");
  }
  return { amountMinor: Math.round(amount * 100), currency: money.currencyCode };
}

function subscriptionSaleStatement(db: D1Database, observation: Observation, checkedAt: string) {
  return db
    .prepare(
      `UPDATE billing_accounts
          SET sale_observed_at = ?, sale_charge_gid = ?,
              sale_cycle_start = current_period_start, sale_transaction_gid = ?,
              updated_at = ?
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
          AND shopify_charge_gid = ? AND plan_kind IN ('monthly', 'annual') AND is_test = 0
          AND current_period_start IS NOT NULL
          AND date(?) >= date(current_period_start)
          AND (sale_observed_at IS NULL OR datetime(?) > datetime(sale_observed_at))`,
    )
    .bind(
      observation.createdAt,
      observation.chargeId,
      observation.id,
      checkedAt,
      observation.shopDomain,
      observation.chargeId,
      observation.createdAt,
      observation.createdAt,
    );
}

function oneTimeSaleStatement(db: D1Database, observation: Observation, checkedAt: string) {
  return db
    .prepare(
      `UPDATE billing_accounts
          SET sale_observed_at = ?, sale_charge_gid = ?, sale_cycle_start = NULL,
              sale_transaction_gid = ?, updated_at = ?
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
          AND shopify_charge_gid = ? AND plan_kind = 'one_time' AND is_test = 0
          AND (sale_observed_at IS NULL OR datetime(?) > datetime(sale_observed_at))`,
    )
    .bind(
      observation.createdAt,
      observation.chargeId,
      observation.id,
      checkedAt,
      observation.shopDomain,
      observation.chargeId,
      observation.createdAt,
    );
}

function conversionSubscriptionSaleStatement(
  db: D1Database,
  observation: Observation,
  checkedAt: string,
) {
  return db
    .prepare(
      `UPDATE billing_conversions
          SET subscription_sale_transaction_gid = ?, subscription_sale_observed_at = ?,
              subscription_sale_amount_minor = ?, subscription_sale_currency = ?,
              updated_at = ?
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
          AND subscription_gid = ?
          AND is_test = 0
          AND (subscription_sale_observed_at IS NULL
               OR datetime(?) > datetime(subscription_sale_observed_at))`,
    )
    .bind(
      observation.id,
      observation.createdAt,
      observation.amountMinor,
      observation.currency,
      checkedAt,
      observation.shopDomain,
      observation.chargeId,
      observation.createdAt,
    );
}

function creditStatement(db: D1Database, observation: Observation, checkedAt: string) {
  return db
    .prepare(
      `UPDATE billing_conversions
          SET credit_status = CASE
                WHEN source = 'app_prorated'
                 AND credit_estimate_minor IS NOT NULL AND credit_estimate_minor > 0
                 AND ? IS NOT NULL AND ABS(?) = credit_estimate_minor
                 AND ? = currency
                THEN 'confirmed' ELSE 'needs_review' END,
              credit_observed_at = ?, credit_transaction_gid = ?,
              credit_transaction_type = ?, credit_amount_minor = ?, credit_currency = ?,
              updated_at = ?
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
          AND subscription_gid = ? AND is_test = 0
          AND ((cancelled_at IS NOT NULL AND datetime(?) >= datetime(cancelled_at))
               OR (source = 'historical_reconciliation'
                   AND datetime(?) >= datetime(requested_at)))
          AND (credit_transaction_gid IS NULL OR credit_transaction_gid = ?)`,
    )
    .bind(
      observation.amountMinor,
      observation.amountMinor,
      observation.currency,
      observation.createdAt,
      observation.id,
      observation.__typename,
      observation.amountMinor,
      observation.currency,
      checkedAt,
      observation.shopDomain,
      observation.chargeId,
      observation.createdAt,
      observation.createdAt,
      observation.id,
    );
}
