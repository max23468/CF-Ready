import assert from "node:assert/strict";
import test from "node:test";

import {
  OWNER_CONTROL_MENU_COMMANDS,
  parseOptions,
  readConfig,
  runTelegramOwnerControl,
} from "./telegram-owner-control.mjs";

const environment = {
  TELEGRAM_BOT_TOKEN: "123456789:abcdefghijklmnopqrstuvwxyz_ABCD",
  TELEGRAM_CHAT_ID: "10001",
  TELEGRAM_OWNER_USER_ID: "10001",
  TELEGRAM_WEBHOOK_SECRET: "owner-control-secret-with-32-chars",
  SHOPIFY_APP_URL: "https://cf-ready-prod.test",
};

test("legge modalità e configurazione senza esporre scorciatoie ambigue", () => {
  assert.deepEqual(parseOptions(["--check"]), { mode: "check" });
  assert.throws(() => parseOptions([]), /Uso/);
  assert.throws(() => parseOptions(["--check", "--apply"]), /Uso/);
  assert.throws(() => parseOptions(["production", "--apply"]), /Uso/);
  assert.throws(
    () => parseOptions(["--apply", "--url", "https://example.test/internal/telegram/webhook"]),
    /Uso/,
  );
  assert.throws(() => readConfig({ ...environment, TELEGRAM_OWNER_USER_ID: "2" }), /chat privata/);
  assert.throws(
    () => readConfig({ ...environment, TELEGRAM_WEBHOOK_SECRET: "spazio vietato" }),
    /WEBHOOK_SECRET/,
  );
  assert.throws(
    () => readConfig({ ...environment, TELEGRAM_WEBHOOK_SECRET: "troppo-corto" }),
    /WEBHOOK_SECRET/,
  );
  assert.equal(
    readConfig(environment).webhookUrl,
    "https://cf-ready-prod.test/internal/telegram/webhook",
  );
});

test("apply configura webhook e menu owner, poi esegue il readback", async () => {
  const calls = [];
  const fetcher = async (input, init) => {
    const method = String(input).split("/").at(-1);
    calls.push({ method, body: JSON.parse(init.body) });
    if (method === "getWebhookInfo") {
      return Response.json({
        ok: true,
        result: {
          url: "https://cf-ready-prod.test/internal/telegram/webhook",
          allowed_updates: ["message", "callback_query"],
          pending_update_count: 0,
        },
      });
    }
    if (method === "getMyCommands")
      return Response.json({ ok: true, result: OWNER_CONTROL_MENU_COMMANDS });
    return Response.json({ ok: true, result: true });
  };

  assert.deepEqual(await runTelegramOwnerControl("apply", readConfig(environment), fetcher), {
    mode: "apply",
    webhook: { urlMatches: true, allowedUpdatesMatch: true, pendingUpdateCount: 0 },
    commandsMatch: true,
  });
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["setWebhook", "setMyCommands", "getWebhookInfo", "getMyCommands"],
  );
  assert.deepEqual(calls[0].body.allowed_updates, ["message", "callback_query"]);
  assert.deepEqual(calls[1].body.scope, { type: "chat", chat_id: "10001" });
  assert.deepEqual(calls[1].body.commands, OWNER_CONTROL_MENU_COMMANDS);
});

test("check è read-only e fallisce se il readback non corrisponde", async () => {
  const methods = [];
  const fetcher = async (input) => {
    const method = String(input).split("/").at(-1);
    methods.push(method);
    return method === "getWebhookInfo"
      ? Response.json({
          ok: true,
          result: { url: "", allowed_updates: [], pending_update_count: 0 },
        })
      : Response.json({ ok: true, result: [] });
  };
  await assert.rejects(
    runTelegramOwnerControl("check", readConfig(environment), fetcher),
    /readback Telegram/,
  );
  assert.deepEqual(methods.sort(), ["getMyCommands", "getWebhookInfo"]);
});
