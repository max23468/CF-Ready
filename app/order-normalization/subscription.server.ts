import type { Admin } from "../admin-graphql";
import { ORDER_WEBHOOK_ID_FIELD, ORDER_WEBHOOK_PATH } from "../webhooks/webhook-ingress.server";

// D-211: Shopify rifiuta nel manifest un webhook il cui scope è solo opzionale. La
// sottoscrizione a orders/create nasce quindi per il singolo store, quando il merchant ha
// concesso gli scope ordini, e riceve sempre e soltanto l'ID dell'ordine.
const LIST_QUERY = `#graphql
  query CfReadyOrderWebhooks($uri: String!) {
    webhookSubscriptions(first: 10, topics: [ORDERS_CREATE], uri: $uri) {
      nodes {
        id
      }
    }
  }
`;

const CREATE_MUTATION = `#graphql
  mutation CfReadyCreateOrderWebhook($uri: String!) {
    webhookSubscriptionCreate(
      topic: ORDERS_CREATE
      webhookSubscription: { uri: $uri, format: JSON, includeFields: ["${ORDER_WEBHOOK_ID_FIELD}"] }
    ) {
      webhookSubscription {
        id
      }
      userErrors {
        message
      }
    }
  }
`;

const DELETE_MUTATION = `#graphql
  mutation CfReadyDeleteOrderWebhook($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      userErrors {
        message
      }
    }
  }
`;

type Envelope<T> = { data?: T; errors?: unknown[] };

export function orderWebhookUri(appOrigin: string) {
  return new URL(ORDER_WEBHOOK_PATH, appOrigin).toString();
}

export async function ensureOrderWebhook(admin: Admin, appOrigin: string) {
  const uri = orderWebhookUri(appOrigin);
  if ((await listOrderWebhooks(admin, uri)).length > 0) return;
  const data = await graphql<{
    webhookSubscriptionCreate: {
      webhookSubscription: { id: string } | null;
      userErrors: unknown[];
    };
  }>(admin, CREATE_MUTATION, { uri });
  const result = data.webhookSubscriptionCreate;
  if (!result.webhookSubscription || result.userErrors.length > 0) {
    throw new Error("order_webhook_failed");
  }
}

export async function removeOrderWebhooks(admin: Admin, appOrigin: string) {
  const ids = await listOrderWebhooks(admin, orderWebhookUri(appOrigin));
  for (const id of ids) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    await graphql(admin, DELETE_MUTATION, { id });
  }
}

async function listOrderWebhooks(admin: Admin, uri: string) {
  const data = await graphql<{ webhookSubscriptions: { nodes: Array<{ id: string }> } }>(
    admin,
    LIST_QUERY,
    { uri },
  );
  return data.webhookSubscriptions.nodes.map(({ id }) => id);
}

async function graphql<T>(admin: Admin, query: string, variables: Record<string, unknown>) {
  let body: Envelope<T>;
  try {
    body = (await (await admin.graphql(query, { variables })).json()) as Envelope<T>;
  } catch {
    throw new Error("order_webhook_failed");
  }
  if (!body.data || body.errors?.length) throw new Error("order_webhook_failed");
  return body.data;
}
