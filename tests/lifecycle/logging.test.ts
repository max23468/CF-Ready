import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import { logEvent } from "../../app/events.server";
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
