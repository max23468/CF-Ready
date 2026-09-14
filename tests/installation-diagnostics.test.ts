import { env } from "cloudflare:test";
import type { ActionFunctionArgs } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { authenticateAdmin } from "../app/admin-auth.server";
import {
  normalizeUninstallFeedback,
  parseEngagementHeaders,
  readInstallationEngagement,
  readInstallationStartedAt,
  readUninstallFeedback,
  recordInstallationEngagement,
  saveUninstallFeedback,
  type FeedbackEvent,
} from "../app/installation-diagnostics.server";
import { findShops } from "../app/owner-control/queries.server";
import {
  diagnosticBlocks,
  diagnosticShopMessage,
  readShopFeedback,
} from "../app/owner-control/shop-diagnostics.server";
import { pollPartnerEvents } from "../app/owner-notifications/partner-source.server";
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
  expect(
    await recordInstallationEngagement(env.DB, SHOP, INSTALLED, "app_opened", NOW),
  ).toBe(false);
  expect(await saveUninstallFeedback(env.DB, feedback(), NOW)).toBe(false);
  expect(await readUninstallFeedback(env.DB, current.id, reinstalled)).toBeNull();
  await recordInstallationEngagement(env.DB, SHOP, reinstalled, "app_opened", new Date(reinstalled));
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
  const result = await readShopFeedback(env.DB, current, PARTNER, {
    now: new Date("2026-09-20T12:00:00.000Z"),
    fetcher,
  });
  expect(result.status).toBe("available");
  expect(result.feedback?.description).toBe("Cercavo una funzione diversa.");
  const first = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  const second = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
  expect(first.query).toContain("... on RelationshipUninstalled { reason description }");
  expect(first.variables.from).toBe(INSTALLED);
  expect(second.variables.after).toBe("page-1");
});

test("la cache non nasconde errori, campi mancanti o paginazione incompleta", async () => {
  const current = await shop(true);
  await saveUninstallFeedback(env.DB, feedback(), NOW);
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("synthetic failure"));
  const cached = await readShopFeedback(env.DB, current, PARTNER, { now: NOW, fetcher });
  expect(cached.status).toBe("available");
  expect(fetcher).not.toHaveBeenCalled();
  const options = { now: NOW, fetcher, refresh: true };
  const failed = await readShopFeedback(env.DB, current, PARTNER, options);
  expect(failed.status).toBe("unavailable");
  expect(failed.feedback?.description).toBe("Cercavo una funzione diversa.");
  fetcher.mockResolvedValue(page([feedback({ description: undefined })]));
  expect((await readShopFeedback(env.DB, current, PARTNER, options)).status).toBe("unavailable");
  fetcher.mockImplementation(async () => page([feedback()], true));
  expect((await readShopFeedback(env.DB, current, PARTNER, options)).status).toBe("unavailable");
});

test("il bot non dichiara mai aperta o mai iniziato per un segnale mancante", () => {
  const missing = {
    first_opened_at: null,
    onboarding_started_at: null,
    tracking_started_at: null,
  };
  const legacy = JSON.stringify(
    diagnosticBlocks(INSTALLED, missing, { status: "not_found", feedback: null }),
  );
  expect(legacy).toContain("Dato storico non disponibile");
  expect(legacy).not.toContain("Nessun commento fornito");
  const fresh = JSON.stringify(
    diagnosticBlocks(
      INSTALLED,
      { ...missing, tracking_started_at: "2026-09-01T00:00:00.000Z" },
      {
        status: "available",
        feedback: {
          occurred_at: UNINSTALLED,
          reason: null,
          description: null,
          fetched_at: NOW.toISOString(),
        },
      },
    ),
  );
  expect(fresh).toContain("Non rilevata");
  expect(fresh).toContain("Nessun commento fornito");
});

test("il poll conserva il feedback anche se la disinstallazione è già stata notificata", async () => {
  const current = await shop(true);
  const node = {
    ...feedback(),
    shop: { id: "gid://partners/Shop/test", myshopifyDomain: SHOP, name: "Store sintetico" },
  };
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => page([node]));
  await pollPartnerEvents(env.DB, PARTNER, { now: NOW, fetcher });
  const original = await env.DB.prepare("SELECT body_text FROM owner_notifications").first<{
    body_text: string;
  }>();
  expect(original?.body_text).toContain("Cercavo una funzione diversa.");
  await env.DB.prepare("UPDATE owner_notifications SET status = 'sent'").run();
  await pollPartnerEvents(env.DB, PARTNER, {
    now: NOW,
    fetcher: async () => page([{ ...node, description: "Commento aggiornato" }]),
  });
  expect(await readUninstallFeedback(env.DB, current.id, INSTALLED)).toMatchObject({
    description: "Commento aggiornato",
  });
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM owner_notifications").first()).toEqual({
    count: 1,
  });
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
  await pollPartnerEvents(env.DB, PARTNER, {
    now: NOW,
    fetcher: async () => page([{ ...node, reason: undefined, description: undefined }]),
  });
  await pollPartnerEvents(env.DB, PARTNER, { now: NOW, fetcher: async () => page([node]) });
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM owner_notifications").first()).toEqual({
    count: 1,
  });
  expect(await env.DB.prepare("SELECT body_text FROM owner_notifications").first()).toMatchObject({
    body_text: expect.stringContaining("Cercavo una funzione diversa."),
  });
});
