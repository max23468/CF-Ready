const SHOP_DOMAIN = /^([a-z0-9][a-z0-9-]*)\.myshopify\.com$/i;
const APP_ROUTE = /^\/app(?:\/|$)/;

function appRoute(href: string, origin: string) {
  try {
    const base = new URL(origin);
    const target = new URL(href, base);
    return target.origin === base.origin && APP_ROUTE.test(target.pathname)
      ? `${target.pathname}${target.search}${target.hash}`
      : null;
  } catch {
    return null;
  }
}

export function appRouteFromShopifyEvent(event: Event, origin: string) {
  // Polaris emette un evento composed: il target può essere retargettizzato, mentre il link
  // sorgente resta nel percorso. La lettura sincrona di href mantiene la navigazione client-side.
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];

  for (const candidate of new Set<unknown>([event.target, ...path])) {
    const href = (
      candidate as { getAttribute?: (name: string) => string | null } | null
    )?.getAttribute?.("href");
    if (!href) continue;

    const route = appRoute(href, origin);
    if (route) return route;
  }

  return null;
}

export function navigateFromShopifyEvent(
  event: Event,
  origin: string,
  navigate: (href: string) => void,
) {
  const route = appRouteFromShopifyEvent(event, origin);
  if (!route) return false;
  navigate(route);
  return true;
}

export function embeddedAdminUrl(shopDomain: string, apiKey: string, appPath = "") {
  const shopName = SHOP_DOMAIN.exec(shopDomain)?.[1];
  if (!shopName || !apiKey) throw new Error("invalid_embedded_admin_target");

  const route = APP_ROUTE.test(appPath) ? appPath : "";
  const target = new URL("https://admin.shopify.com");
  target.pathname = `/store/${shopName}/apps/${encodeURIComponent(apiKey)}${route}`;
  return target.toString();
}

export function restoreEmbeddedAdmin({
  embedded,
  shopDomain,
  apiKey,
  appPath,
  replace,
}: {
  embedded: boolean;
  shopDomain: string;
  apiKey: string;
  appPath: string;
  replace: (url: string) => void;
}) {
  if (embedded) return false;
  replace(embeddedAdminUrl(shopDomain, apiKey, appPath));
  return true;
}
