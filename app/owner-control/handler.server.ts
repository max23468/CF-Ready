import { recordEvent } from "../events.server";
import { readLimitedBody } from "../limited-body";
import { partnerConfigFromEnv } from "../owner-notifications/partner-api.server";
import { createTelegramClient } from "../telegram/client.server";
import {
  OWNER_CONTROL_PATH,
  TELEGRAM_BOT_TOKEN_PATTERN,
  TELEGRAM_PRIVATE_ID_PATTERN,
  TELEGRAM_WEBHOOK_SECRET_PATTERN,
} from "../telegram/owner-webhook";
import { copyTarget } from "./actions";
import { renderOwnerControlAction, type OwnerControlRuntimeConfig } from "./commands.server";
import {
  ownerControlPlainText,
  withCopyButton,
  type OwnerControlMessage,
} from "./presentation-format";
import {
  claimOwnerControlUpdate,
  finishOwnerControlUpdate,
  ownerControlErrorCode,
  renewOwnerControlClaim,
} from "./repository.server";
import { parseOwnerControlUpdate, type OwnerControlUpdate } from "./update.server";

const MAX_OWNER_CONTROL_BODY_BYTES = 64 * 1024;

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

type HandlerOptions = { now?: Date };

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

  // `answerCallbackQuery` chiude solo l'attesa del pulsante: un suo errore non cambia l'esito.
  const client = createTelegramClient(config);
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

    const action = parsed.update.action;
    const message = await renderOwnerControlAction(
      env.DB,
      action.copy ? copyTarget(action) : action,
      config,
      { now },
    );
    if (!(await renewOwnerControlClaim(env.DB, parsed.update.updateId, claim.token))) {
      throw new Error("owner_control_claim_lost");
    }

    if (action.copy) {
      await client.sendPreformattedText(ownerControlPlainText(message));
    } else {
      await deliverInteractiveMessage(client, parsed.update, withCopyButton(message, action));
    }
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
    !TELEGRAM_BOT_TOKEN_PATTERN.test(env.TELEGRAM_BOT_TOKEN) ||
    !env.TELEGRAM_CHAT_ID ||
    !TELEGRAM_PRIVATE_ID_PATTERN.test(env.TELEGRAM_CHAT_ID) ||
    !env.TELEGRAM_OWNER_USER_ID ||
    !TELEGRAM_PRIVATE_ID_PATTERN.test(env.TELEGRAM_OWNER_USER_ID) ||
    env.TELEGRAM_CHAT_ID !== env.TELEGRAM_OWNER_USER_ID ||
    !env.TELEGRAM_WEBHOOK_SECRET ||
    !TELEGRAM_WEBHOOK_SECRET_PATTERN.test(env.TELEGRAM_WEBHOOK_SECRET) ||
    !env.SHOPIFY_APP_URL ||
    !env.APP_ENVIRONMENT
  ) {
    return null;
  }
  return {
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
    partner: partnerConfigFromEnv(env),
    environment: env.APP_ENVIRONMENT,
    webhookUrl: `${env.SHOPIFY_APP_URL}${OWNER_CONTROL_PATH}`,
    versionMetadata: env.CF_VERSION_METADATA,
  };
}

async function readLimitedJson(request: Request) {
  const bytes = await readLimitedBody(request, MAX_OWNER_CONTROL_BODY_BYTES);
  if (!bytes) return { result: "too_large" as const };
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
