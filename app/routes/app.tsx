import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { env } from "cloudflare:workers";

import { resolveLocale, texts } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return {
    apiKey: (env as Env & { SHOPIFY_API_KEY?: string }).SHOPIFY_API_KEY || "",
    locale: resolveLocale(request),
  };
};

// `rel` non è fra le prop tipizzate di `s-link`: passarlo per spread evita di allargare i tipi
// del pacchetto per un solo attributo.
const HOME: Record<string, string> = { rel: "home" };

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function App() {
  const { apiKey, locale } = useLoaderData<typeof loader>();
  const t = texts(locale).nav;
  const navigation = useNavigation();

  // App Bridge cambia l'URL appena si clicca, mentre React Router aspetta il loader della
  // pagina nuova: senza un segnale il clic sembra ignorato e il merchant preme di nuovo.
  // L'indicatore è quello nativo dell'header dell'Admin.
  useEffect(() => {
    if (typeof shopify === "undefined") return;
    shopify.loading(navigation.state !== "idle");
  }, [navigation.state]);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        {/* Due link alla stessa rotta, con ruoli diversi. Il primo è visibile ed è la voce
            `Home` di §15.2: senza, chi non conosce la convenzione Shopify non sa che per
            tornare a casa si clicca il titolo dell'app. Il secondo non compare nel menu e serve
            solo a dichiarare ad App Bridge qual è la rotta di casa: senza quella dichiarazione
            il titolo dell'app punta alla radice dell'URL, che senza `shop` non sa quale store
            sia e finisce sul form di accesso. */}
        <s-link href="/app">{t.home}</s-link>
        <s-link href="/app" {...HOME}>
          {t.home}
        </s-link>
        <s-link href="/app/rules">{t.rules}</s-link>
        <s-link href="/app/messages">{t.messages}</s-link>
        <s-link href="/app/plan">{t.plan}</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
