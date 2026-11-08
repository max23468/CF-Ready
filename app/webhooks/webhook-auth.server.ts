import { readLimitedBody } from "../limited-body";

type AuthenticatedWebhook = {
  webhookId: string;
  topic: string;
  shop: string;
  triggeredAt?: string;
  payload: Record<string, unknown>;
};

type WebhookValidation =
  | {
      valid: true;
      webhookId: string;
      topic: string;
      domain: string;
      triggeredAt?: string;
    }
  | { valid: false; reason: string };

type WebhookValidator = (input: {
  rawBody: string;
  rawRequest: Request;
}) => Promise<WebhookValidation>;

export const MAX_WEBHOOK_BODY_BYTES = 2 * 1024 * 1024;

// I webhook devono restare autenticabili anche dopo che Shopify ha revocato il token
// offline dello store. La sessione merchant non serve per validare la firma della consegna.
export async function authenticateWebhookRequest(
  request: Request,
  validate: WebhookValidator,
): Promise<AuthenticatedWebhook> {
  const body = await readLimitedBody(request, MAX_WEBHOOK_BODY_BYTES);
  if (!body) throw new Response(null, { status: 413, statusText: "Payload Too Large" });
  const rawBody = new TextDecoder().decode(body);
  const validation = await validate({ rawBody, rawRequest: request });
  if (!validation.valid) {
    throw new Response(null, {
      status: validation.reason === "invalid_hmac" ? 401 : 400,
      statusText: validation.reason === "invalid_hmac" ? "Unauthorized" : "Bad Request",
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
