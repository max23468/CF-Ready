import { env } from "cloudflare:test";
import type { WebhookJob } from "../../app/webhooks.server";

export const CONFIG = { schemaVersion: 2, rules: { taxCode: "required_validated" } };

export function webhookQueue(capture?: (job: WebhookJob) => void) {
  return {
    async send(job: WebhookJob) {
      capture?.(job);
      return {} as QueueSendResponse;
    },
  } as Queue<WebhookJob>;
}

export async function insertShop(shopDomain: string) {
  const timestamp = "2026-07-30T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO shops (
       shop_domain, installation_status, installed_at, created_at, updated_at
     ) VALUES (?, 'active', ?, ?, ?)`,
  )
    .bind(shopDomain, timestamp, timestamp, timestamp)
    .run();
  return shopDomain;
}

export const FUSO = "Europe/Rome";
export const SENZA_DIRITTO = { kind: "none", validThrough: null };

export function shopContext(
  countryCode: string,
  enabled: boolean | null,
  entitlement: unknown = SENZA_DIRITTO,
) {
  return {
    data: {
      shop: {
        name: "Store di prova",
        ianaTimezone: FUSO,
        plan: { partnerDevelopment: true },
        shopAddress: { countryCodeV2: countryCode },
      },
      validations: {
        nodes:
          enabled === null
            ? []
            : [
                {
                  id: "gid://shopify/Validation/1",
                  title: "CF Ready",
                  enabled,
                  blockOnFailure: false,
                  shopifyFunction: { handle: "cf-ready-validation" },
                  metafield: {
                    jsonValue: { ...CONFIG, rules: { ...CONFIG.rules }, entitlement },
                  },
                },
              ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

// Nessuna sottoscrizione né acquisto: lo store è nella prova.
export const SENZA_ADDEBITI = {
  data: {
    currentAppInstallation: {
      activeSubscriptions: [],
      oneTimePurchases: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  },
};

export const CONVERSIONE_UNA_TANTUM = {
  data: {
    currentAppInstallation: {
      activeSubscriptions: [
        {
          id: "gid://shopify/AppSubscription/1",
          name: "launch-monthly",
          status: "ACTIVE",
          test: true,
          currentPeriodEnd: "2026-08-31T21:59:59Z",
          lineItems: [
            {
              plan: {
                pricingDetails: {
                  interval: "EVERY_30_DAYS",
                  price: { amount: "2.99", currencyCode: "EUR" },
                },
              },
            },
          ],
        },
      ],
      oneTimePurchases: {
        nodes: [
          {
            id: "gid://shopify/AppPurchaseOneTime/1",
            name: "CF Ready",
            status: "ACTIVE",
            test: true,
            createdAt: "2026-08-07T08:00:00Z",
            price: { amount: "89.90", currencyCode: "EUR" },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  },
};

export function adminStub(responses: unknown[]) {
  const calls: string[] = [];
  const updates: unknown[] = [];
  return {
    calls,
    updates,
    graphql: async (query: string, options?: { variables?: unknown }) => {
      if (query.includes("validationUpdate")) updates.push(options?.variables);
      calls.push(
        query.includes("validationUpdate")
          ? "update"
          : query.includes("appSubscriptionCancel")
            ? "cancel"
            : query.includes("currentAppInstallation")
              ? "billing"
              : "context",
      );
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return Response.json(response);
    },
  };
}

export async function appState(shopDomain: string) {
  return env.DB.prepare(
    `SELECT a.validation_gid, a.validation_enabled, a.config_schema_version, a.config_hash,
            a.last_error_code, s.installation_status, s.country_code
     FROM app_state a JOIN shops s ON s.id = a.shop_id
     WHERE s.shop_domain = ?`,
  )
    .bind(shopDomain)
    .first<Record<string, unknown>>();
}

export async function clearBillingEvents(shopDomain: string) {
  await env.DB.prepare(
    "DELETE FROM billing_events WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)",
  )
    .bind(shopDomain)
    .run();
}
