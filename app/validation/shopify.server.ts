import { FUNCTION_HANDLE, type Admin, type MutationResult, type Validation } from "./types";

type Context = {
  shop: { name: string; ianaTimezone: string; shopAddress: { countryCodeV2: string } };
  validations: {
    nodes: Validation[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

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

export function validationsForApp(validations: Validation[]) {
  return validations.filter(({ shopifyFunction }) => shopifyFunction.handle === FUNCTION_HANDLE);
}

export function findValidation(validations: Validation[]) {
  const matches = validationsForApp(validations);
  if (matches.length > 1) {
    throw new Response("Sono presenti più Validation CF Ready.", { status: 409 });
  }
  return matches[0];
}

export function duplicateValidationError(validations: Validation[]) {
  if (validations.length < 2) return null;
  return validations.some(({ enabled }) => enabled)
    ? "duplicate_validations_active"
    : "duplicate_validations";
}

export async function readValidationReadback(admin: Admin) {
  try {
    return validationsForApp((await queryContext(admin)).validations.nodes);
  } catch {
    return null;
  }
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
