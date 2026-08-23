import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { readHomeState, readOnboarding, saveOnboarding } from "../../app/validation.server";
import { insertShop } from "../support/lifecycle";

test("riaprire l'onboarding non lo riporta a in corso", async () => {
  const shop = await insertShop("reopen.example.myshopify.com");
  await env.DB.prepare(
    `INSERT INTO app_state (shop_id, updated_at)
     VALUES ((SELECT id FROM shops WHERE shop_domain = ?), ?)`,
  )
    .bind(shop, "2026-07-31T00:00:00.000Z")
    .run();

  await saveOnboarding(env.DB, shop, { status: "in_progress", step: 2 });
  expect((await readOnboarding(env.DB, shop)).status).toBe("in_progress");

  // Chiudere la procedura riporta il contatore a uno, così riaprirla riparte dall'inizio
  // invece di restare incastrata sul riepilogo.
  await saveOnboarding(env.DB, shop, { status: "completed", step: 1 });
  expect((await readOnboarding(env.DB, shop)).step).toBe(1);

  // Un progress tardivo non può riportare il passo a quattro dopo la chiusura. La procedura
  // resta ripercorribile nello stato locale, ma una nuova apertura riparte sempre dal primo.
  await saveOnboarding(env.DB, shop, { status: "in_progress", step: 2 });
  expect((await readOnboarding(env.DB, shop)).step).toBe(1);
  // §15.9: la procedura resta riapribile, ma ripercorrerla non la riapre davvero: lo stato non
  // torna indietro, altrimenti la checklist della Home ricomparirebbe (D-063).
  const state = await readOnboarding(env.DB, shop);
  expect(state.status).toBe("completed");
});

test("la Home ricostruisce onboarding, dichiarazione e ultima attivazione con una sola lettura", async () => {
  const shop = await insertShop("home-state.example.myshopify.com");
  await env.DB.prepare(
    `INSERT INTO app_state (
       shop_id, onboarding_status, onboarding_step, validation_enabled,
       address2_conflict_declared_at, updated_at
     ) VALUES ((SELECT id FROM shops WHERE shop_domain = ?), 'in_progress', 3, 1, ?, ?)`,
  )
    .bind(shop, "2026-08-01T10:00:00.000Z", "2026-08-01T10:00:00.000Z")
    .run();
  await env.DB.prepare(
    `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
     SELECT id, 'validation_enabled', 'validation', ? FROM shops WHERE shop_domain = ?`,
  )
    .bind("2026-08-02T11:00:00.000Z", shop)
    .run();

  expect(await readHomeState(env.DB, shop)).toEqual({
    onboarding: {
      status: "in_progress",
      step: 3,
      errorCode: null,
      validationEnabled: true,
    },
    address2Declaration: "2026-08-01T10:00:00.000Z",
    enabledSince: "2026-08-02T11:00:00.000Z",
  });
});
