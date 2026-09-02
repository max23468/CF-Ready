import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { dismissMerchantCheckIn } from "../../app/events.server";
import {
  completeOnboardingAutomatically,
  readHomeState,
  readOnboarding,
  saveOnboarding,
} from "../../app/validation.server";
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
    merchantCheckInDismissed: false,
    enabledSince: "2026-08-02T11:00:00.000Z",
  });
});

test("un errore D1 futuro resta un errore operativo e non diventa stato sano", async () => {
  const shop = await insertShop("home-future-error.example.myshopify.com");
  await env.DB.prepare(
    `INSERT INTO app_state (
       shop_id, onboarding_status, onboarding_step, validation_enabled,
       last_error_code, updated_at
     ) VALUES ((SELECT id FROM shops WHERE shop_domain = ?), 'in_progress', 4, 1, ?, ?)`,
  )
    .bind(shop, "future_validation_error", "2026-09-02T10:00:00.000Z")
    .run();

  expect((await readHomeState(env.DB, shop)).onboarding.errorCode).toBe("generic");
  expect((await readOnboarding(env.DB, shop)).errorCode).toBe("generic");
});

test("autocompletamento onboarding e chiusura check-in sono persistenti e idempotenti", async () => {
  const shop = await insertShop("automatic-setup.example.myshopify.com");
  await env.DB.prepare(
    `INSERT INTO app_state (shop_id, onboarding_status, onboarding_step, updated_at)
     VALUES ((SELECT id FROM shops WHERE shop_domain = ?), 'in_progress', 4, ?)`,
  )
    .bind(shop, "2026-08-29T10:00:00.000Z")
    .run();

  expect(await completeOnboardingAutomatically(env.DB, shop)).toBe(true);
  expect(await completeOnboardingAutomatically(env.DB, shop)).toBe(false);
  expect(await readOnboarding(env.DB, shop)).toMatchObject({ status: "completed", step: 1 });

  expect(await dismissMerchantCheckIn(env.DB, shop)).toBe(true);
  expect(await dismissMerchantCheckIn(env.DB, shop)).toBe(true);
  expect((await readHomeState(env.DB, shop)).merchantCheckInDismissed).toBe(true);

  const event = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM app_events
      WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
        AND event_name = 'merchant_checkin_dismissed'`,
  )
    .bind(shop)
    .first<{ count: number }>();
  expect(event?.count).toBe(1);
});
