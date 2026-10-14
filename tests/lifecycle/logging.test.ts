import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import { logEvent, recordEvent } from "../../app/events.server";
import { markUninstalled, redactShop } from "../../app/shop.server";
import { insertShop } from "../support/lifecycle";

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

test("gli eventi lifecycle inseriti direttamente raggiungono i log una volta sola", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const shop = await insertShop("log-diretti.example.myshopify.com");
  const installedAt = "2026-07-30T00:00:00.000Z";

  const uninstalls = () =>
    env.DB.prepare(
      "SELECT value FROM owner_metric_counters WHERE metric = 'app_uninstalled'",
    ).first<number>("value");
  const before = await uninstalls();

  expect(await markUninstalled(env.DB, shop, installedAt, "wh-log-uninstall")).toBe(true);
  expect(await markUninstalled(env.DB, shop, installedAt, "wh-log-uninstall")).toBe(false);
  expect(await redactShop(env.DB, shop, "wh-log-redact")).toBe(true);
  expect(await redactShop(env.DB, shop, "wh-log-redact")).toBe(true);
  // Il contatore aggregato sale una volta e sopravvive alla cancellazione dello store.
  expect(await uninstalls()).toBe(before! + 1);
  // Lo snapshot anonimo resta dopo `shop/redact`, senza nome né dominio.
  const history = await env.DB.prepare("SELECT * FROM uninstall_history").all();
  expect(history.results).toEqual([
    {
      id: expect.any(Number),
      uninstalled_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      installed_days: expect.any(Number),
      store_kind: "merchant",
      billing_category: "trial_never",
      validation_enabled: 0,
      onboarding_completed: 0,
    },
  ]);

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

test("lo snapshot legge Validation, onboarding e review prima di azzerarli", async () => {
  const shop = await insertShop("app-review-c0d01c8a-r1-a0-primary.myshopify.com");
  const installedAt = "2026-07-30T00:00:00.000Z";
  const review = () =>
    env.DB.prepare(
      "SELECT review_value FROM owner_metric_counters WHERE metric = 'app_uninstalled'",
    ).first<number>("review_value");
  const before = await review();
  await env.DB.prepare(
    `INSERT INTO app_state (shop_id, validation_enabled, onboarding_status, updated_at)
     SELECT id, 1, 'completed', ? FROM shops WHERE shop_domain = ?`,
  )
    .bind(installedAt, shop)
    .run();

  expect(await markUninstalled(env.DB, shop, installedAt, "wh-review-uninstall")).toBe(true);
  expect(await markUninstalled(env.DB, shop, installedAt, "wh-review-uninstall")).toBe(false);

  expect(await review()).toBe(before! + 1);
  expect(
    await env.DB.prepare(
      `SELECT store_kind, validation_enabled, onboarding_completed FROM uninstall_history
       ORDER BY id DESC LIMIT 1`,
    ).first(),
  ).toEqual({ store_kind: "review", validation_enabled: 1, onboarding_completed: 1 });
});

test("un errore di persistenza produce soltanto un evento tecnico sanitizzato", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const database = {
    prepare() {
      throw new Error("dettaglio database riservato");
    },
  };

  await recordEvent(database as unknown as D1Database, {
    name: "evento_non_persistito",
    class: "support",
  });
  const unsuccessfulStatement = {
    bind() {
      return this;
    },
    async run() {
      return { success: false, meta: { changes: 0 } };
    },
  };
  await recordEvent({ prepare: () => unsuccessfulStatement } as unknown as D1Database, {
    name: "evento_rifiutato",
    class: "support",
  });

  expect(error).toHaveBeenCalledTimes(2);
  expect(error.mock.calls[0][0]).toMatchObject({
    event: "app_event_write_failed",
    class: "error",
  });
  expect(JSON.stringify(error.mock.calls)).not.toContain("dettaglio database riservato");
  error.mockRestore();
});

test("un evento idempotente già presente non viene registrato di nuovo", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const statement = {
    bind() {
      return this;
    },
    async run() {
      return { success: true, meta: { changes: 0 } };
    },
  };
  const database = { prepare: () => statement };

  await recordEvent(database as unknown as D1Database, {
    webhookId: "wh-duplicato",
    name: "evento_idempotente",
    class: "lifecycle",
  });

  expect(info).not.toHaveBeenCalled();
  info.mockRestore();
});
