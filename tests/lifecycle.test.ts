import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { recordEvent } from "../app/events.server";
import { markUninstalled, recordInstallOnce, redactShop, refuseInstall } from "../app/shop.server";
import { localDate, trialEnd } from "../app/billing.server";
import { readOnboarding, reconcile, saveOnboarding } from "../app/validation.server";
import { claimWebhook, finishWebhook, handleWebhook } from "../app/webhooks.server";

const CONFIG = { schemaVersion: 2, rules: { taxCode: "required_validated" } };

async function insertShop(shopDomain: string) {
  const timestamp = "2026-07-30T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO shops (
       shop_domain, installation_status, installed_at, created_at, updated_at
     ) VALUES (?, 'active', ?, ?, ?)`,
  )
    .bind(shopDomain, timestamp, timestamp, timestamp)
    .run();
  return shopDomain;
}

const FUSO = "Europe/Rome";
const SENZA_DIRITTO = { kind: "none", validThrough: null };

function shopContext(
  countryCode: string,
  enabled: boolean | null,
  entitlement: unknown = SENZA_DIRITTO,
) {
  return {
    data: {
      shop: {
        name: "Store di prova",
        ianaTimezone: FUSO,
        shopAddress: { countryCodeV2: countryCode },
      },
      validations: {
        nodes:
          enabled === null
            ? []
            : [
                {
                  id: "gid://shopify/Validation/1",
                  title: "CF Ready",
                  enabled,
                  blockOnFailure: false,
                  shopifyFunction: { handle: "cf-ready-validation" },
                  metafield: { jsonValue: { ...CONFIG, entitlement } },
                },
              ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

// Nessuna sottoscrizione né acquisto: lo store è nella prova.
const SENZA_ADDEBITI = {
  data: {
    currentAppInstallation: {
      activeSubscriptions: [],
      oneTimePurchases: { nodes: [] },
    },
  },
};

function adminStub(responses: unknown[]) {
  const calls: string[] = [];
  return {
    calls,
    graphql: async (query: string) => {
      calls.push(
        query.includes("validationUpdate")
          ? "update"
          : query.includes("currentAppInstallation")
            ? "billing"
            : "context",
      );
      return Response.json(responses.shift());
    },
  };
}

async function appState(shopDomain: string) {
  return env.DB.prepare(
    `SELECT a.validation_gid, a.validation_enabled, a.config_schema_version, a.config_hash,
            a.last_error_code, s.installation_status, s.country_code
     FROM app_state a JOIN shops s ON s.id = a.shop_id
     WHERE s.shop_domain = ?`,
  )
    .bind(shopDomain)
    .first<Record<string, unknown>>();
}

test("uno store non italiano viene bloccato e la Validation disattivata", async () => {
  const shop = await insertShop("francia.example.myshopify.com");
  const admin = adminStub([
    shopContext("FR", true),
    { data: { validationUpdate: { userErrors: [] } } },
    shopContext("FR", false),
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.eligible).toBe(false);
  expect(state.validation?.enabled).toBe(false);
  expect(state.errorCode).toBeNull();
  expect(admin.calls).toEqual(["context", "update", "context"]);
  expect(await appState(shop)).toMatchObject({
    installation_status: "blocked_country",
    country_code: "FR",
    validation_enabled: 0,
    config_schema_version: 2,
    last_error_code: null,
    validation_gid: "gid://shopify/Validation/1",
  });
});

test("il rientro in Italia sblocca lo store senza riattivare la Validation", async () => {
  const shop = await insertShop("rientro.example.myshopify.com");
  await reconcile(
    adminStub([
      shopContext("FR", true),
      { data: { validationUpdate: { userErrors: [] } } },
      shopContext("FR", false),
    ]),
    env.DB,
    shop,
  );

  // Tornato idoneo, lo store ottiene la prova: l'entitlement va scritto nel metafield.
  const inProva = { kind: "trial", validThrough: trialEnd(localDate(FUSO)) };
  const admin = adminStub([
    shopContext("IT", false),
    SENZA_ADDEBITI,
    { data: { validationUpdate: { userErrors: [] } } },
    shopContext("IT", false, inProva),
  ]);
  const state = await reconcile(admin, env.DB, shop);

  expect(state.eligible).toBe(true);
  expect(state.entitlement).toEqual(inProva);
  expect(state.errorCode).toBeNull();
  expect(admin.calls).toEqual(["context", "billing", "update", "context"]);
  expect(await appState(shop)).toMatchObject({
    installation_status: "active",
    country_code: "IT",
    validation_enabled: 0,
  });
});

test("una disattivazione non riuscita resta fail-open e registra un codice errore", async () => {
  const shop = await insertShop("errore.example.myshopify.com");
  const admin = adminStub([
    shopContext("DE", true),
    { data: { validationUpdate: { userErrors: [{ message: "limite raggiunto" }] } } },
    shopContext("DE", true),
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.errorCode).toBe("validation_disable_failed");
  expect(await appState(shop)).toMatchObject({
    installation_status: "blocked_country",
    validation_enabled: 1,
    last_error_code: "validation_disable_failed",
  });
});

test("un webhook duplicato viene ignorato e un retry dopo errore viene rielaborato", async () => {
  const shop = await insertShop("webhook.example.myshopify.com");

  const first = await claimWebhook(env.DB, "wh-1", "SHOP_UPDATE", shop);
  expect(first.acquired).toBe(true);
  if (!first.acquired) throw new Error("claim non acquisito");
  expect(await claimWebhook(env.DB, "wh-1", "SHOP_UPDATE", shop)).toEqual({
    acquired: false,
    retry: true,
  });

  expect(await finishWebhook(env.DB, "wh-1", first.token, "failed", "unhandled_error")).toBe(true);
  const retry = await claimWebhook(env.DB, "wh-1", "SHOP_UPDATE", shop);
  expect(retry.acquired).toBe(true);
  if (!retry.acquired) throw new Error("retry non acquisito");

  expect(await finishWebhook(env.DB, "wh-1", retry.token, "processed")).toBe(true);
  expect(await claimWebhook(env.DB, "wh-1", "SHOP_UPDATE", shop)).toEqual({
    acquired: false,
    retry: false,
  });
});

test("un webhook rimasto processing viene riacquisito dopo cinque minuti", async () => {
  const shop = await insertShop("webhook-interrotto.example.myshopify.com");

  const first = await claimWebhook(
    env.DB,
    "wh-interrotto",
    "SHOP_UPDATE",
    shop,
    "2026-08-01T10:00:00.000Z",
    "claim-uno",
  );
  expect(first.acquired).toBe(true);
  expect(
    await claimWebhook(env.DB, "wh-interrotto", "SHOP_UPDATE", shop, "2026-08-01T10:04:59.999Z"),
  ).toEqual({ acquired: false, retry: true });
  const retry = await claimWebhook(
    env.DB,
    "wh-interrotto",
    "SHOP_UPDATE",
    shop,
    "2026-08-01T10:05:00.000Z",
    "claim-due",
  );
  expect(retry.acquired).toBe(true);
  if (!first.acquired || !retry.acquired) throw new Error("claim non acquisito");
  expect(await finishWebhook(env.DB, "wh-interrotto", first.token, "failed")).toBe(false);
  expect(await finishWebhook(env.DB, "wh-interrotto", retry.token, "processed")).toBe(true);
});

test("un claim ancora attivo mantiene la risposta ritentabile", async () => {
  const shop = await insertShop("webhook-in-corso.example.myshopify.com");
  await claimWebhook(env.DB, "wh-in-corso", "SHOP_UPDATE", shop);
  let handled = false;

  const response = await handleWebhook(
    env.DB,
    { webhookId: "wh-in-corso", topic: "SHOP_UPDATE", shop },
    async () => {
      handled = true;
    },
  );

  expect(response.status).toBe(500);
  expect(handled).toBe(false);
});

test("il replay della disinstallazione non tocca una reinstallazione successiva", async () => {
  const shop = await insertShop("uninstall-replay.example.myshopify.com");
  const first = await claimWebhook(
    env.DB,
    "wh-uninstall-replay",
    "APP_UNINSTALLED",
    shop,
    "2026-08-01T10:00:00.000Z",
    "claim-installazione-uno",
  );
  if (!first.acquired || !first.installationStartedAt) throw new Error("claim non acquisito");
  expect(await markUninstalled(env.DB, shop, first.installationStartedAt, first.receivedAt)).toBe(
    true,
  );

  await env.DB.prepare(
    `UPDATE shops SET installation_status = 'active', installed_at = ?, uninstalled_at = NULL
     WHERE shop_domain = ?`,
  )
    .bind("2026-08-01T10:01:00.000Z", shop)
    .run();
  await env.DB.prepare(
    `INSERT INTO shopify_sessions (
       id, shop_id, is_online, session_payload_ciphertext, created_at, updated_at
     ) SELECT 'offline_reinstallato', id, 0, 'x', ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind("2026-08-01T10:01:00.000Z", "2026-08-01T10:01:00.000Z", shop)
    .run();

  const response = await handleWebhook(
    env.DB,
    { webhookId: "wh-uninstall-replay", topic: "APP_UNINSTALLED", shop },
    async (claim) => {
      if (claim.installationStartedAt) {
        await markUninstalled(env.DB, shop, claim.installationStartedAt, claim.receivedAt);
      }
    },
  );

  expect(response.status).toBe(200);
  expect(
    await env.DB.prepare("SELECT installation_status FROM shops WHERE shop_domain = ?")
      .bind(shop)
      .first(),
  ).toMatchObject({ installation_status: "active" });
  expect(
    await env.DB.prepare(
      "SELECT id FROM shopify_sessions WHERE id = 'offline_reinstallato'",
    ).first(),
  ).not.toBeNull();
});

test("l'installazione è registrata una volta sola per ciclo di vita", async () => {
  const shop = await insertShop("token.example.myshopify.com");
  const installati = async () =>
    (
      await env.DB.prepare(
        `SELECT COUNT(*) AS totale FROM app_events
         WHERE event_name = 'app_installed'
           AND shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
      )
        .bind(shop)
        .first<{ totale: number }>()
    )?.totale;

  expect(await recordInstallOnce(env.DB, shop)).toBe(true);
  // Rinnovo del token: `afterAuth` riparte ma l'installazione è la stessa.
  expect(await recordInstallOnce(env.DB, shop)).toBe(false);
  expect(await installati()).toBe(1);

  await recordEvent(env.DB, { shopDomain: shop, name: "app_uninstalled", class: "lifecycle" });

  expect(await recordInstallOnce(env.DB, shop)).toBe(true);
  expect(await installati()).toBe(2);
});

test("un'installazione da uno store non ammesso non lascia nulla dietro", async () => {
  const shop = await insertShop("estraneo.example.myshopify.com");
  await env.DB.prepare(
    `INSERT INTO shopify_sessions (
       id, shop_id, is_online, session_payload_ciphertext, created_at, updated_at
     ) SELECT ?, id, 0, 'x', ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind(`offline_${shop}`, "2026-07-30T00:00:00.000Z", "2026-07-30T00:00:00.000Z", shop)
    .run();

  await refuseInstall(env.DB, shop);

  expect(
    await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?").bind(shop).first(),
  ).toBeNull();
  expect(
    await env.DB.prepare("SELECT id FROM shopify_sessions WHERE id = ?")
      .bind(`offline_${shop}`)
      .first(),
  ).toBeNull();
  // Il rifiuto resta tracciato, senza riferimento allo store cancellato.
  expect(
    await env.DB.prepare(
      "SELECT event_name, metadata_json FROM app_events WHERE event_name = 'install_refused'",
    ).first(),
  ).toMatchObject({ metadata_json: '{"reason":"shop_not_allowed"}' });
});

test("il redact non cancella uno store che ha reinstallato nel frattempo", async () => {
  const shop = await insertShop("reinstallato.example.myshopify.com");
  await claimWebhook(env.DB, "wh-redact-attivo", "SHOP_REDACT", shop);

  expect(await redactShop(env.DB, shop)).toBe(false);

  expect(
    await env.DB.prepare("SELECT installation_status FROM shops WHERE shop_domain = ?")
      .bind(shop)
      .first(),
  ).toMatchObject({ installation_status: "active" });
  expect(
    await env.DB.prepare("SELECT shop_domain FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-redact-attivo")
      .first(),
  ).toMatchObject({ shop_domain: shop });
});

test("disinstallazione e redact ripuliscono i dati dello store", async () => {
  const shop = await insertShop("redact.example.myshopify.com");
  await recordEvent(env.DB, { shopDomain: shop, name: "app_installed", class: "lifecycle" });
  await claimWebhook(env.DB, "wh-redact", "SHOP_REDACT", shop);
  const shopId = (
    await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?")
      .bind(shop)
      .first<{ id: number }>()
  )?.id;
  await reconcile(
    adminStub([
      shopContext("IT", true),
      SENZA_ADDEBITI,
      { data: { validationUpdate: { userErrors: [] } } },
      shopContext("IT", true, { kind: "trial", validThrough: trialEnd(localDate(FUSO)) }),
    ]),
    env.DB,
    shop,
  );

  await markUninstalled(env.DB, shop, "2026-07-30T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
  expect(
    await env.DB.prepare(
      "SELECT installation_status, uninstalled_at FROM shops WHERE shop_domain = ?",
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ installation_status: "uninstalled" });
  expect(await appState(shop)).toMatchObject({ validation_enabled: 0, validation_gid: null });

  expect(await redactShop(env.DB, shop)).toBe(true);

  expect(
    await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?").bind(shop).first(),
  ).toBeNull();
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS total FROM app_events WHERE shop_id = ?")
      .bind(shopId)
      .first<{ total: number }>(),
  ).toMatchObject({ total: 0 });
  expect(
    await env.DB.prepare("SELECT shop_domain, topic FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-redact")
      .first(),
  ).toMatchObject({ shop_domain: null, topic: "SHOP_REDACT" });
});

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

  // Ripercorrerla avanza davvero, senza far ricomparire la checklist della Home.
  await saveOnboarding(env.DB, shop, { status: "in_progress", step: 2 });
  expect((await readOnboarding(env.DB, shop)).step).toBe(2);
  // §15.9: la procedura resta riapribile, ma ripercorrerla non la riapre davvero: lo stato non
  // torna indietro, altrimenti la checklist della Home ricomparirebbe (D-063).
  const state = await readOnboarding(env.DB, shop);
  expect(state.status).toBe("completed");
});
