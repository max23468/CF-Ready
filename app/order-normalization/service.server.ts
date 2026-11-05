import { readConfig, type Rules } from "../config";
import { FUNCTION_HANDLE, type Admin } from "../validation/types";
import { normalizedOrderFields, normalizesOrderFields, type OrderLocalizedField } from "./domain";

// D-206: pagine piccole, perché ogni ordine da correggere costa una mutation separata.
export const ORDER_BACKFILL_PAGE_SIZE = 25;

const VALIDATIONS_FRAGMENT = `
    validations(first: 100) {
      nodes {
        enabled
        shopifyFunction {
          handle
        }
        metafield(namespace: "$app:cf-ready-validation", key: "function-configuration") {
          jsonValue
        }
      }
    }`;

const ORDER_QUERY = `#graphql
  query CfReadyOrderFields($id: ID!) {
    order(id: $id) {
      id
      localizedFields(first: 10) {
        nodes {
          key
          value
        }
      }
    }${VALIDATIONS_FRAGMENT}
  }
`;

const ORDERS_PAGE_QUERY = `#graphql
  query CfReadyOrderFieldsPage($first: Int!, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
      nodes {
        id
        localizedFields(first: 10) {
          nodes {
            key
            value
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }${VALIDATIONS_FRAGMENT}
  }
`;

const ORDER_UPDATE_MUTATION = `#graphql
  mutation CfReadyNormalizeOrderFields($input: OrderInput!) {
    orderUpdate(input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`;

type OrderNode = { id: string; localizedFields: { nodes: OrderLocalizedField[] } };
type ValidationNode = {
  enabled: boolean;
  shopifyFunction: { handle: string };
  metafield: { jsonValue: unknown } | null;
};
type Envelope<T> = { data?: T; errors?: Array<{ extensions?: { code?: string } }> };

export type OrderNormalizationResult = { updated: number };
export type OrderBackfillPage = OrderNormalizationResult & {
  scanned: number;
  nextCursor: string | null;
};

export async function normalizeOrder(
  admin: Admin,
  orderId: string,
): Promise<OrderNormalizationResult> {
  const data = await graphql<{ order: OrderNode | null; validations: { nodes: ValidationNode[] } }>(
    admin,
    ORDER_QUERY,
    { id: orderId },
  );
  const rules = activeRules(data.validations.nodes);
  if (!rules || !data.order) return { updated: 0 };
  return { updated: (await updateOrder(admin, data.order, rules)) ? 1 : 0 };
}

export async function normalizeOrdersPage(
  admin: Admin,
  since: string,
  cursor: string | null,
): Promise<OrderBackfillPage> {
  const data = await graphql<{
    orders: {
      nodes: OrderNode[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
    validations: { nodes: ValidationNode[] };
  }>(admin, ORDERS_PAGE_QUERY, {
    first: ORDER_BACKFILL_PAGE_SIZE,
    after: cursor,
    query: `created_at:>='${since}'`,
  });
  const rules = activeRules(data.validations.nodes);
  // Se nel frattempo il merchant ha spento l'opzione o la Validation, la correzione si ferma.
  if (!rules) return { scanned: 0, updated: 0, nextCursor: null };

  let updated = 0;
  for (const order of data.orders.nodes) {
    // Le mutation restano sequenziali: il limite di costo Admin API è per store.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    if (await updateOrder(admin, order, rules)) updated += 1;
  }
  const { hasNextPage, endCursor } = data.orders.pageInfo;
  return {
    scanned: data.orders.nodes.length,
    updated,
    nextCursor: hasNextPage ? endCursor : null,
  };
}

function activeRules(validations: ValidationNode[]): Rules | null {
  const validation = validations.find(
    ({ shopifyFunction }) => shopifyFunction.handle === FUNCTION_HANDLE,
  );
  if (!validation?.enabled) return null;
  const { rules } = readConfig(validation.metafield?.jsonValue);
  return normalizesOrderFields(rules) ? rules : null;
}

async function updateOrder(admin: Admin, order: OrderNode, rules: Rules) {
  // Shopify sostituisce le sole chiavi inviate e lascia invariate le altre.
  const localizedFields = normalizedOrderFields(order.localizedFields.nodes, rules);
  if (localizedFields.length === 0) return false;
  const data = await graphql<{ orderUpdate: { userErrors: unknown[] } | null }>(
    admin,
    ORDER_UPDATE_MUTATION,
    { input: { id: order.id, localizedFields } },
  );
  if (!data.orderUpdate || data.orderUpdate.userErrors.length > 0) {
    throw new Error("order_update_failed");
  }
  return true;
}

async function graphql<T>(admin: Admin, query: string, variables: Record<string, unknown>) {
  let body: Envelope<T>;
  try {
    const response = await admin.graphql(query, { variables });
    if (response.status === 401 || response.status === 403) {
      throw new Error("order_scope_missing");
    }
    body = (await response.json()) as Envelope<T>;
  } catch (error) {
    throw new Error(accessDenied(error) ? "order_scope_missing" : "order_query_failed");
  }
  if (body.errors?.some(({ extensions }) => extensions?.code === "ACCESS_DENIED")) {
    throw new Error("order_scope_missing");
  }
  if (!body.data || body.errors?.length) throw new Error("order_query_failed");
  return body.data;
}

// Il client Shopify lancia un errore con il corpo GraphQL quando lo scope manca.
function accessDenied(error: unknown): boolean {
  if (error instanceof Error && error.message === "order_scope_missing") return true;
  const body = (error as { body?: { errors?: unknown } } | null)?.body;
  return JSON.stringify(body?.errors ?? "").includes("ACCESS_DENIED");
}
