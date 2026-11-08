import { version as appVersion } from "../../package.json";
import type { TelegramClientConfig } from "../telegram/client.server";
import { createTelegramClient } from "../telegram/client.server";
import { readGrowthReport } from "./growth.server";
import { readBFSReport, refreshBFSPlans } from "./bfs.server";
import { diagnosticShopMessage } from "./shop-diagnostics.server";
import type { OwnerControlAction } from "./actions";
import {
  canCloseConversion,
  canConfirmConversion,
  closeReviewedConversion,
  confirmReviewedConversion,
} from "./billing";
import { billingMessage, uninstallsMessage } from "./presentation-billing";
import { noticeMessage, type OwnerControlMessage } from "./presentation-format";
import {
  activityMessage,
  conversionReviewMessage,
  dashboardMessage,
  errorsMessage,
  funnelMessage,
  growthMessage,
  healthMessage,
  helpMessage,
  issuesMessage,
  notificationsMessage,
  performanceMessage,
  shopMatchesMessage,
  shopsMessage,
  trialsMessage,
  versionMessage,
} from "./presentation";
import {
  findShops,
  readActivity,
  readBilling,
  readDashboard,
  readErrors,
  readFunnel,
  readHealth,
  readIssues,
  readNotificationStatus,
  readPerformance,
  readShop,
  readShops,
  readTrials,
} from "./queries.server";
import { ownerControlErrorCode, readCachedReport } from "./repository.server";
import { readEuroExchangeRate, readRevenueReport } from "./revenue.server";
import {
  fetchPartnerUninstallEvents,
  readUninstallHistory,
  readUninstallReport,
} from "./uninstalls.server";
import { syncPartnerFinancialObservations } from "../owner-notifications/financial-source.server";
import type { PartnerInstallConfig } from "../owner-notifications/partner-api.server";
import { defaultAdminForShop, readShopifyPlan, readShopifyPlans } from "./shopify-plans.server";
import type { ShopRow } from "./queries.server";

const WEBHOOK_CACHE_KEY = "telegram_webhook_v1";
const WEBHOOK_CACHE_TTL_MS = 15 * 60 * 1000;

export type OwnerControlRuntimeConfig = TelegramClientConfig & {
  partner: PartnerInstallConfig;
  environment: string;
  webhookUrl: string;
  versionMetadata?: Pick<WorkerVersionMetadata, "id" | "tag" | "timestamp">;
};

type RenderOptions = { now?: Date };

export async function renderOwnerControlAction(
  db: D1Database,
  action: OwnerControlAction,
  config: OwnerControlRuntimeConfig,
  options: RenderOptions = {},
): Promise<OwnerControlMessage> {
  const page = action.page ?? 0;
  const now = options.now ?? new Date();
  const partnerConfig = config.partner;
  const shopDetail = async (shop: ShopRow) =>
    diagnosticShopMessage(db, shop, partnerConfig, {
      now,
      refresh: action.refresh,
      shopifyPlan:
        shop.installation_status === "active"
          ? await readShopifyPlan(shop.shop_domain, defaultAdminForShop)
          : null,
    });

  // Partner, cambi e Telegram sono provider esterni: i loro `.catch` mostrano il pannello senza
  // quel dato.
  switch (action.view) {
    case "dashboard": {
      const [data, growth, bfs] = await Promise.all([
        readDashboard(db),
        readGrowthReport(db, partnerConfig, { now, force: action.refresh }).catch(() => undefined),
        readBFSReport(db, now),
      ]);
      return dashboardMessage(data, growth, environmentLabel(config.environment), bfs);
    }
    case "shops": {
      const shops = await readShops(db, action.filter ?? "all", page);
      const plans = await readShopifyPlans(shops.shops, defaultAdminForShop);
      return shopsMessage(shops, action.filter ?? "all", plans);
    }
    case "shop": {
      if (action.shopId !== undefined) {
        const shop = await readShop(db, action.shopId);
        return shop ? shopDetail(shop) : noticeMessage("Store", "Store non trovato.");
      }
      if (!action.argument) return noticeMessage("Store", "Usa /shop nome_o_dominio.");
      const shops = await findShops(db, action.argument);
      if (shops.length === 1) {
        const message = await shopDetail(shops[0]);
        return { ...message, copyAction: { view: "shop", shopId: shops[0].id } };
      }
      if (shops.length > 1) return shopMatchesMessage(shops);
      return noticeMessage("Store", "Store non trovato.");
    }
    case "conversion_review": {
      const shop = action.shopId === undefined ? null : await readShop(db, action.shopId);
      return shop && (canConfirmConversion(shop) || canCloseConversion(shop, now))
        ? conversionReviewMessage(shop)
        : noticeMessage("Conversione", "Nessuna conversione da chiudere.");
    }
    case "conversion_confirm":
      if (action.shopId !== undefined && action.conversionId !== undefined) {
        await confirmReviewedConversion(db, action.shopId, action.conversionId, now);
      }
      return renderOwnerControlAction(db, { view: "shop", shopId: action.shopId }, config, {
        ...options,
        now,
      });
    case "conversion_close":
      if (action.shopId !== undefined) await closeReviewedConversion(db, action.shopId, now);
      return renderOwnerControlAction(db, { view: "shop", shopId: action.shopId }, config, {
        ...options,
        now,
      });
    case "growth":
      return growthMessage(
        await readGrowthReport(db, partnerConfig, { now, force: action.refresh }),
      );
    case "billing": {
      let financialRefreshUnavailable: string | undefined;
      if (action.refresh) {
        try {
          await syncPartnerFinancialObservations(db, partnerConfig, { now });
        } catch (error: unknown) {
          financialRefreshUnavailable = ownerControlErrorCode(error);
        }
      }
      const [billing, revenue, uninstalls] = await Promise.all([
        readBilling(db),
        readRevenueReport(db, partnerConfig, { now, force: action.refresh }).catch(
          (error: unknown) => ({ unavailable: ownerControlErrorCode(error) }),
        ),
        readUninstallReport(db, partnerConfig, { now, force: action.refresh }),
      ]);
      return billingMessage(
        {
          ...billing,
          reconciliation: {
            ...billing.reconciliation,
            refreshUnavailable: financialRefreshUnavailable,
          },
        },
        revenue,
        uninstalls,
        "currency" in revenue && revenue.currency === "USD"
          ? await readEuroExchangeRate(db, { now }).catch(() => undefined)
          : undefined,
      );
    }
    case "uninstalls": {
      // Nomi e domini si leggono dal vivo e non entrano nella cache (D-189).
      const [partner, history] = await Promise.all([
        fetchPartnerUninstallEvents(partnerConfig, now).catch((error: unknown) => ({
          unavailable: ownerControlErrorCode(error),
        })),
        readUninstallHistory(db),
      ]);
      return uninstallsMessage(partner, history);
    }
    case "trials":
      return trialsMessage(await readTrials(db, page));
    case "funnel":
      return funnelMessage(await readFunnel(db));
    case "issues":
      return issuesMessage(await readIssues(db));
    case "errors":
      return errorsMessage(await readErrors(db));
    case "notifications":
      return notificationsMessage(await readNotificationStatus(db));
    case "activity":
      return activityMessage(await readActivity(db));
    case "health": {
      const client = createTelegramClient(config);
      return healthMessage(
        await readHealth(db),
        await readTelegramWebhookHealth(
          db,
          client,
          config.webhookUrl,
          action.refresh ?? false,
          now,
        ).catch(() => undefined),
      );
    }
    case "performance": {
      const [performance, bfs] = await Promise.all([
        readPerformance(db),
        action.refresh ? refreshBFSPlans(db, { now, force: true }) : readBFSReport(db, now),
      ]);
      return performanceMessage(performance, bfs);
    }
    case "version":
      return versionMessage({
        appVersion,
        environment: environmentLabel(config.environment),
        workerId: config.versionMetadata?.id,
        workerTag: config.versionMetadata?.tag,
        deployedAt: config.versionMetadata?.timestamp,
      });
    case "help":
      return helpMessage();
  }
}

type WebhookHealth = {
  configured: boolean;
  matchesExpectedUrl: boolean;
  pendingUpdateCount: number;
  lastErrorAt: string | null;
  checkedAt: string;
};

function readTelegramWebhookHealth(
  db: D1Database,
  client: ReturnType<typeof createTelegramClient>,
  expectedUrl: string,
  force: boolean,
  now: Date,
) {
  return readCachedReport<WebhookHealth>(
    db,
    WEBHOOK_CACHE_KEY,
    { now, force, ttlMs: WEBHOOK_CACHE_TTL_MS },
    async () => {
      const result = await client.getWebhookInfo();
      return {
        configured: result.configured,
        matchesExpectedUrl: result.url === expectedUrl,
        pendingUpdateCount: Math.max(0, result.pendingUpdateCount - 1),
        lastErrorAt: result.lastErrorAt,
        checkedAt: now.toISOString(),
      };
    },
  );
}

function environmentLabel(value: string) {
  return value === "production" ? "Production" : value === "development" ? "Development" : value;
}
