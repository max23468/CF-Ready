import { APP_URL } from "../env.server";
import { logEvent } from "../events.server";
import type { ShopifyBilling } from "./types";

export const BILLING_QUERY = `#graphql
  query CfReadyBilling($after: String) {
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
      oneTimePurchases(first: 50, after: $after, sortKey: CREATED_AT, reverse: true) {
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

type BillingResponse = {
  data?: {
    currentAppInstallation: {
      activeSubscriptions: {
        id: string;
        name: string;
        status: string;
        currentPeriodEnd: string | null;
        lineItems: {
          plan: {
            pricingDetails: {
              interval?: "EVERY_30_DAYS" | "ANNUAL";
              price?: { amount: string; currencyCode: string };
            };
          };
        }[];
      }[];
      oneTimePurchases: {
        nodes: {
          id: string;
          status: string;
          createdAt: string;
          price: { amount: string; currencyCode: string } | null;
        }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  };
  errors?: { message: string }[];
};

type BillingInstallation = NonNullable<BillingResponse["data"]>["currentAppInstallation"];

type Admin = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

// Shopify è la fonte autorevole: lo stato commerciale si legge sempre da qui, mai dal
// ritorno di un redirect di approvazione.
export async function readBilling(admin: Admin): Promise<ShopifyBilling> {
  let after: string | null = null;
  let subscription: BillingInstallation["activeSubscriptions"][number] | undefined;
  let oneTime: BillingInstallation["oneTimePurchases"]["nodes"][number] | undefined;
  let pendingOneTime = false;
  const cursors = new Set<string>();

  do {
    const response = await admin.graphql(BILLING_QUERY, { variables: { after } });
    const body = (await response.json()) as BillingResponse;
    if (!body.data || body.errors?.length) {
      throw new Response("Lettura billing Shopify non riuscita", { status: 502 });
    }

    subscription ??= body.data.currentAppInstallation.activeSubscriptions[0];
    const purchases = body.data.currentAppInstallation.oneTimePurchases;
    oneTime = purchases.nodes.find((purchase) => purchase.status === "ACTIVE");
    pendingOneTime ||= purchases.nodes.some((purchase) => purchase.status === "PENDING");

    const { hasNextPage, endCursor } = purchases.pageInfo;
    if (!oneTime && hasNextPage) {
      if (!endCursor || cursors.has(endCursor)) {
        throw new Response("Paginazione billing Shopify non valida", { status: 502 });
      }
      cursors.add(endCursor);
      after = endCursor;
    } else {
      after = null;
    }
  } while (after);

  const pricing = subscription?.lineItems[0]?.plan.pricingDetails;

  return {
    subscription: subscription
      ? {
          id: subscription.id,
          name: subscription.name,
          currentPeriodEnd: subscription.currentPeriodEnd,
          interval: pricing?.interval ?? null,
          amount: pricing?.price?.amount ?? null,
          currency: pricing?.price?.currencyCode ?? null,
        }
      : null,
    oneTime: oneTime
      ? {
          id: oneTime.id,
          createdAt: oneTime.createdAt,
          amount: oneTime.price?.amount ?? null,
          currency: oneTime.price?.currencyCode ?? null,
        }
      : null,
    pendingOneTime,
  };
}

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

export function returnUrlFor(request: Request, shopDomain: string) {
  const incoming = new URL(request.url).searchParams;
  const target = new URL("/app", APP_URL);
  target.searchParams.set("shop", shopDomain);
  const host = incoming.get("host");
  if (host) {
    try {
      const decoded = atob(host.replaceAll("-", "+").replaceAll("_", "/"));
      const shopName = shopDomain.replace(/\.myshopify\.com$/, "");
      if (decoded === `admin.shopify.com/store/${shopName}`) target.searchParams.set("host", host);
    } catch {
      // Un host manipolato non serve al rientro: lo shop autenticato resta sufficiente.
    }
  }
  return target.toString();
}

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
