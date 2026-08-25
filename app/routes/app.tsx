import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useNavigate, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { requestAppWindowNavigation } from "../app-window-navigation";
import { navigateFromShopifyEvent, restoreEmbeddedAdmin } from "../embedded-admin";
import { APP_API_KEY } from "../env.server";
import { resolveLocale, texts } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  return {
    apiKey: APP_API_KEY,
    shopDomain: session.shop,
    locale: resolveLocale(request),
  };
};

// Una voce visibile per rotta, e una sola. Il titolo dell'app usa la rotta predefinita `/`,
// che inoltra a `/app` senza mostrare una pagina intermedia (D-128, D-130).
export const NAV = [
  { href: "/app", label: "home" },
  { href: "/app/rules", label: "rules" },
  { href: "/app/messages", label: "messages" },
  { href: "/app/guide", label: "guide" },
] as const satisfies readonly { href: string; label: keyof Nav; home?: boolean }[];

type Nav = ReturnType<typeof texts>["nav"];

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function App() {
  const { apiKey, shopDomain, locale } = useLoaderData<typeof loader>();
  const t = texts(locale).nav;
  const navigate = useNavigate();
  const navigation = useNavigation();

  // App Bridge inoltra questi eventi per i link interni dei Web Components. Prima lo faceva
  // AppProvider, rimosso perché caricava gli script nel body anziché nel head richiesto da BFS.
  useEffect(() => {
    const handleNavigate = (event: Event) =>
      navigateFromShopifyEvent(event, (href) => requestAppWindowNavigation(window, href, navigate));

    document.addEventListener("shopify:navigate", handleNavigate);
    return () => document.removeEventListener("shopify:navigate", handleNavigate);
  }, [navigate]);

  // App Bridge cambia l'URL appena si clicca, mentre React Router aspetta il loader della
  // pagina nuova: senza un segnale il clic sembra ignorato e il merchant preme di nuovo.
  // L'indicatore è quello nativo dell'header dell'Admin.
  useEffect(() => {
    if (typeof shopify === "undefined") return;
    shopify.loading(navigation.state !== "idle");
  }, [navigation.state]);

  // Billing, ricariche o link esterni non devono mai lasciare CF Ready come pagina
  // autonoma: se manca la cornice, riapri la stessa rotta nell'Admin dello shop
  // autenticato. La guardia è sull'App root, quindi copre tutte le route e le azioni.
  useEffect(() => {
    restoreEmbeddedAdmin({
      embedded: window.self !== window.top,
      shopDomain,
      apiKey,
      appPath: window.location.pathname,
      replace: (url) => window.location.replace(url),
    });
  }, [apiKey, shopDomain]);

  return (
    <>
      <s-app-nav>
        {NAV.map((item) => (
          <s-link key={item.href} href={item.href}>
            {t[item.label]}
          </s-link>
        ))}
      </s-app-nav>
      <Outlet />
    </>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
