import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../../app/config";
import { recordConfigurationHistory } from "../../app/configuration-history.server";
import { readStoredShopSnapshot } from "../../app/validation/repository.server";
import { insertShop } from "../support/lifecycle";

test("la Home legge l'ultima configurazione salvata come stato non confermato", async () => {
  expect(await readStoredShopSnapshot(env.DB, "assente-snapshot.myshopify.com")).toEqual({
    displayName: null,
    countryCode: null,
    config: null,
  });

  const shop = await insertShop("snapshot.example.myshopify.com");
  expect((await readStoredShopSnapshot(env.DB, shop)).config).toBeNull();

  await env.DB.prepare(
    "UPDATE shops SET display_name = 'Negozio', country_code = 'IT' WHERE shop_domain = ?",
  )
    .bind(shop)
    .run();
  const current = {
    rules: {
      taxCode: "required_validated",
      pec: "optional_validated",
    } as const,
    messages: DEFAULT_CONFIG.messages,
  };
  await recordConfigurationHistory(env.DB, shop, [
    { rules: DEFAULT_CONFIG.rules, messages: DEFAULT_CONFIG.messages },
    current,
  ]);

  expect(await readStoredShopSnapshot(env.DB, shop)).toEqual({
    displayName: "Negozio",
    countryCode: "IT",
    config: { schemaVersion: 3, ...current },
  });
});
