import { readBilling, type BillingInstallation } from "../billing/shopify.server";
import type { AppErrorCode } from "../app-error";
import type { ShopifyBilling } from "../billing/types";
import { FUNCTION_HANDLE, type Admin, type MutationResult, type Validation } from "./types";

type Context = {
  shop: {
    name: string;
    ianaTimezone: string;
    plan: { partnerDevelopment: boolean };
    shopAddress: { countryCodeV2: string };
  };
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
      plan {
        partnerDevelopment
      }
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

const HOME_SNAPSHOT_QUERY = `#graphql
  query CfReadyHomeSnapshot($after: String) {
    shop {
      name
      ianaTimezone
      plan {
        partnerDevelopment
      }
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
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        currentPeriodEnd
        lineItems {
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                interval
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
      oneTimePurchases(first: 50, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          name
          status
          createdAt
          price {
            amount
            currencyCode
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

type HomeSnapshotResponse = {
  data?: Context & { currentAppInstallation?: BillingInstallation | null };
  errors?: { message: string; path?: (string | number)[] }[];
};

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
  const response = await admin.graphql(CONTEXT_QUERY, { variables: { after: null } });
  const body = (await response.json()) as { data?: Context; errors?: { message: string }[] };
  if (!body.data || body.errors?.length) {
    throw new Response("Query Shopify non riuscita", { status: 502 });
  }
  return completeContext(admin, body.data);
}

export async function queryHomeSnapshot(admin: Admin): Promise<{
  shop: Context["shop"];
  validations: { nodes: Validation[] };
  billing: { state: ShopifyBilling | null; error: unknown };
}> {
  const response = await admin.graphql(HOME_SNAPSHOT_QUERY, { variables: { after: null } });
  const body = (await response.json()) as HomeSnapshotResponse;
  const contextError = body.errors?.some(
    ({ path }) => !path?.length || path[0] === "shop" || path[0] === "validations",
  );
  if (!body.data || contextError) {
    throw new Response("Query Shopify non riuscita", { status: 502 });
  }

  const billingError = body.errors?.some(({ path }) => path?.[0] === "currentAppInstallation");
  const billingPromise =
    billingError || !body.data.currentAppInstallation
      ? Promise.resolve({
          state: null,
          error: new Response("Lettura billing Shopify non riuscita", { status: 502 }),
        })
      : readBilling(admin, body.data.currentAppInstallation).then(
          (state) => ({ state, error: null }),
          (error: unknown) => ({ state: null, error }),
        );
  const [context, billing] = await Promise.all([completeContext(admin, body.data), billingPromise]);
  return { ...context, billing };
}

async function completeContext(admin: Admin, initial: Context) {
  const nodes: Validation[] = [];
  const cursors = new Set<string>();
  let after: string | null = initial.validations.pageInfo.hasNextPage
    ? initial.validations.pageInfo.endCursor
    : null;
  const shop = initial.shop;
  nodes.push(...initial.validations.nodes);

  if (initial.validations.pageInfo.hasNextPage && !after) {
    throw new Response("Paginazione Shopify non valida", { status: 502 });
  }
  if (after) cursors.add(after);

  while (after) {
    const response = await admin.graphql(CONTEXT_QUERY, { variables: { after } });
    const body = (await response.json()) as { data?: Context; errors?: { message: string }[] };
    if (!body.data || body.errors?.length) {
      throw new Response("Query Shopify non riuscita", { status: 502 });
    }
    nodes.push(...body.data.validations.nodes);
    const { hasNextPage, endCursor } = body.data.validations.pageInfo;
    if (hasNextPage && (!endCursor || cursors.has(endCursor))) {
      throw new Response("Paginazione Shopify non valida", { status: 502 });
    }
    if (endCursor) cursors.add(endCursor);
    after = hasNextPage ? endCursor : null;
  }

  return { shop, validations: { nodes } };
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

export function duplicateValidationError(validations: Validation[]): AppErrorCode | null {
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
