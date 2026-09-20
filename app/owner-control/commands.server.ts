import { version as appVersion } from "../../package.json";
import type { TelegramClientConfig } from "../telegram/client.server";
import { createTelegramClient } from "../telegram/client.server";
import { readGrowthReport } from "./growth.server";
import { diagnosticShopMessage } from "./shop-diagnostics.server";
import type { OwnerControlAction } from "./model";
import {
  activityMessage,
  billingMessage,
  dashboardMessage,
  errorsMessage,
  funnelMessage,
  growthMessage,
  healthMessage,
  helpMessage,
  issuesMessage,
  noticeMessage,
  notificationsMessage,
  performanceMessage,
  shopMatchesMessage,
  shopsMessage,
  trialsMessage,
  versionMessage,
  type OwnerControlMessage,
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
import {
  ownerControlErrorCode,
  readOwnerControlState,
  writeOwnerControlState,
} from "./repository.server";
import { readRevenueReport } from "./revenue.server";
import {
  readShopifyPlan,
  readShopifyPlans,
  type ShopifyAdminForShop,
} from "./shopify-plans.server";

const WEBHOOK_CACHE_KEY = "telegram_webhook_v1";
const WEBHOOK_CACHE_TTL_MS = 15 * 60 * 1000;
const WEBHOOK_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

export type OwnerControlRuntimeConfig = TelegramClientConfig & {
  organizationId: string;
  partnerAppId: string;
  partnerAccessToken: string;
  environment: string;
  webhookUrl: string;
  versionMetadata?: Pick<WorkerVersionMetadata, "id" | "tag" | "timestamp">;
};

type RenderOptions = {
  now?: Date;
  fetcher?: typeof fetch;
  adminForShop?: ShopifyAdminForShop;
};

export async function renderOwnerControlAction(
  db: D1Database,
  action: OwnerControlAction,
  config: OwnerControlRuntimeConfig,
  options: RenderOptions = {},
): Promise<OwnerControlMessage> {
  const page = action.page ?? 0;
  const now = options.now ?? new Date();
  const partnerConfig = {
    organizationId: config.organizationId,
    appId: config.partnerAppId,
    accessToken: config.partnerAccessToken,
  };

  switch (action.view) {
    case "dashboard": {
      const data = await readDashboard(db);
      const growth = await readGrowthReport(db, partnerConfig, {
        now,
        force: action.refresh,
        fetcher: options.fetcher,
      }).catch(() => undefined);
      return dashboardMessage(data, growth, environmentLabel(config.environment));
    }
    case "shops": {
      const shops = await readShops(db, action.filter ?? "all", page);
      const plans = await readShopifyPlans(
        shops.shops,
        options.adminForShop ?? (await defaultAdminForShop()),
      );
      return shopsMessage(shops, action.filter ?? "all", plans);
    }
    case "shop": {
      if (action.shopId !== undefined) {
        const shop = await readShop(db, action.shopId);
        return shop
          ? diagnosticShopMessage(db, shop, partnerConfig, {
              ...options,
              now,
              refresh: action.refresh,
              shopifyPlan:
                shop.installation_status === "active"
                  ? await readShopifyPlan(
                      shop.shop_domain,
                      options.adminForShop ?? (await defaultAdminForShop()),
                    )
                  : null,
            })
          : noticeMessage("Store", "Store non trovato.");
      }
      if (!action.argument) return noticeMessage("Store", "Usa /shop nome_o_dominio.");
      const shops = await findShops(db, action.argument);
      if (shops.length === 1) {
        return diagnosticShopMessage(db, shops[0], partnerConfig, {
          ...options,
          now,
          refresh: action.refresh,
          shopifyPlan:
            shops[0].installation_status === "active"
              ? await readShopifyPlan(
                  shops[0].shop_domain,
                  options.adminForShop ?? (await defaultAdminForShop()),
                )
              : null,
        });
      }
      if (shops.length > 1) return shopMatchesMessage(shops);
      return noticeMessage("Store", "Store non trovato.");
    }
    case "growth":
      return growthMessage(
        await readGrowthReport(db, partnerConfig, {
          now,
          force: action.refresh,
          fetcher: options.fetcher,
        }),
      );
    case "billing": {
      const [billing, revenue] = await Promise.all([
        readBilling(db),
        readRevenueReport(db, partnerConfig, {
          now,
          force: action.refresh,
          fetcher: options.fetcher,
        }).catch((error: unknown) => ({ unavailable: ownerControlErrorCode(error) })),
      ]);
      return billingMessage(billing, revenue);
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
      const client = createTelegramClient(config, options.fetcher);
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
    case "performance":
      return performanceMessage(await readPerformance(db));
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

async function defaultAdminForShop(): Promise<ShopifyAdminForShop> {
  const { unauthenticated } = await import("../shopify.server");
  return async (shopDomain) => (await unauthenticated.admin(shopDomain)).admin;
}

type WebhookHealth = {
  configured: boolean;
  matchesExpectedUrl: boolean;
  pendingUpdateCount: number;
  lastErrorAt: string | null;
  checkedAt: string;
};

async function readTelegramWebhookHealth(
  db: D1Database,
  client: ReturnType<typeof createTelegramClient>,
  expectedUrl: string,
  force: boolean,
  now: Date,
) {
  const cached = await readOwnerControlState<WebhookHealth>(db, WEBHOOK_CACHE_KEY);
  const age = cached ? now.getTime() - Date.parse(cached.updatedAt) : Number.POSITIVE_INFINITY;
  const maxAge = force ? WEBHOOK_REFRESH_COOLDOWN_MS : WEBHOOK_CACHE_TTL_MS;
  if (cached && age >= 0 && age < maxAge) return cached.value;

  const result = await client.getWebhookInfo();
  const state: WebhookHealth = {
    configured: result.configured,
    matchesExpectedUrl: result.url === expectedUrl,
    pendingUpdateCount: Math.max(0, result.pendingUpdateCount - 1),
    lastErrorAt: result.lastErrorAt,
    checkedAt: now.toISOString(),
  };
  await writeOwnerControlState(db, WEBHOOK_CACHE_KEY, state, now);
  return state;
}

function environmentLabel(value: string) {
  return value === "production" ? "Production" : value === "development" ? "Development" : value;
}
