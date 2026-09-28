import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  handleOwnerControlWebhook,
  MAX_OWNER_CONTROL_BODY_BYTES,
} from "../app/owner-control/handler.server";
import { callbackData } from "../app/owner-control/model";

import {
  claimOwnerControlUpdate,
  finishOwnerControlUpdate,
  ownerControlErrorCode,
  readOwnerControlState,
  renewOwnerControlClaim,
  writeOwnerControlState,
} from "../app/owner-control/repository.server";

import {
  NOW,
  CHAT_ID,
  SECRET,
  messageUpdate,
  callbackUpdate,
  request,
  telegramSuccess,
  methods,
  bodyAt,
} from "./support/owner-control";
import { controlEnv, resetOwnerControl } from "./support/owner-control-db";

beforeEach(resetOwnerControl);

describe("boundary webhook", () => {
  test("applica flag, metodo, media type, limite, secret e configurazione", async () => {
    const disabled = controlEnv();
    disabled.OWNER_TELEGRAM_CONTROL_ENABLED = "false";
    expect(
      (await handleOwnerControlWebhook(request(messageUpdate("/help")), disabled)).status,
    ).toBe(404);
    expect(
      (
        await handleOwnerControlWebhook(
          request(messageUpdate("/help"), { method: "GET", body: undefined }),
          controlEnv(),
        )
      ).status,
    ).toBe(405);
    expect(
      (
        await handleOwnerControlWebhook(
          request(messageUpdate("/help"), { contentType: "text/plain" }),
          controlEnv(),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await handleOwnerControlWebhook(
          new Request("https://cf-ready-prod.test/internal/telegram/webhook", {
            method: "POST",
            headers: { "x-telegram-bot-api-secret-token": SECRET },
            body: JSON.stringify(messageUpdate("/help")),
          }),
          controlEnv(),
        )
      ).status,
    ).toBe(415);

    const incomplete = controlEnv();
    delete incomplete.TELEGRAM_WEBHOOK_SECRET;
    expect(
      (await handleOwnerControlWebhook(request(messageUpdate("/help")), incomplete)).status,
    ).toBe(503);
    expect(
      (
        await handleOwnerControlWebhook(
          request(messageUpdate("/help"), { secret: "wrong" }),
          controlEnv(),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleOwnerControlWebhook(
          request(messageUpdate("/help"), { body: "x".repeat(MAX_OWNER_CONTROL_BODY_BYTES + 1) }),
          controlEnv(),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await handleOwnerControlWebhook(
          request(messageUpdate("/help"), { body: "{" }),
          controlEnv(),
        )
      ).status,
    ).toBe(400);
  });

  test("consuma chat, owner e tipo chat non autorizzati senza chiamare Telegram", async () => {
    const fetcher = vi.fn();
    for (const payload of [
      messageUpdate("/help", { chatId: 999 }),
      messageUpdate("/help", { userId: 999 }),
      messageUpdate("/help", { chatType: "group" }),
      callbackUpdate(callbackData({ view: "help" }), { userId: 999 }),
    ]) {
      expect(
        (await handleOwnerControlWebhook(request(payload), controlEnv(), { fetcher })).status,
      ).toBe(200);
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM owner_control_updates").first(),
    ).toEqual({
      count: 0,
    });
  });

  test("ignora update e comandi non supportati e chiude callback non valida", async () => {
    const fetcher = telegramSuccess();
    expect(
      (
        await handleOwnerControlWebhook(
          request({ update_id: 1, edited_message: {} }),
          controlEnv(),
          { fetcher },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleOwnerControlWebhook(request(messageUpdate("/unknown")), controlEnv(), {
          fetcher,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await handleOwnerControlWebhook(
          request(callbackUpdate("callback-sconosciuta", { updateId: 3 })),
          controlEnv(),
          { fetcher },
        )
      ).status,
    ).toBe(200);
    expect(methods(fetcher)).toEqual(["answerCallbackQuery"]);
    expect(
      (
        await handleOwnerControlWebhook(
          request(callbackUpdate("callback-sconosciuta", { updateId: 4 })),
          controlEnv(),
          {
            fetcher: vi.fn(async () => {
              throw new Error("rete");
            }) as unknown as typeof fetch,
          },
        )
      ).status,
    ).toBe(200);
  });

  test("rifiuta ogni configurazione owner incompleta e Content-Length non valido", async () => {
    for (const key of [
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_CHAT_ID",
      "TELEGRAM_OWNER_USER_ID",
      "TELEGRAM_WEBHOOK_SECRET",
      "SHOPIFY_APP_URL",
      "APP_ENVIRONMENT",
    ] as const) {
      const current = controlEnv();
      delete current[key];
      expect(
        (await handleOwnerControlWebhook(request(messageUpdate("/help")), current)).status,
      ).toBe(503);
    }
    const mismatchedOwner = controlEnv();
    mismatchedOwner.TELEGRAM_OWNER_USER_ID = "10002";
    expect(
      (await handleOwnerControlWebhook(request(messageUpdate("/help")), mismatchedOwner)).status,
    ).toBe(503);
    const weakSecret = controlEnv();
    weakSecret.TELEGRAM_WEBHOOK_SECRET = "too-short";
    expect(
      (await handleOwnerControlWebhook(request(messageUpdate("/help")), weakSecret)).status,
    ).toBe(503);
    const invalidLength = request(messageUpdate("/help"));
    invalidLength.headers.set("content-length", "non-numero");
    expect((await handleOwnerControlWebhook(invalidLength, controlEnv())).status).toBe(413);
    const excessiveLength = request(messageUpdate("/help"));
    excessiveLength.headers.set("content-length", String(MAX_OWNER_CONTROL_BODY_BYTES + 1));
    expect((await handleOwnerControlWebhook(excessiveLength, controlEnv())).status).toBe(413);

    const missingSecret = request(messageUpdate("/help"));
    missingSecret.headers.delete("x-telegram-bot-api-secret-token");
    expect((await handleOwnerControlWebhook(missingSecret, controlEnv())).status).toBe(403);
    expect(
      (
        await handleOwnerControlWebhook(
          new Request("https://cf-ready-prod.test/internal/telegram/webhook", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-telegram-bot-api-secret-token": SECRET,
            },
          }),
          controlEnv(),
        )
      ).status,
    ).toBe(400);
  });

  test("lascia ritentabile una vista temporaneamente non disponibile", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/sendRichMessage")
        ? Response.json({ ok: true, result: { message_id: 1 } })
        : Response.json({ data: { app: {} } }),
    ) as unknown as typeof fetch;
    const result = await handleOwnerControlWebhook(
      request(messageUpdate("/growth", { updateId: 81 })),
      controlEnv(),
      { now: NOW, fetcher },
    );
    expect(result.status).toBe(500);
    expect(methods(fetcher)).toEqual(["graphql.json"]);
    expect(
      await env.DB.prepare("SELECT status FROM owner_control_updates WHERE update_id = 81").first(),
    ).toEqual({ status: "failed" });
    expect(
      await env.DB.prepare(
        "SELECT event_name FROM app_events WHERE event_name = 'owner_control_command_failed'",
      ).first(),
    ).toEqual({ event_name: "owner_control_command_failed" });
  });
});

describe("idempotenza e delivery interattiva", () => {
  test("una ricevuta processata impedisce una seconda risposta", async () => {
    const fetcher = telegramSuccess();
    const incoming = request(messageUpdate("/help"));
    expect(
      (await handleOwnerControlWebhook(incoming, controlEnv(), { now: NOW, fetcher })).status,
    ).toBe(200);
    expect(
      (
        await handleOwnerControlWebhook(request(messageUpdate("/help")), controlEnv(), {
          now: NOW,
          fetcher,
        })
      ).status,
    ).toBe(200);
    expect(methods(fetcher)).toEqual(["sendRichMessage"]);
    expect(
      await env.DB.prepare("SELECT status, attempts FROM owner_control_updates").first(),
    ).toEqual({
      status: "processed",
      attempts: 1,
    });
  });

  test("una ricevuta ancora in lavorazione chiede a Telegram di ritentare", async () => {
    await claimOwnerControlUpdate(env.DB, 72, "message", NOW, "token");
    const result = await handleOwnerControlWebhook(
      request(messageUpdate("/help", { updateId: 72 })),
      controlEnv(),
      { now: NOW, fetcher: telegramSuccess() },
    );
    expect(result.status).toBe(503);
  });

  test("usa i binding opzionali per un comando che non richiede Partner", async () => {
    const current = controlEnv();
    delete current.SHOPIFY_PARTNER_ORGANIZATION_ID;
    delete current.SHOPIFY_PARTNER_APP_ID;
    delete current.SHOPIFY_PARTNER_ACCESS_TOKEN;
    delete current.CF_VERSION_METADATA;
    const result = await handleOwnerControlWebhook(
      request(messageUpdate("/help", { updateId: 73 })),
      current,
      { fetcher: telegramSuccess() },
    );
    expect(result.status).toBe(200);
  });

  test("un fallimento di delivery resta ritentabile", async () => {
    const failed = vi.fn(async () => {
      throw new Error("rete");
    }) as unknown as typeof fetch;
    expect(
      (
        await handleOwnerControlWebhook(request(messageUpdate("/help")), controlEnv(), {
          now: NOW,
          fetcher: failed,
        })
      ).status,
    ).toBe(500);
    expect(
      await env.DB.prepare("SELECT status, attempts FROM owner_control_updates").first(),
    ).toEqual({
      status: "failed",
      attempts: 1,
    });

    const recovered = telegramSuccess();
    expect(
      (
        await handleOwnerControlWebhook(request(messageUpdate("/help")), controlEnv(), {
          now: new Date(NOW.getTime() + 1000),
          fetcher: recovered,
        })
      ).status,
    ).toBe(200);
    expect(
      await env.DB.prepare("SELECT status, attempts FROM owner_control_updates").first(),
    ).toEqual({
      status: "processed",
      attempts: 2,
    });
  });

  test("un invio riuscito non viene richiesto di nuovo se perde la finalizzazione", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => {
      await env.DB.prepare(
        `UPDATE owner_control_updates
         SET claim_token = 'nuovo-token', updated_at = ?
         WHERE update_id = 75`,
      )
        .bind(NOW.toISOString())
        .run();
      return Response.json({ ok: true, result: { message_id: 88 } });
    }) as unknown as typeof fetch;

    const result = await handleOwnerControlWebhook(
      request(messageUpdate("/help", { updateId: 75 })),
      controlEnv(),
      { now: NOW, fetcher },
    );
    expect(result.status).toBe(200);
    expect(methods(fetcher)).toEqual(["sendRichMessage"]);
    expect(
      await env.DB.prepare(
        "SELECT event_name FROM app_events WHERE event_name = 'owner_control_delivery_untracked'",
      ).first(),
    ).toEqual({ event_name: "owner_control_delivery_untracked" });
  });

  test("la callback viene chiusa, modifica lo stesso messaggio e resta idempotente", async () => {
    const fetcher = telegramSuccess();
    const payload = callbackUpdate(callbackData({ view: "help" }));
    expect(
      (await handleOwnerControlWebhook(request(payload), controlEnv(), { now: NOW, fetcher }))
        .status,
    ).toBe(200);
    expect(methods(fetcher)).toEqual(["answerCallbackQuery", "editMessageText"]);
    const editBody = bodyAt(fetcher, 1);
    expect(editBody).toMatchObject({ chat_id: CHAT_ID, message_id: 77, rich_message: {} });

    expect(
      (
        await handleOwnerControlWebhook(request(payload), controlEnv(), {
          now: NOW,
          fetcher,
        })
      ).status,
    ).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("un ack callback già consumato non blocca il retry della risposta", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const method = String(input).split("/").at(-1);
      if (method === "answerCallbackQuery") {
        return Response.json({ ok: false, error_code: 400, description: "QUERY_ID_INVALID" });
      }
      return Response.json({ ok: true, result: { message_id: 88 } });
    }) as unknown as typeof fetch;
    const result = await handleOwnerControlWebhook(
      request(callbackUpdate(callbackData({ view: "help" }), { updateId: 74 })),
      controlEnv(),
      { now: NOW, fetcher },
    );
    expect(result.status).toBe(200);
    expect(methods(fetcher)).toEqual(["answerCallbackQuery", "editMessageText"]);
  });

  test("un messaggio non modificabile degrada a un nuovo Rich Message", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const method = String(input).split("/").at(-1);
      if (method === "editMessageText") {
        return Response.json({
          ok: false,
          error_code: 400,
          description: "Bad Request: message to edit not found",
        });
      }
      return Response.json({ ok: true, result: { message_id: 88 } });
    }) as unknown as typeof fetch;
    const payload = callbackUpdate(callbackData({ view: "help" }));
    expect(
      (await handleOwnerControlWebhook(request(payload), controlEnv(), { now: NOW, fetcher }))
        .status,
    ).toBe(200);
    expect(methods(fetcher)).toEqual(["answerCallbackQuery", "editMessageText", "sendRichMessage"]);
  });

  test("claim, lease e stato aggregato mantengono i confini D1", async () => {
    const first = await claimOwnerControlUpdate(env.DB, 91, "message", NOW, "token-1");
    expect(first).toEqual({ acquired: true, token: "token-1" });
    expect(await claimOwnerControlUpdate(env.DB, 91, "message", NOW, "token-2")).toEqual({
      acquired: false,
      retry: true,
    });
    expect(await finishOwnerControlUpdate(env.DB, 91, "wrong", "processed")).toBe(false);
    expect(await renewOwnerControlClaim(env.DB, 91, "wrong")).toBe(false);
    expect(await renewOwnerControlClaim(env.DB, 91, "token-1", NOW.toISOString())).toBe(true);
    expect(await finishOwnerControlUpdate(env.DB, 91, "token-1", "processed")).toBe(true);
    expect(await claimOwnerControlUpdate(env.DB, 91, "message", NOW, "token-3")).toEqual({
      acquired: false,
      retry: false,
    });

    const defaultClaim = await claimOwnerControlUpdate(env.DB, 92, "message");
    expect(defaultClaim.acquired).toBe(true);

    await writeOwnerControlState(env.DB, "test", { count: 1 }, NOW);
    await writeOwnerControlState(env.DB, "default-time", { count: 2 });
    expect(await readOwnerControlState<{ count: number }>(env.DB, "test")).toMatchObject({
      value: { count: 1 },
    });
    const corruptedStateDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ state_value: "{", updated_at: NOW.toISOString() }),
        }),
      }),
    } as unknown as D1Database;
    expect(await readOwnerControlState(corruptedStateDb, "test")).toBeNull();
    expect(await readOwnerControlState(env.DB, "missing")).toBeNull();
    expect(ownerControlErrorCode(new Error("known_error"))).toBe("known_error");
    expect(ownerControlErrorCode(new Error("Messaggio libero"))).toBe("owner_control_failed");
    expect(ownerControlErrorCode("errore")).toBe("owner_control_failed");
  });
});
