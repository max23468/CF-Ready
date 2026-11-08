import { afterEach, describe, expect, test, vi } from "vitest";

import {
  OWNER_CONTROL_MENU_COMMANDS,
  syncOwnerControlMenu,
} from "../../app/owner-control/menu.server";
import { parseCommand } from "../../app/owner-control/actions";
import { createTelegramClient } from "../../app/telegram/client.server";

import { BOT_TOKEN, CHAT_ID, methods } from "../support/owner-control";

afterEach(() => {
  vi.unstubAllGlobals();
});

function clientWith(fetcher: unknown) {
  vi.stubGlobal("fetch", fetcher);
  return createTelegramClient({ botToken: BOT_TOKEN, chatId: CHAT_ID });
}

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
    const client = clientWith(fetcher);
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
    const notModified = clientWith(
      vi.fn(async () =>
        Response.json({
          ok: false,
          error_code: 400,
          description: "Bad Request: message is not modified",
        }),
      ),
    );
    await expect(notModified.editRichMessage(1, { blocks: [] })).resolves.toBe("not_modified");

    const notEditable = clientWith(
      vi.fn(async () =>
        Response.json({
          ok: false,
          error_code: 400,
          description: "Bad Request: message can't be edited",
        }),
      ),
    );
    await expect(notEditable.editRichMessage(1, { blocks: [] })).rejects.toThrow(
      "telegram_message_not_editable",
    );
  });

  test("stabilizza errori di rete, HTTP, JSON e payload webhook invalidi", async () => {
    await expect(
      clientWith(vi.fn(() => Promise.reject(new Error("offline")))).sendRichMessage({ blocks: [] }),
    ).rejects.toThrow("telegram_request_failed");
    await expect(
      clientWith(vi.fn(async () => Response.json({ ok: false }, { status: 500 }))).sendRichMessage({
        blocks: [],
      }),
    ).rejects.toThrow("telegram_api_failed");
    await expect(
      clientWith(vi.fn(async () => new Response("non-json"))).sendRichMessage({ blocks: [] }),
    ).rejects.toThrow("telegram_invalid_response");
    await expect(
      clientWith(
        vi.fn(async () => Response.json({ ok: true, result: { url: 1 } })),
      ).getWebhookInfo(),
    ).rejects.toThrow("telegram_invalid_response");
  });
});

describe("menu owner", () => {
  const menuFetcher = (current: unknown) =>
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/getMyCommands")
        ? Response.json({ ok: true, result: current })
        : Response.json({ ok: true, result: true }),
    ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

  test("ogni voce del menu è un comando accettato dal bot", () => {
    for (const { command } of OWNER_CONTROL_MENU_COMMANDS) {
      expect(parseCommand(`/${command}`), command).not.toBeNull();
    }
    expect(OWNER_CONTROL_MENU_COMMANDS.map(({ command }) => command)).toContain("uninstalls");
  });

  test("scrive il menu della chat owner solo quando diverge", async () => {
    const aligned = menuFetcher(OWNER_CONTROL_MENU_COMMANDS);
    vi.stubGlobal("fetch", aligned);
    expect(await syncOwnerControlMenu({ botToken: BOT_TOKEN, chatId: CHAT_ID })).toBe("aligned");
    expect(methods(aligned)).toEqual(["getMyCommands"]);
    expect(JSON.parse(String((aligned.mock.calls[0][1] as RequestInit).body))).toEqual({
      scope: { type: "chat", chat_id: CHAT_ID },
    });

    const stale = menuFetcher(OWNER_CONTROL_MENU_COMMANDS.slice(0, 4));
    vi.stubGlobal("fetch", stale);
    expect(await syncOwnerControlMenu({ botToken: BOT_TOKEN, chatId: CHAT_ID })).toBe("updated");
    expect(methods(stale)).toEqual(["getMyCommands", "setMyCommands"]);
    expect(JSON.parse(String((stale.mock.calls[1][1] as RequestInit).body))).toEqual({
      commands: OWNER_CONTROL_MENU_COMMANDS,
      scope: { type: "chat", chat_id: CHAT_ID },
    });

    vi.stubGlobal("fetch", menuFetcher({}));
    await expect(syncOwnerControlMenu({ botToken: BOT_TOKEN, chatId: CHAT_ID })).rejects.toThrow(
      "telegram_invalid_response",
    );
  });
});
