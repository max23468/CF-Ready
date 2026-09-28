import { describe, expect, test, vi } from "vitest";

import { createTelegramClient } from "../app/telegram/client.server";

import { BOT_TOKEN, CHAT_ID, methods } from "./support/owner-control";

describe("client Telegram condiviso", () => {
  test("invia, modifica, chiude callback e legge il webhook", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const method = String(input).split("/").at(-1);
      if (method === "getWebhookInfo") {
        return Response.json({
          ok: true,
          result: {
            url: "https://cf-ready-prod.test/internal/telegram/webhook",
            pending_update_count: 2,
            last_error_date: 1_788_885_000,
          },
        });
      }
      return Response.json({ ok: true, result: { message_id: 44 } });
    }) as unknown as typeof fetch;
    const client = createTelegramClient({ botToken: BOT_TOKEN, chatId: CHAT_ID }, fetcher);
    expect(await client.sendRichMessage({ blocks: [] })).toBe(44);
    expect(await client.editRichMessage(44, { blocks: [] })).toBe("edited");
    await expect(client.answerCallbackQuery("callback-1")).resolves.toBeUndefined();
    await expect(client.getWebhookInfo()).resolves.toMatchObject({
      configured: true,
      pendingUpdateCount: 2,
    });
    expect(methods(fetcher)).toEqual([
      "sendRichMessage",
      "editMessageText",
      "answerCallbackQuery",
      "getWebhookInfo",
    ]);
  });

  test("tratta not-modified come successo e distingue edit non possibile", async () => {
    const notModified = createTelegramClient(
      { botToken: BOT_TOKEN, chatId: CHAT_ID },
      vi.fn(async () =>
        Response.json({
          ok: false,
          error_code: 400,
          description: "Bad Request: message is not modified",
        }),
      ) as unknown as typeof fetch,
    );
    await expect(notModified.editRichMessage(1, { blocks: [] })).resolves.toBe("not_modified");

    const notEditable = createTelegramClient(
      { botToken: BOT_TOKEN, chatId: CHAT_ID },
      vi.fn(async () =>
        Response.json({
          ok: false,
          error_code: 400,
          description: "Bad Request: message can't be edited",
        }),
      ) as unknown as typeof fetch,
    );
    await expect(notEditable.editRichMessage(1, { blocks: [] })).rejects.toThrow(
      "telegram_message_not_editable",
    );
  });

  test("stabilizza errori di rete, HTTP, JSON e payload webhook invalidi", async () => {
    const client = (fetcher: typeof fetch) =>
      createTelegramClient({ botToken: BOT_TOKEN, chatId: CHAT_ID }, fetcher);
    await expect(
      client(
        vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch,
      ).sendRichMessage({
        blocks: [],
      }),
    ).rejects.toThrow("telegram_request_failed");
    await expect(
      client(
        vi.fn(async () => Response.json({ ok: false }, { status: 500 })) as unknown as typeof fetch,
      ).sendRichMessage({ blocks: [] }),
    ).rejects.toThrow("telegram_api_failed");
    await expect(
      client(
        vi.fn(async () => new Response("non-json")) as unknown as typeof fetch,
      ).sendRichMessage({
        blocks: [],
      }),
    ).rejects.toThrow("telegram_invalid_response");
    await expect(
      client(
        vi.fn(async () =>
          Response.json({ ok: true, result: { url: 1 } }),
        ) as unknown as typeof fetch,
      ).getWebhookInfo(),
    ).rejects.toThrow("telegram_invalid_response");
  });
});
