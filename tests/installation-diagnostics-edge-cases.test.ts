import { env } from "cloudflare:test";
import type { ActionFunctionArgs } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { authenticateAdmin } from "../app/admin-auth.server";
import {
  normalizeFeedbackText,
  recordInstallationEngagement,
  saveUninstallFeedback,
  uninstallFeedbackSection,
  type FeedbackEvent,
} from "../app/installation-diagnostics.server";
import { findShops } from "../app/owner-control/queries.server";
import {
  diagnosticBlocks,
  diagnosticShopMessage,
  readShopFeedback,
} from "../app/owner-control/shop-diagnostics.server";
import { action } from "../app/routes/app.engagement";

vi.mock("../app/admin-auth.server", () => ({ authenticateAdmin: vi.fn() }));

const SHOP = "diagnosi-edge.myshopify.com";
const INSTALLED = "2026-09-14T12:00:00.000Z";
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
    reason: "Other",
    description: "Synthetic feedback",
    ...overrides,
  };
}

async function currentShop(uninstalledAt: string | null = null) {
  if (uninstalledAt !== null) {
    await env.DB.prepare(
      "UPDATE shops SET installation_status = 'uninstalled', uninstalled_at = ? WHERE shop_domain = ?",
    )
      .bind(uninstalledAt, SHOP)
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

function args(request: Request): ActionFunctionArgs {
  return {
    request,
    context: { get: () => env.DB },
    params: {},
  } as unknown as ActionFunctionArgs;
}

test("copre i fallback sicuri del testo e della sezione feedback", async () => {
  expect(normalizeFeedbackText(" \n\u202e ", 20)).toBeNull();
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
  expect(await readShopFeedback(env.DB, await currentShop(), PARTNER)).toEqual({
    feedback: null,
    status: "unavailable",
  });
});

test(
  "il dettaglio distingue payload Partner invalido, finestra vuota e cache disponibile",
  async () => {
    const shop = await currentShop(UNINSTALLED);
    const invalidPayload = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: { app: { events: { edges: null, pageInfo: { hasNextPage: false } } } },
      }),
    );
    expect(
      (await readShopFeedback(env.DB, shop, PARTNER, { now: NOW, fetcher: invalidPayload })).status,
    ).toBe("unavailable");

    const outsideWindow = vi
      .fn<typeof fetch>()
      .mockResolvedValue(page([feedback({ occurredAt: "2026-09-14T11:59:00.000Z" })]));
    expect(
      (await readShopFeedback(env.DB, shop, PARTNER, { now: NOW, fetcher: outsideWindow })).status,
    ).toBe("not_found");

    await saveUninstallFeedback(env.DB, feedback(), NOW);
    const emptyPage = vi.fn<typeof fetch>().mockResolvedValue(page([]));
    const cached = await readShopFeedback(env.DB, shop, PARTNER, {
      now: new Date("2026-09-14T12:10:00.000Z"),
      fetcher: emptyPage,
      refresh: true,
    });
    expect(cached.status).toBe("available");
    expect(cached.feedback?.description).toBe("Synthetic feedback");
  },
);

test("il recupero conserva il candidato Partner più recente nella stessa pagina", async () => {
  const shop = await currentShop(UNINSTALLED);
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    page([
      feedback({ occurredAt: "2026-09-14T12:03:00.000Z", description: "Più recente" }),
      feedback({ occurredAt: "2026-09-14T12:01:00.000Z", description: "Più vecchio" }),
    ]),
  );
  const result = await readShopFeedback(env.DB, shop, PARTNER, { now: NOW, fetcher });
  expect(result.status).toBe("available");
  expect(result.feedback?.description).toBe("Più recente");
});

test("il dettaglio distingue onboarding non iniziato e primo passo già aperto", async () => {
  const shop = { ...(await currentShop()), onboarding_status: "not_started" };
  const before = await diagnosticShopMessage(env.DB, shop, PARTNER);
  expect(JSON.stringify(before)).toContain("Nessun avanzamento registrato");

  await recordInstallationEngagement(env.DB, SHOP, INSTALLED, "onboarding_started", NOW);
  const after = await diagnosticShopMessage(env.DB, shop, PARTNER);
  expect(JSON.stringify(after)).toContain("Primo passo aperto");
});

test("i blocchi esplicitano un aggiornamento Partner non riuscito con e senza cache", () => {
  const engagement = {
    first_opened_at: null,
    onboarding_started_at: null,
    tracking_started_at: "2026-09-14T11:00:00.000Z",
  };
  const withCache = JSON.stringify(
    diagnosticBlocks(INSTALLED, engagement, {
      status: "unavailable",
      feedback: {
        occurred_at: UNINSTALLED,
        reason: "Other",
        description: "Synthetic feedback",
        fetched_at: NOW.toISOString(),
      },
    }),
  );
  expect(withCache).toContain("aggiornamento non riuscito");

  const withoutCache = JSON.stringify(
    diagnosticBlocks(INSTALLED, engagement, { status: "unavailable", feedback: null }),
  );
  expect(withoutCache).toContain("Partner API non disponibile");
});

test(
  "la rotta tratta come body non vuoto anche uno stream che fallisce durante la lettura",
  async () => {
    const reader = {
      read: vi.fn().mockRejectedValue(new Error("synthetic stream failure")),
      cancel: vi.fn(),
      releaseLock: vi.fn(),
    };
    const request = {
      method: "POST",
      headers: new Headers({
        "X-CF-Ready-Event": "app_opened",
        "X-CF-Ready-Installation": INSTALLED,
      }),
      body: { getReader: () => reader },
    } as unknown as Request;
    expect((await action(args(request))).status).toBe(400);
    expect(authenticateAdmin).not.toHaveBeenCalled();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  },
);

test("la rotta accetta uno stream vuoto composto da un chunk di zero byte", async () => {
  const reader = {
    read: vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(0) })
      .mockResolvedValueOnce({ done: true, value: undefined }),
    cancel: vi.fn(),
    releaseLock: vi.fn(),
  };
  const request = {
    method: "POST",
    headers: new Headers({
      "X-CF-Ready-Event": "app_opened",
      "X-CF-Ready-Installation": INSTALLED,
    }),
    body: { getReader: () => reader },
  } as unknown as Request;
  expect((await action(args(request))).status).toBe(204);
  expect(authenticateAdmin).toHaveBeenCalledOnce();
  expect(reader.cancel).not.toHaveBeenCalled();
  expect(reader.releaseLock).toHaveBeenCalledOnce();
});
