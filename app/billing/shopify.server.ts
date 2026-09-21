import { embeddedAdminUrl } from "../embedded-admin";
import { APP_API_KEY } from "../env.server";
import { logEvent } from "../events.server";
import type { ShopifyBilling, ShopifySubscriptionStatus } from "./types";

// Stryker disable next-line StringLiteral: il contratto GraphQL è verificato dai test delle chiamate, non dalla sostituzione dell'intero documento.
export const BILLING_QUERY = `#graphql
  query CfReadyBilling($purchaseAfter: String, $subscriptionAfter: String) {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        createdAt
        trialDays
        test
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
      allSubscriptions(first: 50, after: $subscriptionAfter) {
        nodes {
          id
          name
          status
          createdAt
          trialDays
          test
          currentPeriodEnd
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  interval
                  price { amount currencyCode }
                }
              }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
      oneTimePurchases(first: 50, after: $purchaseAfter, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          name
          status
          createdAt
          test
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

type BillingResponse = {
  data?: {
    currentAppInstallation: {
      activeSubscriptions: SubscriptionNode[];
      allSubscriptions?: {
        nodes: SubscriptionNode[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
      oneTimePurchases: {
        nodes: {
          id: string;
          status: string;
          createdAt: string;
          test: boolean;
          price: { amount: string; currencyCode: string } | null;
        }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  };
  errors?: { message: string }[];
};

type SubscriptionNode = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  trialDays: number;
  test: boolean;
  currentPeriodEnd: string | null;
  lineItems: {
    plan: {
      pricingDetails: {
        interval?: "EVERY_30_DAYS" | "ANNUAL";
        price?: { amount: string; currencyCode: string };
      };
    };
  }[];
};

export type BillingInstallation = NonNullable<BillingResponse["data"]>["currentAppInstallation"];

type Admin = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

// Shopify è la fonte autorevole: lo stato commerciale si legge sempre da qui, mai dal
// ritorno di un redirect di approvazione.
export async function readBilling(
  admin: Admin,
  initialInstallation?: BillingInstallation,
): Promise<ShopifyBilling> {
  let purchaseAfter: string | null = null;
  let subscriptionAfter: string | null = null;
  let installation = initialInstallation;
  let subscription: SubscriptionNode | undefined;
  let latestSubscription: SubscriptionNode | undefined;
  let oneTime: BillingInstallation["oneTimePurchases"]["nodes"][number] | undefined;
  let pendingOneTime = false;
  const purchaseCursors = new Set<string>();
  const subscriptionCursors = new Set<string>();

  do {
    if (!installation) {
      const response = await admin.graphql(BILLING_QUERY, {
        variables: { purchaseAfter, subscriptionAfter },
      });
      const body = (await response.json()) as BillingResponse;
      if (!body.data || body.errors?.length) {
        throw new Response("Lettura billing Shopify non riuscita", { status: 502 });
      }
      installation = body.data.currentAppInstallation;
    }

    subscription ??= installation.activeSubscriptions[0];
    const subscriptions = installation.allSubscriptions ?? {
      nodes: installation.activeSubscriptions,
      pageInfo: { hasNextPage: false, endCursor: null },
    };
    for (const candidate of subscriptions.nodes) {
      if (
        !latestSubscription ||
        Date.parse(candidate.createdAt) > Date.parse(latestSubscription.createdAt)
      ) {
        latestSubscription = candidate;
      }
    }
    const purchases = installation.oneTimePurchases;
    oneTime ??= purchases.nodes.find((purchase) => purchase.status === "ACTIVE");
    pendingOneTime ||= purchases.nodes.some((purchase) => purchase.status === "PENDING");

    purchaseAfter = nextCursor(
      !oneTime && purchases.pageInfo.hasNextPage,
      purchases.pageInfo.endCursor,
      purchaseCursors,
    );
    subscriptionAfter = nextCursor(
      subscriptions.pageInfo.hasNextPage,
      subscriptions.pageInfo.endCursor,
      subscriptionCursors,
    );
    installation = undefined;
  } while (purchaseAfter || subscriptionAfter);

  const active = subscription ? normalizeSubscription(subscription) : null;
  const latest = latestSubscription ? normalizeSubscription(latestSubscription) : active;

  return {
    subscription: active,
    latestSubscription: latest,
    oneTime: oneTime
      ? {
          id: oneTime.id,
          createdAt: oneTime.createdAt,
          test: oneTime.test,
          amount: oneTime.price?.amount ?? null,
          currency: oneTime.price?.currencyCode ?? null,
        }
      : null,
    pendingOneTime,
  };
}

function nextCursor(active: boolean, cursor: string | null, seen: Set<string>) {
  if (!active) return null;
  if (!cursor || seen.has(cursor)) {
    throw new Response("Paginazione billing Shopify non valida", { status: 502 });
  }
  seen.add(cursor);
  return cursor;
}

function normalizeSubscription(subscription: SubscriptionNode) {
  const status = subscription.status as ShopifySubscriptionStatus;
  if (!["ACTIVE", "CANCELLED", "DECLINED", "EXPIRED", "FROZEN", "PENDING"].includes(status)) {
    throw new Response("Stato billing Shopify non valido", { status: 502 });
  }
  const pricing = subscription.lineItems[0]?.plan.pricingDetails;
  return {
    id: subscription.id,
    name: subscription.name,
    status,
    createdAt: subscription.createdAt,
    trialDays: subscription.trialDays,
    test: subscription.test,
    currentPeriodEnd: subscription.currentPeriodEnd,
    interval: pricing?.interval ?? null,
    amount: pricing?.price?.amount ?? null,
    currency: pricing?.price?.currencyCode ?? null,
  };
}

// Stryker disable next-line StringLiteral: il contratto GraphQL è verificato dai test delle chiamate, non dalla sostituzione dell'intero documento.
const CREATE_SUBSCRIPTION = `#graphql
  mutation CfReadySubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $trialDays: Int
    $test: Boolean
    $replacementBehavior: AppSubscriptionReplacementBehavior
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      trialDays: $trialDays
      test: $test
      replacementBehavior: $replacementBehavior
      lineItems: $lineItems
    ) {
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

// Stryker disable next-line StringLiteral: il contratto GraphQL è verificato dai test delle chiamate, non dalla sostituzione dell'intero documento.
const CREATE_ONE_TIME = `#graphql
  mutation CfReadyOneTimeCreate($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean) {
    appPurchaseOneTimeCreate(name: $name, price: $price, returnUrl: $returnUrl, test: $test) {
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

export async function createCharge(
  admin: Admin,
  charge: {
    name: string;
    amount: number;
    currency: string;
    interval: "EVERY_30_DAYS" | "ANNUAL" | null;
    trialDays: number;
    test: boolean;
    returnUrl: string;
  },
) {
  try {
    const oneTime = charge.interval === null;
    const response = await admin.graphql(oneTime ? CREATE_ONE_TIME : CREATE_SUBSCRIPTION, {
      variables: oneTime
        ? {
            name: charge.name,
            price: { amount: charge.amount, currencyCode: charge.currency },
            returnUrl: charge.returnUrl,
            test: charge.test,
          }
        : {
            name: charge.name,
            returnUrl: charge.returnUrl,
            trialDays: charge.trialDays,
            test: charge.test,
            replacementBehavior: "STANDARD",
            lineItems: [
              {
                plan: {
                  appRecurringPricingDetails: {
                    price: { amount: charge.amount, currencyCode: charge.currency },
                    interval: charge.interval,
                  },
                },
              },
            ],
          },
    });

    const body = (await response.json()) as {
      data?: Record<
        string,
        { confirmationUrl?: string; userErrors: { message: string }[] } | undefined
      >;
      errors?: { message: string }[];
    };
    const result = body.data?.[oneTime ? "appPurchaseOneTimeCreate" : "appSubscriptionCreate"];

    if (body.errors?.length || !result || result.userErrors.length || !result.confirmationUrl) {
      logEvent(
        {
          name: "charge_create_failed",
          class: "error",
          metadata: { error_code: "shopify_charge_rejected" },
        },
        new Date().toISOString(),
      );
      return { confirmationUrl: null, error: "charge_create_failed" };
    }
    return { confirmationUrl: result.confirmationUrl, error: null };
  } catch {
    logEvent(
      {
        name: "charge_create_failed",
        class: "error",
        metadata: { error_code: "shopify_charge_request_failed" },
      },
      new Date().toISOString(),
    );
    return { confirmationUrl: null, error: "charge_create_failed" };
  }
}

export function returnUrlFor(shopDomain: string, apiKey = APP_API_KEY) {
  return embeddedAdminUrl(shopDomain, apiKey);
}

// Stryker disable next-line StringLiteral: il contratto GraphQL è verificato dai test delle chiamate, non dalla sostituzione dell'intero documento.
export const CANCEL_SUBSCRIPTION = `#graphql
  mutation CfReadySubscriptionCancel($id: ID!, $prorate: Boolean!) {
    appSubscriptionCancel(id: $id, prorate: $prorate) {
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function cancelSubscription(
  admin: Admin,
  id: string,
  { prorate }: { prorate: boolean },
) {
  try {
    const response = await admin.graphql(CANCEL_SUBSCRIPTION, { variables: { id, prorate } });
    const body = (await response.json()) as {
      data?: { appSubscriptionCancel?: { userErrors: { message: string }[] } };
      errors?: { message: string }[];
    };
    const userErrors = body.data?.appSubscriptionCancel?.userErrors;

    if (body.errors?.length || !userErrors) return "subscription_cancel_failed";
    return userErrors.length ? "subscription_cancel_failed" : null;
  } catch {
    return "subscription_cancel_failed";
  }
}
