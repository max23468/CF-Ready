import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { reconcile } from "../../app/validation.server";
import { insertShop, shopContext, SENZA_ADDEBITI, adminStub, appState } from "../support/lifecycle";

test("Validation CF Ready duplicate restano intatte e producono un errore operativo", async () => {
  const shop = await insertShop("duplicati.example.myshopify.com");
  const context = shopContext("IT", true);
  context.data.validations.nodes.push({
    ...context.data.validations.nodes[0],
    id: "gid://shopify/Validation/2",
  });
  const disabled = structuredClone(context);
  disabled.data.validations.nodes.forEach((validation) => {
    validation.enabled = false;
  });
  const admin = adminStub([
    context,
    { data: { validationUpdate: { userErrors: [] } } },
    { data: { validationUpdate: { userErrors: [] } } },
    disabled,
    SENZA_ADDEBITI,
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.validation).toBeUndefined();
  expect(state.errorCode).toBe("duplicate_validations");
  expect(state.retryable).toBe(false);
  expect(admin.calls).toEqual(["context", "update", "update", "context", "billing"]);
  expect(await appState(shop)).toMatchObject({
    validation_gid: null,
    validation_enabled: 0,
    last_error_code: "duplicate_validations",
  });
});

test("il rifiuto della disattivazione duplicati resta visibile senza cancellare risorse", async () => {
  const shop = await insertShop("duplicati-attivi.example.myshopify.com");
  const context = shopContext("IT", true);
  context.data.validations.nodes.push({
    ...context.data.validations.nodes[0],
    id: "gid://shopify/Validation/2",
  });
  context.data.validations.nodes.push({
    ...context.data.validations.nodes[0],
    id: "gid://shopify/Validation/3",
  });
  const readback = structuredClone(context);
  readback.data.validations.nodes[1].enabled = false;
  readback.data.validations.nodes[2].enabled = false;
  const admin = adminStub([
    context,
    { data: { validationUpdate: { userErrors: [{ message: "non disponibile" }] } } },
    { data: { validationUpdate: { userErrors: [] } } },
    { data: { validationUpdate: { userErrors: [] } } },
    readback,
    SENZA_ADDEBITI,
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.validationEnabled).toBe(true);
  expect(state.errorCode).toBe("duplicate_validations_active");
  expect(admin.calls).toEqual(["context", "update", "update", "update", "context", "billing"]);
  expect(await appState(shop)).toMatchObject({
    validation_gid: null,
    validation_enabled: 1,
    last_error_code: "duplicate_validations_active",
  });
});
