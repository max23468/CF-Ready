import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../../app/config";
import { recordLatestConfiguration } from "../../app/configuration-history.server";
import { readStoredShopSnapshot } from "../../app/validation/repository.server";
import { insertShop } from "../support/lifecycle";

test("la Home legge l'ultima configurazione salvata come stato non confermato", async () => {
  expect(await readStoredShopSnapshot(env.DB, "assente-snapshot.myshopify.com")).toEqual({
    displayName: null,
    countryCode: null,
    timeZone: null,
    partnerDevelopment: null,
    config: null,
  });

  const shop = await insertShop("snapshot.example.myshopify.com");
  expect((await readStoredShopSnapshot(env.DB, shop)).config).toBeNull();

  // D-199: fuso e tipo di store scritti dalla riconciliazione servono già al primo paint.
  await env.DB.prepare(
    `UPDATE shops SET display_name = 'Negozio', country_code = 'IT',
       iana_timezone = 'Europe/Rome', partner_development = 0
     WHERE shop_domain = ?`,
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
  await recordLatestConfiguration(env.DB, shop, {
    rules: DEFAULT_CONFIG.rules,
    messages: DEFAULT_CONFIG.messages,
  });
  await recordLatestConfiguration(env.DB, shop, current);

  expect(await readStoredShopSnapshot(env.DB, shop)).toEqual({
    displayName: "Negozio",
    countryCode: "IT",
    timeZone: "Europe/Rome",
    partnerDevelopment: false,
    config: { schemaVersion: 3, ...current },
  });
});
