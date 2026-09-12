import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import { changedConfigurationFields } from "../app/configuration-history";
import {
  readConfigurationHistory,
  recordConfigurationHistory,
} from "../app/configuration-history.server";
import { insertShop } from "./support/lifecycle";

test("la cronologia conserva solo configurazioni minimizzate, deduplicate e recenti", async () => {
  const shop = await insertShop("history.example.myshopify.com");
  for (let index = 0; index < 12; index += 1) {
    await recordConfigurationHistory(env.DB, shop, [
      {
        rules: DEFAULT_CONFIG.rules,
        messages: {
          ...DEFAULT_CONFIG.messages,
          it: { ...DEFAULT_CONFIG.messages.it, taxCodeRequired: `Messaggio ${index}` },
        },
      },
    ]);
  }
  const entries = await readConfigurationHistory(env.DB, shop);
  expect(entries).toHaveLength(10);
  expect(entries[0].messages.it.taxCodeRequired).toBe("Messaggio 11");
  expect(entries.at(-1)?.messages.it.taxCodeRequired).toBe("Messaggio 2");

  await recordConfigurationHistory(env.DB, shop, [entries[0]]);
  expect(await readConfigurationHistory(env.DB, shop)).toHaveLength(10);
});

test("la cronologia calcola differenze e viene eliminata con lo store", async () => {
  const shop = await insertShop("history-redact.example.myshopify.com");
  const previous = {
    rules: { taxCode: "optional_validated", pec: "unmanaged" } as const,
    messages: DEFAULT_CONFIG.messages,
  };
  await recordConfigurationHistory(env.DB, shop, [previous]);
  expect(changedConfigurationFields(DEFAULT_CONFIG, previous)).toEqual(["taxCode"]);

  await env.DB.prepare("DELETE FROM shops WHERE shop_domain = ?").bind(shop).run();
  expect(await readConfigurationHistory(env.DB, shop)).toEqual([]);
});

test("la lettura non espone configurazioni oltre i 90 giorni prima del cron di retention", async () => {
  const shop = await insertShop("history-expired.example.myshopify.com");
  await recordConfigurationHistory(env.DB, shop, [
    {
      rules: DEFAULT_CONFIG.rules,
      messages: {
        ...DEFAULT_CONFIG.messages,
        it: { ...DEFAULT_CONFIG.messages.it, taxCodeRequired: "Configurazione scaduta" },
      },
    },
  ]);
  await env.DB.prepare(
    `UPDATE configuration_history
        SET created_at = datetime('now', '-90 days')
      WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
  )
    .bind(shop)
    .run();

  expect(await readConfigurationHistory(env.DB, shop)).toEqual([]);
});
