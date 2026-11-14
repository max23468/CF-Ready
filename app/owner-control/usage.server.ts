import { ORDER_BACKFILL_DAYS } from "../order-normalization/domain";
import { readCachedReport } from "./repository.server";
import type { ShopifyAdminForShop } from "./shopify-plans.server";

// D-225: utilizzo indicativo per classifiche e prezzo del pagamento unico. Si legge solo dagli
// store che hanno già concesso `read_orders` per l'uniformazione (D-206); per gli altri la fonte
// è la lettura manuale della Dev Dashboard, fuori dall'app.
const USAGE_CACHE_KEY = "store_usage_v1";
const USAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ORDERS_PAGE_SIZE = 100;
// 30 pagine da 100 ordini: oltre questa soglia lo store è già in cima alla classifica.
const MAX_PAGES = 30;

const TAX_CODE_KEY = "TAX_CREDENTIAL_IT";
const PEC_KEY = "TAX_EMAIL_IT";

// Si leggono soltanto le chiavi dei localized fields, mai i valori.
const USAGE_ORDERS_QUERY = `#graphql
  query OwnerStoreUsage($first: Int!, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query) {
      nodes {
        localizedFields(first: 5) {
          nodes {
            key
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type UsageShop = { id: number; shop_domain: string; display_name: string | null };

export type StoreUsageRow = {
  shopId: number;
  status: "ok" | "no_scope" | "unavailable";
  orders: number;
  taxCode: number;
  pec: number;
  either: number;
  truncated: boolean;
};

export type StoreUsageReport = { since: string; days: number; rows: StoreUsageRow[] };

type OrdersPage = {
  data?: {
    orders?: {
      nodes: Array<{ localizedFields: { nodes: Array<{ key: string }> } }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ extensions?: { code?: string } }>;
};

// Il valore `scope` della sessione offline è in chiaro: `write_orders` implica la lettura.
export async function readUsageShops(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT s.id, s.shop_domain, s.display_name
       FROM shops s
       JOIN shopify_sessions ss ON ss.shop_id = s.id AND ss.is_online = 0
       WHERE s.installation_status = 'active'
         AND (',' || REPLACE(COALESCE(ss.scope, ''), ' ', '') || ',' LIKE '%,read_orders,%'
           OR ',' || REPLACE(COALESCE(ss.scope, ''), ' ', '') || ',' LIKE '%,write_orders,%')
       ORDER BY s.id`,
    )
    .all<UsageShop>();
  return results;
}

export async function readStoreUsage(
  db: D1Database,
  adminForShop: ShopifyAdminForShop,
  options: { now: Date; force?: boolean },
) {
  // Nomi e domini non entrano nella cache (D-189): si uniscono al momento della lettura.
  const shops = await readUsageShops(db);
  const report = await readCachedReport<StoreUsageReport>(
    db,
    USAGE_CACHE_KEY,
    { now: options.now, force: options.force, ttlMs: USAGE_CACHE_TTL_MS },
    async () => {
      const since = sinceDate(options.now);
      const rows = await Promise.all(
        shops.map((shop) => countShopOrders(shop, adminForShop, since)),
      );
      return { since, days: ORDER_BACKFILL_DAYS, rows: rankUsage(rows) };
    },
  );
  const names = new Map(shops.map((shop) => [shop.id, shop.display_name ?? shop.shop_domain]));
  return {
    ...report,
    rows: report.rows
      .filter((row) => names.has(row.shopId))
      .map((row) => ({ ...row, name: names.get(row.shopId) ?? "" })),
  };
}

export async function countShopOrders(
  shop: Pick<UsageShop, "id" | "shop_domain">,
  adminForShop: ShopifyAdminForShop,
  since: string,
): Promise<StoreUsageRow> {
  const row: StoreUsageRow = {
    shopId: shop.id,
    status: "ok",
    orders: 0,
    taxCode: 0,
    pec: 0,
    either: 0,
    truncated: false,
  };
  try {
    const admin = await adminForShop(shop.shop_domain);
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      // Le pagine dipendono dal cursore precedente.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const response = await admin.graphql(USAGE_ORDERS_QUERY, {
        variables: { first: ORDERS_PAGE_SIZE, after, query: `created_at:>='${since}'` },
      });
      if (response.status === 401 || response.status === 403) return { ...row, status: "no_scope" };
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const body = (await response.json()) as OrdersPage;
      if (body.errors?.some(({ extensions }) => extensions?.code === "ACCESS_DENIED")) {
        return { ...row, status: "no_scope" };
      }
      const orders = body.data?.orders;
      if (!response.ok || body.errors?.length || !orders) return { ...row, status: "unavailable" };
      for (const order of orders.nodes) {
        const keys = new Set(order.localizedFields.nodes.map(({ key }) => key));
        row.orders += 1;
        if (keys.has(TAX_CODE_KEY)) row.taxCode += 1;
        if (keys.has(PEC_KEY)) row.pec += 1;
        if (keys.has(TAX_CODE_KEY) || keys.has(PEC_KEY)) row.either += 1;
      }
      if (!orders.pageInfo.hasNextPage) return row;
      after = orders.pageInfo.endCursor;
    }
    return { ...row, truncated: true };
  } catch (error) {
    return {
      ...row,
      status: JSON.stringify(error).includes("ACCESS_DENIED") ? "no_scope" : "unavailable",
    };
  }
}

export function rankUsage(rows: StoreUsageRow[]) {
  return [...rows].sort(
    (a, b) => b.either - a.either || b.orders - a.orders || a.shopId - b.shopId,
  );
}

function sinceDate(now: Date) {
  return new Date(now.getTime() - ORDER_BACKFILL_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
