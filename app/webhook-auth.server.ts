import { WebhookValidationErrorReason, type WebhookValidation } from "@shopify/shopify-api";

export type AuthenticatedWebhook = {
  webhookId: string;
  topic: string;
  shop: string;
  triggeredAt?: string;
  payload: Record<string, unknown>;
};

type WebhookValidator = (input: {
  rawBody: string;
  rawRequest: Request;
}) => Promise<WebhookValidation>;

// I webhook devono restare autenticabili anche dopo che Shopify ha revocato il token
// offline dello store. La sessione merchant non serve per validare la firma della consegna.
export async function authenticateWebhookRequest(
  request: Request,
  validate: WebhookValidator,
): Promise<AuthenticatedWebhook> {
  if (request.method !== "POST") {
    throw new Response(null, { status: 405, statusText: "Method not allowed" });
  }

  const rawBody = await request.text();
  const validation = await validate({ rawBody, rawRequest: request });
  if (!validation.valid) {
    throw new Response(null, {
      status: validation.reason === WebhookValidationErrorReason.InvalidHmac ? 401 : 400,
      statusText:
        validation.reason === WebhookValidationErrorReason.InvalidHmac
          ? "Unauthorized"
          : "Bad Request",
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new Response(null, { status: 400, statusText: "Bad Request" });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Response(null, { status: 400, statusText: "Bad Request" });
  }

  return {
    webhookId: validation.webhookId,
    topic: validation.topic,
    shop: validation.domain,
    ...(validation.triggeredAt ? { triggeredAt: validation.triggeredAt } : {}),
    payload: payload as Record<string, unknown>,
  };
}
