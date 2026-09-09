import { recordEvent } from "../events.server";
import { createTelegramClient } from "../telegram/client.server";
import { renderOwnerControlAction, type OwnerControlRuntimeConfig } from "./commands.server";
import type { OwnerControlMessage } from "./presentation";
import {
  claimOwnerControlUpdate,
  finishOwnerControlUpdate,
  ownerControlErrorCode,
  renewOwnerControlClaim,
} from "./repository.server";
import { parseOwnerControlUpdate, type OwnerControlUpdate } from "./update.server";

export const OWNER_CONTROL_PATH = "/internal/telegram/webhook";
export const MAX_OWNER_CONTROL_BODY_BYTES = 64 * 1024;

export type OwnerControlBindings = {
  DB: D1Database;
  OWNER_TELEGRAM_CONTROL_ENABLED?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_OWNER_USER_ID?: string;
  SHOPIFY_PARTNER_ORGANIZATION_ID?: string;
  SHOPIFY_PARTNER_APP_ID?: string;
  SHOPIFY_PARTNER_ACCESS_TOKEN?: string;
  SHOPIFY_APP_URL?: string;
  APP_ENVIRONMENT?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
};

type HandlerOptions = { now?: Date; fetcher?: typeof fetch };

export async function handleOwnerControlWebhook(
  request: Request,
  env: OwnerControlBindings,
  options: HandlerOptions = {},
) {
  if (env.OWNER_TELEGRAM_CONTROL_ENABLED !== "true") return response(404, "Not found.");
  if (request.method !== "POST") {
    return new Response("Method not allowed.", { status: 405, headers: { Allow: "POST" } });
  }
  if (mediaType(request.headers.get("content-type")) !== "application/json") {
    return response(415, "Unsupported media type.");
  }

  const config = readRuntimeConfig(env);
  if (!config) return response(503, "Service unavailable.");
  const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!(await secretsMatch(suppliedSecret, env.TELEGRAM_WEBHOOK_SECRET!))) {
    return response(403, "Forbidden.");
  }

  const body = await readLimitedJson(request);
  if (body.result === "too_large") return response(413, "Payload too large.");
  if (body.result === "invalid") return response(400, "Invalid request.");

  const parsed = parseOwnerControlUpdate(body.value, {
    chatId: config.chatId,
    userId: env.TELEGRAM_OWNER_USER_ID!,
  });
  // Dopo l'autenticazione del webhook, un update non utilizzabile va consumato:
  // un 4xx farebbe ritentare Telegram e potrebbe rallentare gli update owner successivi.
  if (parsed.result === "invalid" || parsed.result === "unauthorized") {
    return response(200, "OK");
  }

  const client = createTelegramClient(config, options.fetcher);
  if (parsed.result === "ignored") {
    if (parsed.callbackQueryId) {
      await client.answerCallbackQuery(parsed.callbackQueryId).catch(() => undefined);
    }
    return response(200, "OK");
  }

  const now = options.now ?? new Date();
  const claim = await claimOwnerControlUpdate(
    env.DB,
    parsed.update.updateId,
    parsed.update.kind,
    now,
  );
  if (!claim.acquired) return response(claim.retry ? 503 : 200, claim.retry ? "Retry." : "OK");

  try {
    if (parsed.update.kind === "callback_query") {
      await client.answerCallbackQuery(parsed.update.callbackQueryId).catch(() => undefined);
    }

    const message = await renderOwnerControlAction(env.DB, parsed.update.action, config, {
      now,
      fetcher: options.fetcher,
    });
    if (!(await renewOwnerControlClaim(env.DB, parsed.update.updateId, claim.token))) {
      throw new Error("owner_control_claim_lost");
    }

    await deliverInteractiveMessage(client, parsed.update, message);
    try {
      if (
        !(await finishOwnerControlUpdate(env.DB, parsed.update.updateId, claim.token, "processed"))
      ) {
        throw new Error("owner_control_delivery_untracked");
      }
    } catch (error) {
      await recordDeliveryFailure(env.DB, parsed.update, error);
    }
    return response(200, "OK");
  } catch (error) {
    const errorCode = ownerControlErrorCode(error);
    await finishOwnerControlUpdate(
      env.DB,
      parsed.update.updateId,
      claim.token,
      "failed",
      errorCode,
    );
    await recordFailure(env.DB, parsed.update, error);
    return response(500, "Retry.");
  }
}

async function deliverInteractiveMessage(
  client: ReturnType<typeof createTelegramClient>,
  update: OwnerControlUpdate,
  message: OwnerControlMessage,
) {
  if (update.kind === "message") {
    await client.sendRichMessage(message.richMessage, message.replyMarkup);
    return;
  }
  try {
    await client.editRichMessage(update.messageId, message.richMessage, message.replyMarkup);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "telegram_message_not_editable") throw error;
    await client.sendRichMessage(message.richMessage, message.replyMarkup);
  }
}

function readRuntimeConfig(env: OwnerControlBindings): OwnerControlRuntimeConfig | null {
  if (
    !env.TELEGRAM_BOT_TOKEN ||
    !/^\d+:[A-Za-z0-9_-]{20,}$/.test(env.TELEGRAM_BOT_TOKEN) ||
    !env.TELEGRAM_CHAT_ID ||
    !/^\d+$/.test(env.TELEGRAM_CHAT_ID) ||
    !env.TELEGRAM_OWNER_USER_ID ||
    !/^\d+$/.test(env.TELEGRAM_OWNER_USER_ID) ||
    env.TELEGRAM_CHAT_ID !== env.TELEGRAM_OWNER_USER_ID ||
    !env.TELEGRAM_WEBHOOK_SECRET ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET) ||
    !env.SHOPIFY_APP_URL ||
    !env.APP_ENVIRONMENT
  ) {
    return null;
  }
  return {
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
    organizationId: env.SHOPIFY_PARTNER_ORGANIZATION_ID ?? "",
    partnerAppId: env.SHOPIFY_PARTNER_APP_ID ?? "",
    partnerAccessToken: env.SHOPIFY_PARTNER_ACCESS_TOKEN ?? "",
    environment: env.APP_ENVIRONMENT,
    webhookUrl: `${env.SHOPIFY_APP_URL}${OWNER_CONTROL_PATH}`,
    versionMetadata: env.CF_VERSION_METADATA,
  };
}

async function readLimitedJson(request: Request) {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_OWNER_CONTROL_BODY_BYTES)
  ) {
    return { result: "too_large" as const };
  }
  if (!request.body) return { result: "invalid" as const };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > MAX_OWNER_CONTROL_BODY_BYTES - length) {
        await reader.cancel().catch(() => undefined);
        return { result: "too_large" as const };
      }
      chunks.push(value);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { result: "ok" as const, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { result: "invalid" as const };
  }
}

async function secretsMatch(received: string, expected: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function recordFailure(db: D1Database, update: OwnerControlUpdate, error: unknown) {
  return recordEvent(db, {
    name: "owner_control_command_failed",
    class: "error",
    metadata: { reason: update.action.view, error_code: ownerControlErrorCode(error) },
  });
}

function recordDeliveryFailure(db: D1Database, update: OwnerControlUpdate, error: unknown) {
  return recordEvent(db, {
    name: "owner_control_delivery_untracked",
    class: "error",
    metadata: { reason: update.action.view, error_code: ownerControlErrorCode(error) },
  });
}

function mediaType(value: string | null) {
  return value?.split(";", 1)[0].trim().toLocaleLowerCase("en-US") ?? "";
}

function response(status: number, body: string) {
  return new Response(body, { status, headers: { "Cache-Control": "no-store" } });
}
