import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import { logEvent, recordEvent } from "../app/events.server";
import {
  applyRetention,
  markUninstalled,
  recordInstallOnce,
  redactExpiredShops,
  redactShop,
  refuseInstall,
} from "../app/shop.server";
import { localDate, trialEnd } from "../app/billing.server";
import { readOnboarding, reconcile, saveOnboarding } from "../app/validation.server";
import {
  claimWebhook,
  finishWebhook,
  handleWebhook,
  renewWebhookClaim,
} from "../app/webhooks.server";

const CONFIG = { schemaVersion: 2, rules: { taxCode: "required_validated" } };

test("i log conservano errori e webhook e campionano gli eventi ordinari", () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const occurredAt = "2026-08-02T00:00:00.000Z";

  logEvent(
    { name: "ordinary", class: "billing", shopDomain: "secret.myshopify.com" },
    occurredAt,
    1,
  );
  logEvent({ name: "sampled", class: "billing" }, occurredAt, 0.09);
  logEvent({ name: "webhook", class: "lifecycle", webhookId: "wh-1" }, occurredAt, 1);
  logEvent({ name: "failure", class: "error" }, occurredAt, 1);

  expect(info).toHaveBeenCalledTimes(2);
  expect(info.mock.calls[0][0]).toMatchObject({ event: "sampled", class: "billing" });
  expect(info.mock.calls[1][0]).toMatchObject({
    event: "webhook",
    correlation_id: "wh-1",
    webhook: true,
  });
  expect(JSON.stringify(info.mock.calls)).not.toContain("secret.myshopify.com");
  expect(error).toHaveBeenCalledOnce();

  info.mockRestore();
  error.mockRestore();
});

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

test("gli eventi lifecycle inseriti direttamente raggiungono i log una volta sola", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const shop = await insertShop("log-diretti.example.myshopify.com");
  const installedAt = "2026-07-30T00:00:00.000Z";

  expect(await markUninstalled(env.DB, shop, installedAt, "wh-log-uninstall")).toBe(true);
  expect(await markUninstalled(env.DB, shop, installedAt, "wh-log-uninstall")).toBe(false);
  expect(await redactShop(env.DB, shop, "wh-log-redact")).toBe(true);
  expect(await redactShop(env.DB, shop, "wh-log-redact")).toBe(true);

  expect(
    info.mock.calls.map(([record]) => ({
      event: record.event,
      correlation_id: record.correlation_id,
      webhook: record.webhook,
    })),
  ).toEqual([
    { event: "app_uninstalled", correlation_id: "wh-log-uninstall", webhook: true },
    { event: "shop_redacted", correlation_id: "wh-log-redact", webhook: true },
  ]);
  info.mockRestore();
});

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
      oneTimePurchases: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
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

test("un readback senza Validation non conserva lo stato attivo precedente", async () => {
  const shop = await insertShop("validation-rimossa.example.myshopify.com");
  const admin = adminStub([
    shopContext("IT", true),
    SENZA_ADDEBITI,
    { data: { validationUpdate: { userErrors: [] } } },
    shopContext("IT", null),
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.validation).toBeUndefined();
  expect(state.validationEnabled).toBe(false);
  expect(await appState(shop)).toMatchObject({
    validation_gid: null,
    validation_enabled: 0,
  });
});

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

test("un claim disinstallazione precedente alla migrazione non acquisisce una reinstallazione", async () => {
  const shop = await insertShop("webhook-pre-migration.example.myshopify.com");
  await env.DB.prepare(
    `INSERT INTO webhook_events (
       webhook_id, shop_domain, topic, status, received_at
     ) VALUES (?, ?, 'APP_UNINSTALLED', 'processing', ?)`,
  )
    .bind("wh-uninstall-legacy", shop, "2026-08-01T10:00:00.000Z")
    .run();
  await env.DB.prepare("UPDATE shops SET installed_at = ? WHERE shop_domain = ?")
    .bind("2026-08-01T10:01:00.000Z", shop)
    .run();

  const retry = await claimWebhook(
    env.DB,
    "wh-uninstall-legacy",
    "APP_UNINSTALLED",
    shop,
    "2026-08-01T10:05:00.000Z",
    undefined,
    "2026-08-01T10:00:00.000Z",
  );

  expect(retry.acquired).toBe(true);
  if (!retry.acquired) throw new Error("claim non acquisito");
  expect(retry.installationStartedAt).toBeNull();
  expect(
    await env.DB.prepare("SELECT installation_status FROM shops WHERE shop_domain = ?")
      .bind(shop)
      .first(),
  ).toMatchObject({ installation_status: "active" });
});

test("il heartbeat impedisce un secondo handler mentre il primo è vivo", async () => {
  const shop = await insertShop("webhook-heartbeat.example.myshopify.com");
  const first = await claimWebhook(
    env.DB,
    "wh-heartbeat",
    "SHOP_UPDATE",
    shop,
    "2026-08-01T10:00:00.000Z",
    "claim-uno",
  );
  if (!first.acquired) throw new Error("claim non acquisito");

  expect(
    await renewWebhookClaim(env.DB, "wh-heartbeat", first.token, "2026-08-01T10:04:00.000Z"),
  ).toBe(true);
  expect(
    await claimWebhook(env.DB, "wh-heartbeat", "SHOP_UPDATE", shop, "2026-08-01T10:06:00.000Z"),
  ).toEqual({ acquired: false, retry: true });
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

test("il replay dello stesso webhook non duplica i suoi eventi", async () => {
  const shop = await insertShop("webhook-evento.example.myshopify.com");
  const event = {
    shopDomain: shop,
    webhookId: "wh-evento-idempotente",
    name: "shop_updated",
    class: "lifecycle" as const,
  };

  await recordEvent(env.DB, event);
  await recordEvent(env.DB, event);

  expect(
    await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM app_events
       WHERE webhook_id = ? AND event_name = ?`,
    )
      .bind(event.webhookId, event.name)
      .first(),
  ).toMatchObject({ total: 1 });
});

test("un errore transitorio del heartbeat non abbandona un claim ancora posseduto", async () => {
  const shop = await insertShop("webhook-heartbeat-transitorio.example.myshopify.com");
  let failRenewal = true;
  const db = new Proxy(env.DB, {
    get(target, property) {
      if (property === "prepare") {
        return (query: string) => {
          const statement = target.prepare(query);
          if (!query.includes("received_at = ?")) return statement;

          const wrap = (current: D1PreparedStatement): D1PreparedStatement =>
            new Proxy(current, {
              get(statementTarget, statementProperty) {
                if (statementProperty === "bind") {
                  return (...values: unknown[]) => wrap(statementTarget.bind(...values));
                }
                if (statementProperty === "first") {
                  return async () => {
                    if (failRenewal) {
                      failRenewal = false;
                      throw new Error("d1_transient");
                    }
                    return statementTarget.first();
                  };
                }
                const value = Reflect.get(statementTarget, statementProperty, statementTarget);
                return typeof value === "function" ? value.bind(statementTarget) : value;
              },
            });
          return wrap(statement);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as D1Database;

  const response = await handleWebhook(
    db,
    { webhookId: "wh-heartbeat-transitorio", topic: "SHOP_UPDATE", shop },
    async () => undefined,
  );

  expect(response.status).toBe(200);
  expect(failRenewal).toBe(false);
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
    "2026-08-01T10:00:00.000Z",
  );
  if (!first.acquired || !first.installationStartedAt) throw new Error("claim non acquisito");
  expect(
    await markUninstalled(env.DB, shop, first.installationStartedAt, "wh-uninstall-replay"),
  ).toBe(true);
  expect(
    await markUninstalled(env.DB, shop, first.installationStartedAt, "wh-uninstall-replay"),
  ).toBe(false);

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
    {
      webhookId: "wh-uninstall-replay",
      topic: "APP_UNINSTALLED",
      shop,
      triggeredAt: "2026-08-01T10:00:00.000Z",
    },
    async (claim) => {
      if (claim.installationStartedAt) {
        await markUninstalled(env.DB, shop, claim.installationStartedAt, "wh-uninstall-replay");
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

test("una disinstallazione senza timestamp autenticato resta ritentabile", async () => {
  const shop = await insertShop("uninstall-senza-timestamp.example.myshopify.com");
  const response = await handleWebhook(
    env.DB,
    { webhookId: "wh-uninstall-senza-timestamp", topic: "APP_UNINSTALLED", shop },
    async () => {
      throw new Error("handler non atteso");
    },
  );

  expect(response.status).toBe(500);
  expect(
    await env.DB.prepare("SELECT webhook_id FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-uninstall-senza-timestamp")
      .first(),
  ).toBeNull();
});

test("la prima consegna tardiva della disinstallazione non tocca la reinstallazione", async () => {
  const shop = await insertShop("uninstall-tardivo.example.myshopify.com");
  await env.DB.prepare("UPDATE shops SET installed_at = ? WHERE shop_domain = ?")
    .bind("2026-08-01T10:10:00.000Z", shop)
    .run();
  await env.DB.prepare(
    `INSERT INTO shopify_sessions (
       id, shop_id, is_online, session_payload_ciphertext, created_at, updated_at
     ) SELECT 'offline_tardivo', id, 0, 'x', ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind("2026-08-01T10:10:00.000Z", "2026-08-01T10:10:00.000Z", shop)
    .run();

  const response = await handleWebhook(
    env.DB,
    {
      webhookId: "wh-uninstall-prima-consegna-tardiva",
      topic: "APP_UNINSTALLED",
      shop,
      triggeredAt: "2026-08-01T10:00:00.000Z",
    },
    async (claim) => {
      if (claim.installationStartedAt) {
        await markUninstalled(
          env.DB,
          shop,
          claim.installationStartedAt,
          "wh-uninstall-prima-consegna-tardiva",
        );
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
    await env.DB.prepare("SELECT id FROM shopify_sessions WHERE id = 'offline_tardivo'").first(),
  ).not.toBeNull();
});

test("la disinstallazione completa stato ed evento anche da uno stato parziale", async () => {
  const shop = await insertShop("uninstall-parziale.example.myshopify.com");
  const installedAt = "2026-08-01T10:00:00.000Z";
  await env.DB.prepare(
    `UPDATE shops SET installation_status = 'blocked_country', installed_at = ?
     WHERE shop_domain = ?`,
  )
    .bind(installedAt, shop)
    .run();

  expect(await markUninstalled(env.DB, shop, installedAt, "wh-uninstall-parziale")).toBe(true);
  expect(await markUninstalled(env.DB, shop, installedAt, "wh-uninstall-parziale")).toBe(false);
  expect(
    await env.DB.prepare(
      `SELECT installation_status,
              (SELECT COUNT(*) FROM app_events event
               WHERE event.shop_id = shops.id AND event.event_name = 'app_uninstalled') AS events
       FROM shops WHERE shop_domain = ?`,
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ installation_status: "uninstalled", events: 1 });
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

  expect(await redactShop(env.DB, shop, "wh-redact-attivo")).toBe(false);

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

test("il retry redact anonimizza una ricevuta pre-migrazione dopo la cancellazione", async () => {
  const shop = await insertShop("redact-pre-migration.example.myshopify.com");
  await claimWebhook(env.DB, "wh-redact-pre-migration", "SHOP_REDACT", shop);
  await claimWebhook(env.DB, "wh-update-pre-migration", "SHOP_UPDATE", shop);
  await env.DB.prepare("DELETE FROM shops WHERE shop_domain = ?").bind(shop).run();

  expect(await redactShop(env.DB, shop, "wh-redact-pre-migration")).toBe(true);
  expect(await redactShop(env.DB, shop, "wh-redact-pre-migration")).toBe(true);
  expect(
    await env.DB.prepare("SELECT shop_domain FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-redact-pre-migration")
      .first(),
  ).toMatchObject({ shop_domain: null });
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS total FROM webhook_events WHERE shop_domain = ?")
      .bind(shop)
      .first(),
  ).toMatchObject({ total: 0 });
  expect(
    await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM app_events
       WHERE webhook_id = 'wh-redact-pre-migration' AND event_name = 'shop_redacted'`,
    ).first(),
  ).toMatchObject({ total: 1 });
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

  await markUninstalled(env.DB, shop, "2026-07-30T00:00:00.000Z", "wh-uninstall-redact");
  expect(
    await env.DB.prepare(
      "SELECT installation_status, uninstalled_at FROM shops WHERE shop_domain = ?",
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ installation_status: "uninstalled" });
  expect(await appState(shop)).toMatchObject({ validation_enabled: 0, validation_gid: null });

  expect(await redactShop(env.DB, shop, "wh-redact")).toBe(true);
  expect(await redactShop(env.DB, shop, "wh-redact")).toBe(true);

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
  expect(
    await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM app_events
       WHERE webhook_id = 'wh-redact' AND event_name = 'shop_redacted'`,
    ).first(),
  ).toMatchObject({ total: 1 });
});

test("la retention elimina solo gli store disinstallati da almeno 90 giorni", async () => {
  const expired = await insertShop("retention-expired.example.myshopify.com");
  const recent = await insertShop("retention-recent.example.myshopify.com");
  const active = await insertShop("retention-active.example.myshopify.com");

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE shops SET installation_status = 'uninstalled', uninstalled_at = ?
         WHERE shop_domain = ?`,
    ).bind("2026-05-04T00:00:00.000Z", expired),
    env.DB.prepare(
      `UPDATE shops SET installation_status = 'uninstalled', uninstalled_at = ?
         WHERE shop_domain = ?`,
    ).bind("2026-05-04T00:00:00.001Z", recent),
    env.DB.prepare("UPDATE shops SET uninstalled_at = ? WHERE shop_domain = ?").bind(
      "2026-05-01T00:00:00.000Z",
      active,
    ),
    env.DB.prepare(
      `INSERT INTO webhook_events (webhook_id, shop_domain, topic, status, received_at)
         VALUES ('wh-retention', ?, 'APP_UNINSTALLED', 'processed', ?)`,
    ).bind(expired, "2026-05-04T00:00:00.000Z"),
  ]);

  expect(await redactExpiredShops(env.DB, new Date("2026-08-02T00:00:00.000Z"))).toBe(1);
  expect(
    await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?").bind(expired).first(),
  ).toBeNull();
  expect(
    await env.DB.prepare("SELECT shop_domain FROM shops WHERE shop_domain = ?")
      .bind(recent)
      .first(),
  ).toMatchObject({ shop_domain: recent });
  expect(
    await env.DB.prepare("SELECT installation_status FROM shops WHERE shop_domain = ?")
      .bind(active)
      .first(),
  ).toMatchObject({ installation_status: "active" });
  expect(
    await env.DB.prepare("SELECT shop_domain FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-retention")
      .first(),
  ).toMatchObject({ shop_domain: null });
});

test("la retention rispetta le soglie pubblicate per eventi e ricevute", async () => {
  const shop = await insertShop("retention-events.example.myshopify.com");
  const shopId = (await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?")
    .bind(shop)
    .first<{ id: number }>())!.id;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO webhook_events (webhook_id, topic, status, received_at)
       VALUES ('receipt-expired', 'SHOP_UPDATE', 'processed', '2026-05-04T00:00:00.000Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO webhook_events (webhook_id, topic, status, received_at)
       VALUES ('receipt-current', 'SHOP_UPDATE', 'processed', '2026-05-04T00:00:00.001Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO app_events (event_name, event_class, occurred_at)
       VALUES ('error-expired', 'error', '2026-05-04T00:00:00.000Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO app_events (event_name, event_class, occurred_at)
       VALUES ('error-current', 'error', '2026-05-04T00:00:00.001Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO app_events (event_name, event_class, occurred_at)
       VALUES ('event-expired', 'lifecycle', '2025-08-02T00:00:00.000Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO app_events (event_name, event_class, occurred_at)
       VALUES ('event-current', 'lifecycle', '2025-08-02T00:00:00.001Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO billing_events (
           shop_id, shopify_resource_gid, event_type, status, occurred_at, created_at
         ) VALUES (?, 'gid://expired', 'subscription', 'active', ?, ?)`,
    ).bind(shopId, "2025-08-02T00:00:00.000Z", "2025-08-02T00:00:00.000Z"),
    env.DB.prepare(
      `INSERT INTO billing_events (
           shop_id, shopify_resource_gid, event_type, status, occurred_at, created_at
         ) VALUES (?, 'gid://current', 'subscription', 'active', ?, ?)`,
    ).bind(shopId, "2025-08-02T00:00:00.001Z", "2025-08-02T00:00:00.001Z"),
  ]);

  expect((await applyRetention(env.DB, new Date("2026-08-02T00:00:00.000Z"))).shops).toBe(0);
  expect(
    (
      await env.DB.prepare(
        `SELECT webhook_id AS value FROM webhook_events WHERE webhook_id LIKE 'receipt-%'
         UNION ALL SELECT event_name FROM app_events WHERE event_name LIKE 'error-%' OR event_name LIKE 'event-%'
         UNION ALL SELECT shopify_resource_gid FROM billing_events WHERE shopify_resource_gid LIKE 'gid://%'
         ORDER BY value`,
      ).all<{ value: string }>()
    ).results.map(({ value }) => value),
  ).toEqual(["error-current", "event-current", "gid://current", "receipt-current"]);
});

test("la retention limita ogni esecuzione a 25 store", async () => {
  for (let index = 0; index < 26; index += 1) {
    const shop = await insertShop(`retention-batch-${index}.example.myshopify.com`);
    await env.DB.prepare(
      `UPDATE shops SET installation_status = 'uninstalled', uninstalled_at = ?
       WHERE shop_domain = ?`,
    )
      .bind("2020-01-01T00:00:00.000Z", shop)
      .run();
  }

  expect(await redactExpiredShops(env.DB, new Date("2026-08-02T00:00:00.000Z"))).toBe(25);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM shops WHERE shop_domain LIKE 'retention-batch-%'",
    ).first(),
  ).toMatchObject({ total: 1 });
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

  // Un progress tardivo non può riportare il passo a quattro dopo la chiusura. La procedura
  // resta ripercorribile nello stato locale, ma una nuova apertura riparte sempre dal primo.
  await saveOnboarding(env.DB, shop, { status: "in_progress", step: 2 });
  expect((await readOnboarding(env.DB, shop)).step).toBe(1);
  // §15.9: la procedura resta riapribile, ma ripercorrerla non la riapre davvero: lo stato non
  // torna indietro, altrimenti la checklist della Home ricomparirebbe (D-063).
  const state = await readOnboarding(env.DB, shop);
  expect(state.status).toBe("completed");
});
