export type TelegramRichText = string | { type: "bold"; text: string };

export type TelegramRichMessage = {
  blocks: Array<Record<string, unknown>>;
  skip_entity_detection?: boolean;
};

export type TelegramInlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

export type TelegramClientConfig = {
  botToken: string;
  chatId: string;
};

type TelegramResult = {
  ok?: boolean;
  error_code?: number;
  description?: string;
  result?: unknown;
};

export function createTelegramClient(config: TelegramClientConfig, fetcher: typeof fetch = fetch) {
  requireTelegramConfig(config);

  const call = async (method: string, body: Record<string, unknown>) => {
    let response: Response;
    try {
      response = await fetcher(`https://api.telegram.org/bot${config.botToken}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error("telegram_request_failed");
    }

    let payload: TelegramResult;
    try {
      payload = (await response.json()) as TelegramResult;
    } catch {
      throw new Error("telegram_invalid_response");
    }
    if (!response.ok || !payload.ok) {
      const description = payload.description?.toLocaleLowerCase("en-US") ?? "";
      if (payload.error_code === 400 && description.includes("message is not modified")) {
        return { notModified: true, result: payload.result };
      }
      if (
        payload.error_code === 400 &&
        (description.includes("message to edit not found") ||
          description.includes("message can't be edited"))
      ) {
        throw new Error("telegram_message_not_editable");
      }
      throw new Error("telegram_api_failed");
    }
    return { notModified: false, result: payload.result };
  };

  return {
    async sendRichMessage(richMessage: TelegramRichMessage, replyMarkup?: TelegramInlineKeyboard) {
      const response = await call("sendRichMessage", {
        chat_id: config.chatId,
        rich_message: richMessage,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      const messageId = (response.result as { message_id?: unknown } | undefined)?.message_id;
      return Number.isSafeInteger(messageId) ? (messageId as number) : null;
    },

    async editRichMessage(
      messageId: number,
      richMessage: TelegramRichMessage,
      replyMarkup?: TelegramInlineKeyboard,
    ) {
      const response = await call("editMessageText", {
        chat_id: config.chatId,
        message_id: messageId,
        rich_message: richMessage,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      return response.notModified ? "not_modified" : "edited";
    },

    async answerCallbackQuery(callbackQueryId: string) {
      await call("answerCallbackQuery", { callback_query_id: callbackQueryId });
    },

    async getWebhookInfo() {
      const response = await call("getWebhookInfo", {});
      const result = response.result as
        | {
            url?: unknown;
            pending_update_count?: unknown;
            last_error_date?: unknown;
          }
        | undefined;
      if (
        typeof result?.url !== "string" ||
        !Number.isSafeInteger(result.pending_update_count) ||
        (result.last_error_date !== undefined && !Number.isSafeInteger(result.last_error_date))
      ) {
        throw new Error("telegram_invalid_response");
      }
      return {
        url: result.url,
        configured: result.url.length > 0,
        pendingUpdateCount: result.pending_update_count as number,
        lastErrorAt:
          typeof result.last_error_date === "number"
            ? new Date(result.last_error_date * 1000).toISOString()
            : null,
      };
    },
  };
}

export function requireTelegramConfig(config: TelegramClientConfig) {
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(config.botToken.trim())) {
    throw new Error("telegram_bot_token_invalid");
  }
  if (!/^-?\d+$/.test(config.chatId.trim())) {
    throw new Error("telegram_chat_id_invalid");
  }
}
