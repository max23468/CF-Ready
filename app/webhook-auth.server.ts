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

export const MAX_WEBHOOK_BODY_BYTES = 2 * 1024 * 1024;

function payloadTooLarge(): Response {
  return new Response(null, { status: 413, statusText: "Payload Too Large" });
}

async function readWebhookBody(request: Request): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) throw payloadTooLarge();
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes > MAX_WEBHOOK_BODY_BYTES) {
      throw payloadTooLarge();
    }
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.byteLength > MAX_WEBHOOK_BODY_BYTES - totalBytes) {
      await reader.cancel().catch(() => undefined);
      throw payloadTooLarge();
    }
    chunks.push(value);
    totalBytes += value.byteLength;
  }

  const rawBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    rawBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(rawBytes);
}

// I webhook devono restare autenticabili anche dopo che Shopify ha revocato il token
// offline dello store. La sessione merchant non serve per validare la firma della consegna.
export async function authenticateWebhookRequest(
  request: Request,
  validate: WebhookValidator,
): Promise<AuthenticatedWebhook> {
  if (request.method !== "POST") {
    throw new Response(null, { status: 405, statusText: "Method not allowed" });
  }

  const rawBody = await readWebhookBody(request);
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
