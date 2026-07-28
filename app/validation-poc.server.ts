export const FUNCTION_HANDLE = "cf-ready-validation";

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
    if (hasNextPage && !endCursor) {
      throw new Response("Paginazione Shopify non valida", { status: 502 });
    }
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
