import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import { recordEvent } from "../../app/events.server";
import { markUninstalled } from "../../app/shop.server";
import {
  claimWebhook,
  consumeWebhookMessage,
  errorCode,
  failClaimedWebhook,
  finishWebhook,
  handleWebhook,
  renewWebhookClaim,
  runClaimedWebhook,
} from "../../app/webhooks.server";
import type { WebhookJob } from "../../app/webhooks.server";
import { webhookQueue, insertShop } from "../support/lifecycle";

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
    webhookQueue(() => {
      handled = true;
    }),
  );

  expect(response.status).toBe(500);
  expect(handled).toBe(false);
});

test("un webhook già elaborato risponde senza accodare un duplicato", async () => {
  const shop = await insertShop("webhook-completato.example.myshopify.com");
  const claim = await claimWebhook(env.DB, "wh-completato", "SHOP_UPDATE", shop);
  if (!claim.acquired) throw new Error("claim non acquisito");
  await finishWebhook(env.DB, "wh-completato", claim.token, "processed");
  const send = vi.fn();

  const response = await handleWebhook(
    env.DB,
    { webhookId: "wh-completato", topic: "SHOP_UPDATE", shop },
    { send } as never,
  );

  expect(response.status).toBe(200);
  expect(send).not.toHaveBeenCalled();
});

test("risponde prima che l'elaborazione asincrona del webhook termini", async () => {
  const shop = await insertShop("webhook-ack.example.myshopify.com");
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let job: WebhookJob | undefined;

  const response = await handleWebhook(
    env.DB,
    { webhookId: "wh-ack", topic: "SHOP_UPDATE", shop },
    webhookQueue((queued) => {
      job = queued;
    }),
  );

  expect(response.status).toBe(200);
  expect(job).toBeDefined();
  expect(
    await env.DB.prepare("SELECT status FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-ack")
      .first(),
  ).toMatchObject({ status: "processing" });

  const processing = runClaimedWebhook(env.DB, job!, async () => blocked);
  release();
  await processing;
  expect(
    await env.DB.prepare("SELECT status FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-ack")
      .first(),
  ).toMatchObject({ status: "processed" });
});

test("un errore del consumer lascia il claim disponibile al retry della coda", async () => {
  const shop = await insertShop("webhook-queue-retry.example.myshopify.com");
  let job: WebhookJob | undefined;
  await handleWebhook(
    env.DB,
    { webhookId: "wh-queue-retry", topic: "SHOP_UPDATE", shop },
    webhookQueue((queued) => {
      job = queued;
    }),
  );

  await expect(
    runClaimedWebhook(env.DB, job!, async () => {
      throw new Error("d1_transient");
    }),
  ).rejects.toThrow("d1_transient");
  expect(
    await env.DB.prepare("SELECT status FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-queue-retry")
      .first(),
  ).toMatchObject({ status: "processing" });

  await runClaimedWebhook(env.DB, job!, async () => undefined);
  expect(
    await env.DB.prepare("SELECT status FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-queue-retry")
      .first(),
  ).toMatchObject({ status: "processed" });
});

test("la finalizzazione in DLQ non perde il webhook se D1 è indisponibile", async () => {
  const shop = await insertShop("webhook-dlq.example.myshopify.com");
  let job: WebhookJob | undefined;
  await handleWebhook(
    env.DB,
    { webhookId: "wh-dlq", topic: "SHOP_UPDATE", shop },
    webhookQueue((queued) => {
      job = queued;
    }),
  );
  const ack = vi.fn();
  const retry = vi.fn();
  const message = { body: job!, attempts: 3, ack, retry } as unknown as Message<WebhookJob>;
  const unavailable = new Proxy(env.DB, {
    get() {
      throw new Error("d1_unavailable");
    },
  });

  await consumeWebhookMessage(unavailable, message, true, vi.fn());
  expect(ack).not.toHaveBeenCalled();
  expect(retry).toHaveBeenCalledWith({ delaySeconds: 60 });

  await consumeWebhookMessage(env.DB, message, true, vi.fn());
  expect(ack).toHaveBeenCalledOnce();
  expect(
    await env.DB.prepare("SELECT status, error_code FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-dlq")
      .first(),
  ).toMatchObject({ status: "failed", error_code: "queue_retries_exhausted" });
});

test("la DLQ prolunga il retry oltre la durata della lease Validation", async () => {
  const process = vi
    .fn<(db: D1Database, job: WebhookJob) => Promise<void>>()
    .mockRejectedValueOnce(new Error("validation_locked"))
    .mockResolvedValueOnce();
  const job = { webhookId: "wh-lease", claimToken: "claim", shop: "shop.example" };
  const ack = vi.fn();
  const retry = vi.fn();

  await consumeWebhookMessage(
    env.DB,
    { body: job, attempts: 1, ack, retry } as unknown as Message<WebhookJob>,
    true,
    process,
  );
  expect(retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  expect(ack).not.toHaveBeenCalled();

  await consumeWebhookMessage(
    env.DB,
    { body: job, attempts: 2, ack, retry } as unknown as Message<WebhookJob>,
    true,
    process,
  );
  expect(process).toHaveBeenCalledTimes(2);
  expect(ack).toHaveBeenCalledOnce();
});

test("il replay dello stesso webhook non duplica i suoi eventi", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
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
  expect(info.mock.calls.filter(([record]) => record.event === event.name)).toHaveLength(1);
  info.mockRestore();
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

  let job: WebhookJob | undefined;
  const response = await handleWebhook(
    db,
    { webhookId: "wh-heartbeat-transitorio", topic: "SHOP_UPDATE", shop },
    webhookQueue((queued) => {
      job = queued;
    }),
  );

  expect(response.status).toBe(200);
  await runClaimedWebhook(db, job!, async () => undefined);
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

  let job: WebhookJob | undefined;
  const response = await handleWebhook(
    env.DB,
    {
      webhookId: "wh-uninstall-replay",
      topic: "APP_UNINSTALLED",
      shop,
      triggeredAt: "2026-08-01T10:00:00.000Z",
    },
    webhookQueue((queued) => {
      job = queued;
    }),
  );
  await runClaimedWebhook(env.DB, job!, async (claim) => {
    if (claim.installationStartedAt) {
      await markUninstalled(env.DB, shop, claim.installationStartedAt, "wh-uninstall-replay");
    }
  });

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

test("rifiuta in modo ritentabile un webhook quando la coda non è configurata", async () => {
  const response = await handleWebhook(
    env.DB,
    { webhookId: "wh-no-queue", topic: "SHOP_UPDATE", shop: "no-queue.myshopify.com" },
    undefined,
  );

  expect(response.status).toBe(500);
  expect(
    await env.DB.prepare("SELECT webhook_id FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-no-queue")
      .first(),
  ).toBeNull();
});

test("marca il claim fallito quando la coda rifiuta l'enqueue", async () => {
  const shop = await insertShop("webhook-enqueue-fallito.example.myshopify.com");
  const response = await handleWebhook(
    env.DB,
    { webhookId: "wh-enqueue-fallito", topic: "SHOP_UPDATE", shop },
    {
      send: vi.fn(async () => {
        throw new Error("queue_unavailable");
      }),
    } as unknown as Queue<WebhookJob>,
  );

  expect(response.status).toBe(500);
  expect(
    await env.DB.prepare("SELECT status, error_code FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-enqueue-fallito")
      .first(),
  ).toMatchObject({ status: "failed", error_code: "queue_enqueue_failed" });
  expect(
    await env.DB.prepare(
      `SELECT event_name FROM app_events
       WHERE webhook_id = ? AND event_name = 'webhook_failed'`,
    )
      .bind("wh-enqueue-fallito")
      .first(),
  ).toMatchObject({ event_name: "webhook_failed" });
});

test("rifiuta una disinstallazione senza timestamp prima di creare il claim", async () => {
  const result = await claimWebhook(
    env.DB,
    "wh-uninstall-senza-timestamp",
    "APP_UNINSTALLED",
    "uninstall-senza-timestamp.myshopify.com",
  );

  expect(result).toEqual({ acquired: false, retry: true });
  expect(
    await env.DB.prepare("SELECT webhook_id FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-uninstall-senza-timestamp")
      .first(),
  ).toBeNull();
});

test("un handler che perde il claim non sovrascrive il nuovo proprietario", async () => {
  const shop = await insertShop("webhook-claim-perso.example.myshopify.com");
  const claim = await claimWebhook(env.DB, "wh-claim-perso", "SHOP_UPDATE", shop);
  if (!claim.acquired) throw new Error("claim non acquisito");

  await expect(
    runClaimedWebhook(
      env.DB,
      { webhookId: "wh-claim-perso", claimToken: claim.token, shop },
      async () => {
        await env.DB.prepare("UPDATE webhook_events SET claim_token = ? WHERE webhook_id = ?")
          .bind("claim-nuovo-proprietario", "wh-claim-perso")
          .run();
      },
    ),
  ).rejects.toThrow("webhook_claim_lost");
  expect(
    await env.DB.prepare("SELECT status, claim_token FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-claim-perso")
      .first(),
  ).toMatchObject({ status: "processing", claim_token: "claim-nuovo-proprietario" });
});

test("un errore nella coda primaria usa il retry breve", async () => {
  const retry = vi.fn();
  const ack = vi.fn();
  const process = vi.fn(async () => {
    throw new Error("transient_queue_error");
  });

  await consumeWebhookMessage(
    env.DB,
    {
      body: { webhookId: "wh-primary", claimToken: "claim", shop: "primary.myshopify.com" },
      attempts: 1,
      ack,
      retry,
    } as unknown as Message<WebhookJob>,
    false,
    process,
  );

  expect(retry).toHaveBeenCalledWith({ delaySeconds: 10 });
  expect(ack).not.toHaveBeenCalled();
});

test("un job con claim non più posseduto non esegue né handler né finalizzazione", async () => {
  const job = {
    webhookId: "wh-claim-assente",
    claimToken: "claim-assente",
    shop: "claim-assente.myshopify.com",
  };
  const handler = vi.fn();

  await expect(runClaimedWebhook(env.DB, job, handler)).resolves.toBeUndefined();
  await expect(failClaimedWebhook(env.DB, job, new Error("ignored"))).resolves.toBeUndefined();
  expect(handler).not.toHaveBeenCalled();
});

test("usa lo shop del job per un evento legacy privo di dominio", async () => {
  await env.DB.prepare(
    `INSERT INTO webhook_events (
       webhook_id, shop_domain, topic, status, received_at, claim_token
     ) VALUES (?, NULL, 'SHOP_UPDATE', 'processing', ?, ?)`,
  )
    .bind("wh-shop-fallback", "2026-08-01T10:00:00.000Z", "claim-shop-fallback")
    .run();
  const handler = vi.fn();

  await runClaimedWebhook(
    env.DB,
    {
      webhookId: "wh-shop-fallback",
      claimToken: "claim-shop-fallback",
      shop: "fallback.myshopify.com",
    },
    handler,
  );

  expect(handler).toHaveBeenCalledWith(expect.objectContaining({ shop: "fallback.myshopify.com" }));
});

test.each([
  [new Response(null, { status: 503 }), "response_503"],
  [new Error("validation_locked"), "validation_locked"],
  [new Error("Messaggio non stabile"), "unhandled_error"],
  [{ message: "private_value" }, "unhandled_error"],
] as const)("normalizza gli errori webhook senza esporre dati: %s", (error, expected) => {
  expect(errorCode(error)).toBe(expected);
});
