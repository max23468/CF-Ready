import { env } from "cloudflare:test";
import type { ActionFunctionArgs } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { authenticateAdmin } from "../app/admin-auth.server";
import {
  normalizeFeedbackText,
  normalizeUninstallFeedback,
  parseEngagementHeaders,
  readInstallationEngagement,
  readInstallationStartedAt,
  readUninstallFeedback,
  recordInstallationEngagement,
  saveUninstallFeedback,
  uninstallFeedbackSection,
  type FeedbackEvent,
} from "../app/installation-diagnostics.server";
import { findShops } from "../app/owner-control/queries.server";
import { diagnosticShopMessage } from "../app/owner-control/shop-diagnostics.server";
import { pollPartnerEvents } from "../app/owner-notifications/partner-source.server";
import { deliverOwnerNotifications } from "../app/owner-notifications/delivery.server";
import { pollLocalNotifications } from "../app/owner-notifications/local-billing-source.server";
import { action, loader } from "../app/routes/app.engagement";

vi.mock("../app/admin-auth.server", () => ({ authenticateAdmin: vi.fn() }));

const SHOP = "diagnosi-sintetica.myshopify.com";
const INSTALLED = "2026-09-14T12:00:00.000Z";
const OPENED = new Date("2026-09-14T12:01:00.000Z");
const UNINSTALLED = "2026-09-14T12:02:00.000Z";
const NOW = new Date("2026-09-14T12:03:00.000Z");
const PARTNER = { organizationId: "org", appId: "app", accessToken: "synthetic-token" };

beforeEach(async () => {
  vi.clearAllMocks();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM owner_notifications"),
    env.DB.prepare("DELETE FROM owner_notification_state"),
    env.DB.prepare("DELETE FROM owner_notification_redactions"),
    env.DB.prepare("DELETE FROM app_events"),
    env.DB.prepare("DELETE FROM shops"),
    env.DB.prepare(
      `INSERT INTO shops (shop_domain, installation_status, installed_at, created_at, updated_at)
       VALUES ('${SHOP}', 'active', '${INSTALLED}', '${INSTALLED}', '${INSTALLED}')`,
    ),
    env.DB.prepare(
      `INSERT INTO owner_notification_state (state_key, state_value, updated_at)
       VALUES ('engagement_tracking_started_at', '2026-09-14T11:00:00.000Z', '${INSTALLED}')`,
    ),
  ]);
  vi.mocked(authenticateAdmin).mockResolvedValue({
    session: { shop: SHOP },
  } as Awaited<ReturnType<typeof authenticateAdmin>>);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const REFRESH_FAILED = "aggiornamento non riuscito";

function feedbackView(
  current: Parameters<typeof diagnosticShopMessage>[1],
  options?: Parameters<typeof diagnosticShopMessage>[3],
) {
  return diagnosticShopMessage(env.DB, current, PARTNER, options).then(JSON.stringify);
}

function pollWith(fetcher: () => Promise<Response>) {
  vi.stubGlobal("fetch", fetcher);
  return pollPartnerEvents(env.DB, PARTNER, { now: NOW });
}

function feedback(overrides: Partial<FeedbackEvent> = {}): FeedbackEvent {
  return {
    type: "RELATIONSHIP_UNINSTALLED",
    occurredAt: UNINSTALLED,
    shop: { myshopifyDomain: SHOP },
    reason: "Other (please specify)",
    description: "Cercavo una funzione diversa.",
    ...overrides,
  };
}

async function shop(uninstalled = false) {
  if (uninstalled) {
    await env.DB.prepare(
      "UPDATE shops SET installation_status = 'uninstalled', uninstalled_at = ? WHERE shop_domain = ?",
    )
      .bind(UNINSTALLED, SHOP)
      .run();
  }
  return (await findShops(env.DB, SHOP))[0];
}

function page(nodes: FeedbackEvent[], hasNextPage = false, cursor = "page-1") {
  return Response.json({
    data: {
      app: {
        events: {
          edges: nodes.map((node) => ({ node, cursor })),
          pageInfo: { hasNextPage },
        },
      },
    },
  });
}

function request(event = "app_opened", installedAt = INSTALLED, body?: string) {
  return new Request("https://app.test/app/engagement", {
    method: "POST",
    headers: { "X-CF-Ready-Event": event, "X-CF-Ready-Installation": installedAt },
    body,
  });
}

function args(input: Request, db: D1Database = env.DB): ActionFunctionArgs {
  return {
    request: input,
    context: { get: () => db },
    params: {},
  } as unknown as ActionFunctionArgs;
}

test("un'installazione non implica una visita; si accettano soltanto due eventi", async () => {
  const current = await shop();
  expect(await readInstallationStartedAt(env.DB, SHOP)).toBe(INSTALLED);
  expect(await readInstallationStartedAt(env.DB, "assente.myshopify.com")).toBeNull();
  expect(await readInstallationEngagement(env.DB, current.id, INSTALLED)).toMatchObject({
    first_opened_at: null,
    onboarding_started_at: null,
    tracking_started_at: "2026-09-14T11:00:00.000Z",
  });
  expect(parseEngagementHeaders(request().headers)).toEqual({
    event: "app_opened",
    installedAt: INSTALLED,
  });
  expect(parseEngagementHeaders(request("free_text").headers)).toBeNull();
  expect(parseEngagementHeaders(request("app_opened", "non-data").headers)).toBeNull();
  expect(parseEngagementHeaders(new Headers())).toBeNull();
});

test("apertura app e ingresso al primo passo sono distinti, idempotenti e atomici", async () => {
  const current = await shop();
  await Promise.all([
    recordInstallationEngagement(env.DB, SHOP, INSTALLED, "app_opened", OPENED),
    recordInstallationEngagement(env.DB, SHOP, INSTALLED, "app_opened", OPENED),
  ]);
  expect(await readInstallationEngagement(env.DB, current.id, INSTALLED)).toMatchObject({
    first_opened_at: OPENED.toISOString(),
    onboarding_started_at: null,
  });
  await Promise.all([
    recordInstallationEngagement(env.DB, SHOP, INSTALLED, "onboarding_started", NOW),
    recordInstallationEngagement(env.DB, SHOP, INSTALLED, "onboarding_started", NOW),
  ]);
  expect(await readInstallationEngagement(env.DB, current.id, INSTALLED)).toMatchObject({
    first_opened_at: OPENED.toISOString(),
    onboarding_started_at: NOW.toISOString(),
  });
  const { results } = await env.DB.prepare(
    "SELECT event_name, COUNT(*) AS count FROM app_events GROUP BY event_name ORDER BY event_name",
  ).all();
  expect(results).toEqual([
    { event_name: "app_opened", count: 1 },
    { event_name: "onboarding_started", count: 1 },
  ]);
});

test("l'accesso diretto all'onboarding registra anche l'app, senza avanzare lo stato", async () => {
  const current = await shop();
  await recordInstallationEngagement(env.DB, SHOP, INSTALLED, "onboarding_started", OPENED);
  expect(await readInstallationEngagement(env.DB, current.id, INSTALLED)).toMatchObject({
    first_opened_at: OPENED.toISOString(),
    onboarding_started_at: OPENED.toISOString(),
  });
  expect(
    await env.DB.prepare("SELECT * FROM app_state WHERE shop_id = ?").bind(current.id).first(),
  ).toBeNull();
  const result = await diagnosticShopMessage(env.DB, current, PARTNER);
  expect(JSON.stringify(result)).toContain("Onboarding aperto");
  expect(JSON.stringify(result)).toContain("Sì");
});

test("reinstallazione, vecchie schede, disinstallazione e cancellazione sono separate", async () => {
  const current = await shop();
  await recordInstallationEngagement(env.DB, SHOP, INSTALLED, "app_opened", OPENED);
  await saveUninstallFeedback(env.DB, feedback(), NOW);
  await shop(true);
  expect(await readInstallationStartedAt(env.DB, SHOP)).toBeNull();
  expect(
    await recordInstallationEngagement(env.DB, SHOP, INSTALLED, "onboarding_started", NOW),
  ).toBe(false);
  const previous = await readInstallationEngagement(env.DB, current.id, INSTALLED);
  expect(previous.first_opened_at).not.toBeNull();
  const reinstalled = "2026-09-14T13:00:00.000Z";
  await env.DB.prepare(
    "UPDATE shops SET installed_at = ?, installation_status = 'active' WHERE id = ?",
  )
    .bind(reinstalled, current.id)
    .run();
  expect(await recordInstallationEngagement(env.DB, SHOP, INSTALLED, "app_opened", NOW)).toBe(
    false,
  );
  expect(await saveUninstallFeedback(env.DB, feedback(), NOW)).toBe(false);
  expect(await readUninstallFeedback(env.DB, current.id, reinstalled)).toBeNull();
  await recordInstallationEngagement(
    env.DB,
    SHOP,
    reinstalled,
    "app_opened",
    new Date(reinstalled),
  );
  await env.DB.prepare("DELETE FROM shops WHERE id = ?").bind(current.id).run();
  expect(await env.DB.prepare("SELECT * FROM installation_engagement").first()).toBeNull();
  expect(await env.DB.prepare("SELECT * FROM uninstall_feedback").first()).toBeNull();
  expect(await saveUninstallFeedback(env.DB, feedback(), NOW)).toBe(false);
});

test("il feedback distingue null, campi assenti e testo limitato senza markup eseguibile", async () => {
  expect(normalizeUninstallFeedback(feedback({ reason: null, description: null }))).toMatchObject({
    reason: null,
    description: null,
  });
  expect(normalizeUninstallFeedback(feedback({ description: undefined }))).toBeNull();
  expect(normalizeUninstallFeedback(feedback({ reason: 42 }))).toBeNull();
  expect(normalizeUninstallFeedback(feedback({ occurredAt: "errata" }))).toBeNull();
  const normalized = normalizeUninstallFeedback(
    feedback({
      reason: " \u202eAltro\n ",
      description: "<b>testo</b>\n" + "é".repeat(2000),
    }),
  )!;
  expect(normalized.reason).toBe("Altro");
  expect(Array.from(normalized.description!).length).toBe(1200);
  expect(normalized.description).toContain("<b>testo</b> ");
  expect(normalized.description).not.toContain("\n");
  const current = await shop();
  await saveUninstallFeedback(env.DB, feedback(), NOW);
  await saveUninstallFeedback(
    env.DB,
    feedback({ occurredAt: INSTALLED, description: "Vecchio" }),
    NOW,
  );
  expect(await readUninstallFeedback(env.DB, current.id, INSTALLED)).toMatchObject({
    description: "Cercavo una funzione diversa.",
    occurred_at: UNINSTALLED,
  });
});

test("il recupero su richiesta legge più pagine e funziona oltre le ultime 24 ore", async () => {
  const current = await shop(true);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      page([feedback({ shop: { myshopifyDomain: "altro.myshopify.com" } })], true),
    )
    .mockResolvedValueOnce(page([feedback()], false, "page-2"));
  vi.stubGlobal("fetch", fetcher);
  const result = await feedbackView(current, { now: new Date("2026-09-20T12:00:00.000Z") });
  expect(result).toContain("Cercavo una funzione diversa.");
  expect(result).not.toContain(REFRESH_FAILED);
  const first = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  const second = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
  expect(first.query.replace(/\s+/g, "")).toContain(
    "...onRelationshipUninstalled{reasondescription}",
  );
  expect(first.variables.from).toBe(INSTALLED);
  expect(second.variables.after).toBe("page-1");
});

test("la cache non nasconde errori, campi mancanti o paginazione incompleta", async () => {
  const current = await shop(true);
  await saveUninstallFeedback(env.DB, feedback(), NOW);
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("synthetic failure"));
  vi.stubGlobal("fetch", fetcher);
  const cached = await feedbackView(current, { now: NOW });
  expect(cached).toContain("Cercavo una funzione diversa.");
  expect(cached).not.toContain(REFRESH_FAILED);
  expect(fetcher).not.toHaveBeenCalled();
  const options = { now: NOW, refresh: true };
  const failed = await feedbackView(current, options);
  expect(failed).toContain(REFRESH_FAILED);
  expect(failed).toContain("Cercavo una funzione diversa.");
  fetcher.mockResolvedValue(page([feedback({ description: undefined })]));
  expect(await feedbackView(current, options)).toContain(REFRESH_FAILED);
  fetcher.mockImplementation(async () => page([feedback()], true));
  expect(await feedbackView(current, options)).toContain(REFRESH_FAILED);
});

test("il bot non dichiara mai aperta o mai iniziato per un segnale mancante", async () => {
  const current = await shop(true);
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async () => page([])),
  );
  await env.DB.prepare(
    "DELETE FROM owner_notification_state WHERE state_key = 'engagement_tracking_started_at'",
  ).run();
  const legacy = await feedbackView(current, { now: NOW });
  expect(legacy).toContain("Dato storico non disponibile");
  expect(legacy).toContain("Evento Partner non trovato");
  expect(legacy).not.toContain("Nessun commento fornito");

  await env.DB.prepare(
    `INSERT INTO owner_notification_state (state_key, state_value, updated_at)
     VALUES ('engagement_tracking_started_at', '2026-09-01T00:00:00.000Z', '${INSTALLED}')`,
  ).run();
  await saveUninstallFeedback(env.DB, feedback({ reason: null, description: null }), NOW);
  const fresh = await feedbackView(current, { now: NOW });
  expect(fresh).toContain("Non rilevata");
  expect(fresh).toContain("Nessun commento fornito");
});

test("il poll conserva il feedback anche se la disinstallazione è già stata notificata", async () => {
  const current = await shop(true);
  const node = {
    ...feedback(),
    shop: { id: "gid://partners/Shop/test", myshopifyDomain: SHOP, name: "Store sintetico" },
  };
  await pollWith(async () => page([node]));
  const original = await env.DB.prepare("SELECT body_text FROM owner_notifications").first<{
    body_text: string;
  }>();
  expect(original?.body_text).toContain("Cercavo una funzione diversa.");
  await env.DB.prepare("UPDATE owner_notifications SET status = 'sent'").run();
  await pollWith(async () => page([{ ...node, description: "Commento aggiornato" }]));
  expect(await readUninstallFeedback(env.DB, current.id, INSTALLED)).toMatchObject({
    description: "Commento aggiornato",
  });
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM owner_notifications").first()).toEqual(
    {
      count: 1,
    },
  );
  const sent = await env.DB.prepare("SELECT body_text FROM owner_notifications").first();
  expect(sent).toEqual(original);
});

test("la rotta autentica lo store e rifiuta body, eventi liberi, GET e utenti non autorizzati", async () => {
  expect(loader().status).toBe(405);
  expect((await action(args(new Request("https://app.test/app/engagement")))).status).toBe(405);
  expect((await action(args(request("unknown")))).status).toBe(400);
  expect((await action(args(request("app_opened", INSTALLED, "payload")))).status).toBe(400);
  expect(authenticateAdmin).not.toHaveBeenCalled();
  vi.mocked(authenticateAdmin).mockRejectedValueOnce(new Response(null, { status: 401 }));
  await expect(action(args(request()))).rejects.toBeInstanceOf(Response);
  expect(await env.DB.prepare("SELECT * FROM installation_engagement").first()).toBeNull();
  expect((await action(args(request("onboarding_started", INSTALLED, "")))).status).toBe(204);
  const engagement = await readInstallationEngagement(env.DB, (await shop()).id, INSTALLED);
  expect(engagement.onboarding_started_at).not.toBeNull();
  const broken = {
    prepare: () => {
      throw new Error("synthetic storage failure");
    },
  } as unknown as D1Database;
  expect((await action(args(request(), broken))).status).toBe(503);
});

test("un feedback tardivo arricchisce la notifica ancora pending senza crearne un'altra", async () => {
  await shop(true);
  const node = {
    ...feedback(),
    shop: { id: "gid://partners/Shop/test", myshopifyDomain: SHOP, name: "Store sintetico" },
  };
  await pollWith(async () => page([{ ...node, reason: undefined, description: undefined }]));
  await pollWith(async () => page([node]));
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM owner_notifications").first()).toEqual(
    {
      count: 1,
    },
  );
  expect(await env.DB.prepare("SELECT body_text FROM owner_notifications").first()).toMatchObject({
    body_text: expect.stringContaining("Cercavo una funzione diversa."),
  });
});

test.each(["sent", "processing", "failed"])(
  "il feedback dopo l'avviso locale %s genera un solo messaggio separato",
  async (status) => {
    const current = await shop(true);
    await env.DB.prepare(
      `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
       VALUES (?, 'app_uninstalled', 'lifecycle', ?)`,
    )
      .bind(current.id, UNINSTALLED)
      .run();
    await pollLocalNotifications(env.DB, NOW);
    const original = await env.DB.prepare("SELECT body_text FROM owner_notifications").first();
    expect(original).toMatchObject({
      body_text: expect.stringContaining("Motivo non ancora disponibile"),
    });
    await env.DB.prepare("UPDATE owner_notifications SET status = ?").bind(status).run();
    const node = { ...feedback(), shop: { myshopifyDomain: SHOP, name: "Store sintetico" } };
    const fetcher = async () => page([node]);
    expect(await pollWith(fetcher)).toMatchObject({ inserted: 1 });
    expect(await pollWith(fetcher)).toMatchObject({ inserted: 0 });
    const { results } = await env.DB.prepare(
      "SELECT subject, body_text FROM owner_notifications ORDER BY id",
    ).all();
    expect(results).toHaveLength(2);
    expect(results[0].body_text).toEqual(original?.body_text);
    expect(results[1]).toMatchObject({
      subject: "💬 CF Ready · Motivo della disinstallazione",
      body_text: expect.stringContaining("Cercavo una funzione diversa."),
    });
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ok: true, result: { message_id: 1 } }));
    vi.stubGlobal("fetch", send);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    expect(
      await deliverOwnerNotifications(env.DB, {
        botToken: "123456789:abcdefghijklmnopqrstuvwxyz_ABCD",
        chatId: "987654321",
      }),
    ).toEqual({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  },
);

test.each([
  { reason: null, description: null, expected: 1 },
  { reason: "   ", description: "   ", expected: 1 },
  { reason: undefined, description: undefined, expected: 1 },
  { reason: "Other", description: null, expected: 0 },
  { reason: null, description: "Solo commento", expected: 0 },
])(
  "il seguito distingue feedback assente e feedback già condiviso: $reason / $description",
  async ({ reason, description, expected }) => {
    await shop(true);
    const node = { ...feedback(), shop: { myshopifyDomain: SHOP, name: "Store sintetico" } };
    await pollWith(async () => page([{ ...node, reason, description }]));
    await env.DB.prepare("UPDATE owner_notifications SET status = 'sent'").run();
    expect(await pollWith(async () => page([node]))).toMatchObject({ inserted: expected });
  },
);

test("nessun messaggio aggiuntivo per feedback vuoto o ancora assente", async () => {
  await shop(true);
  const node = { ...feedback(), shop: { myshopifyDomain: SHOP, name: "Store sintetico" } };
  await pollWith(async () => page([{ ...node, reason: undefined, description: undefined }]));
  await env.DB.prepare("UPDATE owner_notifications SET status = 'sent'").run();
  for (const reason of [undefined, null, "   "]) {
    expect(
      await pollWith(async () => page([{ ...node, reason, description: reason }])),
    ).toMatchObject({ inserted: 0 });
  }
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM owner_notifications").first()).toEqual(
    { count: 1 },
  );
});

const PARTNER_UNAVAILABLE = "Partner API non disponibile";

test("copre i fallback sicuri del testo e della sezione feedback", async () => {
  expect(normalizeFeedbackText(" \n‮ ", 20)).toBeNull();
  expect(await saveUninstallFeedback(env.DB, feedback())).toBe(true);
  expect(uninstallFeedbackSection(feedback({ reason: null, description: null })).lines).toEqual([
    "Motivo: Nessun motivo fornito",
    "Commento: Nessun commento fornito",
  ]);
});

test("il dettaglio gestisce timestamp di disinstallazione assente usando i default", async () => {
  await env.DB.prepare(
    "UPDATE shops SET installation_status = 'uninstalled', uninstalled_at = NULL WHERE shop_domain = ?",
  )
    .bind(SHOP)
    .run();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(await feedbackView(await shop())).toContain(PARTNER_UNAVAILABLE);
  expect(fetcher).not.toHaveBeenCalled();
});

test("il dettaglio distingue payload Partner invalido, finestra vuota e cache disponibile", async () => {
  const current = await shop(true);
  const invalidPayload = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      data: { app: { events: { edges: null, pageInfo: { hasNextPage: false } } } },
    }),
  );
  vi.stubGlobal("fetch", invalidPayload);
  expect(await feedbackView(current, { now: NOW })).toContain(PARTNER_UNAVAILABLE);
  expect(invalidPayload).toHaveBeenCalledOnce();

  const outsideWindow = vi
    .fn<typeof fetch>()
    .mockResolvedValue(page([feedback({ occurredAt: "2026-09-14T11:59:00.000Z" })]));
  vi.stubGlobal("fetch", outsideWindow);
  expect(await feedbackView(current, { now: NOW })).toContain("Evento Partner non trovato");
  expect(outsideWindow).toHaveBeenCalledOnce();

  await saveUninstallFeedback(env.DB, feedback({ description: "Synthetic feedback" }), NOW);
  const emptyPage = vi.fn<typeof fetch>().mockResolvedValue(page([]));
  vi.stubGlobal("fetch", emptyPage);
  const cached = await feedbackView(current, {
    now: new Date("2026-09-14T12:10:00.000Z"),
    refresh: true,
  });
  expect(cached).toContain("Synthetic feedback");
  expect(cached).not.toContain(REFRESH_FAILED);
  expect(emptyPage).toHaveBeenCalledOnce();
});

test("il recupero conserva il candidato Partner più recente nella stessa pagina", async () => {
  const current = await shop(true);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      page([
        feedback({ occurredAt: "2026-09-14T12:03:00.000Z", description: "Più recente" }),
        feedback({ occurredAt: "2026-09-14T12:01:00.000Z", description: "Più vecchio" }),
      ]),
    );
  vi.stubGlobal("fetch", fetcher);
  const result = await feedbackView(current, { now: NOW });
  expect(result).toContain("Più recente");
  expect(result).not.toContain("Più vecchio");
});

test("il dettaglio distingue onboarding non iniziato e primo passo già aperto", async () => {
  const current = { ...(await shop()), onboarding_status: "not_started" };
  const before = await diagnosticShopMessage(env.DB, current, PARTNER);
  expect(JSON.stringify(before)).toContain("Nessun avanzamento registrato");

  await recordInstallationEngagement(env.DB, SHOP, INSTALLED, "onboarding_started", NOW);
  const after = await diagnosticShopMessage(env.DB, current, PARTNER);
  expect(JSON.stringify(after)).toContain("Primo passo aperto");
});

test("i blocchi esplicitano un aggiornamento Partner non riuscito con e senza cache", async () => {
  const current = await shop(true);
  // Un 401 non viene ritentato: il test resta immediato.
  const denied = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", denied);

  const withoutCache = await feedbackView(current, { now: NOW, refresh: true });
  expect(withoutCache).toContain(PARTNER_UNAVAILABLE);
  expect(withoutCache).not.toContain(REFRESH_FAILED);

  await saveUninstallFeedback(env.DB, feedback({ description: "Synthetic feedback" }), NOW);
  const withCache = await feedbackView(current, { now: NOW, refresh: true });
  expect(withCache).toContain(REFRESH_FAILED);
  expect(withCache).toContain("Synthetic feedback");
  expect(denied).toHaveBeenCalledTimes(2);
});

function streamedRequest(reader: object) {
  return {
    method: "POST",
    headers: new Headers({
      "X-CF-Ready-Event": "app_opened",
      "X-CF-Ready-Installation": INSTALLED,
    }),
    body: { getReader: () => reader },
  } as unknown as Request;
}

test("la rotta tratta come body non vuoto anche uno stream che fallisce durante la lettura", async () => {
  const reader = {
    read: vi.fn().mockRejectedValue(new Error("synthetic stream failure")),
    cancel: vi.fn(),
    releaseLock: vi.fn(),
  };
  expect((await action(args(streamedRequest(reader)))).status).toBe(400);
  expect(authenticateAdmin).not.toHaveBeenCalled();
  expect(reader.releaseLock).toHaveBeenCalledOnce();
});

test("la rotta accetta uno stream vuoto composto da un chunk di zero byte", async () => {
  const reader = {
    read: vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(0) })
      .mockResolvedValueOnce({ done: true, value: undefined }),
    cancel: vi.fn(),
    releaseLock: vi.fn(),
  };
  expect((await action(args(streamedRequest(reader)))).status).toBe(204);
  expect(authenticateAdmin).toHaveBeenCalledOnce();
  expect(reader.cancel).not.toHaveBeenCalled();
  expect(reader.releaseLock).toHaveBeenCalledOnce();
});
