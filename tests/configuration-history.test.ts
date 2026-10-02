import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import { recordLatestConfiguration } from "../app/configuration-history.server";
import { insertShop } from "./support/lifecycle";

async function storedMessages(shop: string) {
  const { results } = await env.DB.prepare(
    `SELECT history.messages_json FROM configuration_history history
       JOIN shops ON shops.id = history.shop_id
      WHERE shops.shop_domain = ?`,
  )
    .bind(shop)
    .all<{ messages_json: string }>();
  return results.map((row) => JSON.parse(row.messages_json).it.taxCodeRequired);
}

function withMessage(text: string) {
  return {
    rules: DEFAULT_CONFIG.rules,
    messages: {
      ...DEFAULT_CONFIG.messages,
      it: { ...DEFAULT_CONFIG.messages.it, taxCodeRequired: text },
    },
  };
}

test("conserva soltanto l'ultima configurazione e cancella le precedenti", async () => {
  const shop = await insertShop("history.example.myshopify.com");
  await recordLatestConfiguration(env.DB, shop, withMessage("Prima"));
  await recordLatestConfiguration(env.DB, shop, withMessage("Seconda"));
  expect(await storedMessages(shop)).toEqual(["Seconda"]);

  await recordLatestConfiguration(env.DB, shop, withMessage("Prima"));
  expect(await storedMessages(shop)).toEqual(["Prima"]);
  await recordLatestConfiguration(env.DB, shop, withMessage("Prima"));
  expect(await storedMessages(shop)).toEqual(["Prima"]);
});

test("l'ultima configurazione viene eliminata con lo store", async () => {
  const shop = await insertShop("history-redact.example.myshopify.com");
  await recordLatestConfiguration(env.DB, shop, DEFAULT_CONFIG);
  await env.DB.prepare("DELETE FROM shops WHERE shop_domain = ?").bind(shop).run();
  expect(await storedMessages(shop)).toEqual([]);
});
