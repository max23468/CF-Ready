import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import {
  persistValidationState,
  readValidationStateRevision,
} from "../../app/validation/repository.server";
import { insertShop } from "../support/lifecycle";

test("il fence corrente consente la prima persistenza Validation", async () => {
  const shop = await insertShop("validation-first-revision.example.myshopify.com");
  const revision = await readValidationStateRevision(env.DB, shop);

  await persistValidationState(env.DB, shop, {
    displayName: "Prima revisione",
    countryCode: "IT",
    eligible: true,
    validation: undefined,
    validationEnabled: false,
    errorCode: null,
    expectedRevision: revision,
  });

  expect(
    await env.DB.prepare(
      `SELECT state.validation_state_revision, shop.country_code, shop.display_name
         FROM app_state state JOIN shops shop ON shop.id = state.shop_id
        WHERE shop.shop_domain = ?`,
    )
      .bind(shop)
      .first(),
  ).toMatchObject({
    validation_state_revision: 1,
    country_code: "IT",
    display_name: "Prima revisione",
  });
});

test("una persistenza Home tardiva non sovrascrive una scrittura Validation successiva", async () => {
  const shop = await insertShop("validation-revision.example.myshopify.com");
  const homeRevision = await readValidationStateRevision(env.DB, shop);

  await persistValidationState(env.DB, shop, {
    displayName: "Nome recente",
    countryCode: "IT",
    eligible: true,
    validation: {
      id: "gid://shopify/Validation/new",
      title: "CF Ready",
      enabled: true,
      blockOnFailure: false,
      shopifyFunction: { handle: "cf-ready-validation" },
      metafield: { jsonValue: { schemaVersion: 2, rules: {} } },
    },
    errorCode: null,
  });
  await persistValidationState(env.DB, shop, {
    displayName: "Nome obsoleto",
    countryCode: "FR",
    eligible: false,
    validation: undefined,
    validationEnabled: false,
    errorCode: "validation_write_failed",
    expectedRevision: homeRevision,
  });

  expect(
    await env.DB.prepare(
      `SELECT state.validation_gid, state.validation_enabled, state.last_error_code,
              state.validation_state_revision, shop.country_code, shop.display_name
         FROM app_state state JOIN shops shop ON shop.id = state.shop_id
        WHERE shop.shop_domain = ?`,
    )
      .bind(shop)
      .first(),
  ).toMatchObject({
    validation_gid: "gid://shopify/Validation/new",
    validation_enabled: 1,
    last_error_code: null,
    validation_state_revision: 1,
    country_code: "IT",
    display_name: "Nome recente",
  });
});
