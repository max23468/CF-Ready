import type { Admin } from "./admin-graphql";

// Conteggio degli ordini che contengono Codice Fiscale o PEC, condiviso da `/usage` del Control
// Center (D-225) e dalla metrica della Home (D-231). Richiede `read_orders` e legge soltanto le
// chiavi dei localized fields, mai i valori.
const TAX_CODE_KEY = "TAX_CREDENTIAL_IT";
const PEC_KEY = "TAX_EMAIL_IT";

// Un ordine italiano ha al massimo i due localized fields italiani. Chiederne due tiene il
// costo di una pagina da 100 ordini a circa 500 punti, sotto il limite di 1.000 per query
// e senza svuotare il bucket condiviso con le altre letture della Home.
const FISCAL_ORDERS_QUERY = `#graphql
  query FiscalOrderUsage($first: Int!, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query) {
      nodes {
        localizedFields(first: 2) {
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

type OrdersPage = {
  data?: {
    orders?: {
      nodes: Array<{ localizedFields: { nodes: Array<{ key: string }> } }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ extensions?: { code?: string } }>;
};

export type FiscalOrderCounts = {
  status: "ok" | "no_scope" | "unavailable";
  orders: number;
  taxCode: number;
  pec: number;
  either: number;
  // Oltre il numero massimo di pagine il totale è un minimo.
  truncated: boolean;
};

export function emptyFiscalOrderCounts(): FiscalOrderCounts {
  return { status: "ok", orders: 0, taxCode: 0, pec: 0, either: 0, truncated: false };
}

// Lo scope della sessione offline è in chiaro: `write_orders` implica la lettura.
export function sessionReadsOrders(scope: string | undefined | null) {
  const scopes = (scope ?? "").split(",").map((item) => item.trim());
  return scopes.includes("read_orders") || scopes.includes("write_orders");
}

export function sinceDays(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function countFiscalOrders(
  admin: Admin,
  options: { since: string; pageSize: number; maxPages: number },
): Promise<FiscalOrderCounts> {
  const counts = emptyFiscalOrderCounts();
  try {
    let after: string | null = null;
    for (let page = 0; page < options.maxPages; page += 1) {
      // Le pagine dipendono dal cursore precedente.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const response = await admin.graphql(FISCAL_ORDERS_QUERY, {
        variables: {
          first: options.pageSize,
          after,
          query: `created_at:>='${options.since}'`,
        },
      });
      if (response.status === 401 || response.status === 403) {
        return { ...counts, status: "no_scope" };
      }
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const body = (await response.json()) as OrdersPage;
      if (body.errors?.some(({ extensions }) => extensions?.code === "ACCESS_DENIED")) {
        return { ...counts, status: "no_scope" };
      }
      const orders = body.data?.orders;
      if (!response.ok || body.errors?.length || !orders) {
        return { ...counts, status: "unavailable" };
      }
      for (const order of orders.nodes) {
        const keys = new Set(order.localizedFields.nodes.map(({ key }) => key));
        counts.orders += 1;
        if (keys.has(TAX_CODE_KEY)) counts.taxCode += 1;
        if (keys.has(PEC_KEY)) counts.pec += 1;
        if (keys.has(TAX_CODE_KEY) || keys.has(PEC_KEY)) counts.either += 1;
      }
      if (!orders.pageInfo.hasNextPage) return counts;
      after = orders.pageInfo.endCursor;
    }
    return { ...counts, truncated: true };
  } catch (error) {
    // Il client Shopify lancia le risposte GraphQL con errori invece di restituirle.
    return {
      ...counts,
      status: JSON.stringify(error).includes("ACCESS_DENIED") ? "no_scope" : "unavailable",
    };
  }
}
