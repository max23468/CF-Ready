import {
  normalizeUninstallFeedback,
  readInstallationEngagement,
  readUninstallFeedback,
  saveUninstallFeedback,
  type FeedbackEvent,
  type InstallationEngagement,
  type UninstallFeedback,
} from "../installation-diagnostics.server";
import {
  forEachPartnerPage,
  partnerEvents,
  type PartnerInstallConfig,
} from "../owner-notifications/partner-api.server";
import { telegramTable, type TelegramRichBlock } from "../telegram/client.server";
import { shopMessage } from "./presentation";
import { DATE, button, keyboard, type OwnerControlMessage } from "./presentation-format";
import { readShopActivity, type ShopRow } from "./queries.server";

const FEEDBACK_CACHE_MS = 5 * 60 * 1000;
const MAX_FEEDBACK_PAGES = 5;

const FEEDBACK_QUERY = `#graphql
  query OwnerUninstallFeedback(
    $appId: ID!, $after: String, $first: Int!, $from: DateTime!, $to: DateTime!
  ) {
    app(id: $appId) {
      events(first: $first, after: $after, occurredAtMin: $from, occurredAtMax: $to,
        types: [RELATIONSHIP_UNINSTALLED]) {
        edges {
          cursor
          node {
            type occurredAt
            shop { myshopifyDomain }
            ... on RelationshipUninstalled { reason description }
          }
        }
        pageInfo { hasNextPage }
      }
    }
  }
`;

type FeedbackView = {
  feedback: UninstallFeedback | null;
  status: "available" | "not_found" | "unavailable" | "not_applicable";
};

type Options = {
  now?: Date;
  refresh?: boolean;
  shopifyPlan?: string | null;
};

async function readShopFeedback(
  db: D1Database,
  shop: ShopRow,
  config: PartnerInstallConfig,
  options: Options = {},
): Promise<FeedbackView> {
  if (shop.installation_status !== "uninstalled") {
    return { feedback: null, status: "not_applicable" };
  }
  const cached = await readUninstallFeedback(db, shop.id, shop.installed_at);
  const now = options.now ?? new Date();
  const age = cached ? now.getTime() - Date.parse(cached.fetched_at) : Infinity;
  if (!options.refresh && cached && age >= 0 && age < FEEDBACK_CACHE_MS) {
    return { feedback: cached, status: "available" };
  }
  const row = await db
    .prepare("SELECT uninstalled_at FROM shops WHERE id = ? AND installed_at = ?")
    .bind(shop.id, shop.installed_at)
    .first<{ uninstalled_at: string | null }>();
  const uninstalledAt = row?.uninstalled_at ? Date.parse(row.uninstalled_at) : NaN;
  const installedAt = Date.parse(shop.installed_at);
  if (!Number.isFinite(uninstalledAt) || !Number.isFinite(installedAt)) {
    return { feedback: cached, status: "unavailable" };
  }
  // Recupero mirato anche oltre il replay ordinario: nessuna scansione dell'intero storico.
  const from = new Date(Math.max(installedAt, uninstalledAt - 86_400_000)).toISOString();
  const to = new Date(Math.min(now.getTime(), uninstalledAt + FEEDBACK_CACHE_MS)).toISOString();
  let candidate: FeedbackEvent | null = null;
  try {
    await forEachPartnerPage<FeedbackEvent>(
      config,
      FEEDBACK_QUERY,
      { from, to },
      {
        connection: (page) => {
          const events = partnerEvents(page);
          return typeof events?.pageInfo?.hasNextPage === "boolean" ? events : undefined;
        },
        maxPages: MAX_FEEDBACK_PAGES,
      },
      (nodes) => {
        for (const node of nodes) {
          if (node?.shop?.myshopifyDomain?.toLowerCase() !== shop.shop_domain.toLowerCase()) {
            continue;
          }
          const normalized = normalizeUninstallFeedback(node);
          if (!normalized) throw new Error("partner_api_invalid_payload");
          if (normalized.occurred_at < from || normalized.occurred_at > to) continue;
          if (!candidate || Date.parse(node.occurredAt!) > Date.parse(candidate.occurredAt!)) {
            candidate = node;
          }
        }
      },
    );
    if (candidate) {
      // Si persiste soltanto dopo una lettura completa, non una pagina parziale.
      await saveUninstallFeedback(db, candidate, now);
      const feedback = await readUninstallFeedback(db, shop.id, shop.installed_at);
      return { feedback, status: feedback ? "available" : "not_found" };
    }
    return { feedback: cached, status: cached ? "available" : "not_found" };
  } catch {
    // Non si inoltrano errori GraphQL, token o contenuti merchant a log o Telegram.
    return { feedback: cached, status: "unavailable" };
  }
}

export async function diagnosticShopMessage(
  db: D1Database,
  shop: ShopRow,
  config: PartnerInstallConfig,
  options: Options = {},
): Promise<OwnerControlMessage> {
  const [activity, engagement, feedback] = await Promise.all([
    readShopActivity(db, shop.id),
    readInstallationEngagement(db, shop.id, shop.installed_at),
    readShopFeedback(db, shop, config, options),
  ]);
  const timeline = activity.map((event) => ({
    ...event,
    event_name:
      event.event_name === "app_opened"
        ? "App aperta (prima rilevazione)"
        : event.event_name === "onboarding_started"
          ? "Onboarding aperto (primo ingresso rilevato)"
          : event.event_name,
  }));
  const message = shopMessage(
    {
      ...shop,
      onboarding_status:
        shop.onboarding_status === "not_started"
          ? engagement.onboarding_started_at
            ? "Primo passo aperto"
            : "Nessun avanzamento registrato"
          : shop.onboarding_status,
    },
    timeline,
    options.shopifyPlan,
    options.now,
  );
  const blocks = message.richMessage.blocks;
  return {
    ...message,
    richMessage: {
      ...message.richMessage,
      blocks: [
        ...blocks.filter((block) => block.type !== "footer"),
        ...diagnosticBlocks(shop.installed_at, engagement, feedback),
        ...blocks.filter((block) => block.type === "footer"),
      ],
    },
    replyMarkup: keyboard([
      [button("Aggiorna dettaglio", { view: "shop", shopId: shop.id, refresh: true })],
      ...(message.replyMarkup?.inline_keyboard ?? []),
    ]),
  };
}

function diagnosticBlocks(
  installedAt: string,
  engagement: InstallationEngagement,
  view: FeedbackView,
) {
  const legacy =
    !engagement.tracking_started_at ||
    Date.parse(installedAt) < Date.parse(engagement.tracking_started_at);
  const observed = (at: string | null) =>
    at
      ? `Sì · ${DATE.format(new Date(at))}`
      : legacy
        ? "Dato storico non disponibile"
        : "Non rilevata";
  const blocks: TelegramRichBlock[] = [
    telegramTable("Utilizzo · installazione corrente", [
      ["App aperta", observed(engagement.first_opened_at)],
      ["Onboarding aperto", observed(engagement.onboarding_started_at)],
      [
        "Lettura dei dati",
        "Date delle prime rilevazioni. Un segnale assente non prova che la schermata non sia stata aperta.",
      ],
    ]),
  ];
  if (view.status === "not_applicable") return blocks;
  const feedback = view.feedback;
  blocks.push(
    telegramTable(
      "Disinstallazione · Shopify Partner",
      feedback
        ? [
            ["Evento", DATE.format(new Date(feedback.occurred_at))],
            ["Motivo", feedback.reason ?? "Nessun motivo fornito"],
            ["Commento del merchant", feedback.description ?? "Nessun commento fornito"],
            [
              "Fonte",
              `Shopify Partner · ${DATE.format(new Date(feedback.fetched_at))}${view.status === "unavailable" ? " · aggiornamento non riuscito" : ""}`,
            ],
          ]
        : [
            [
              "Stato",
              view.status === "unavailable"
                ? "Partner API non disponibile: motivo e commento non verificati"
                : "Evento Partner non trovato nella finestra verificata; motivo e commento non disponibili",
            ],
          ],
    ),
  );
  return blocks;
}
