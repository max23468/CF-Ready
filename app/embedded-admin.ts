const SHOP_DOMAIN = /^([a-z0-9][a-z0-9-]*)\.myshopify\.com$/i;
const APP_ROUTE = /^\/app(?:\/|$)/;

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
