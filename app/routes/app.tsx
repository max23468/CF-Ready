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

// Una voce per rotta, e una sola. `rel="home"` dichiara ad App Bridge la rotta di casa e la
// nasconde dal menu: il titolo dell'app diventa il modo per tornarci. Dichiarare `/app` due
// volte — una visibile e una con `rel` — lasciava l'Admin senza menu quando si arrivava alla
// Home da un link dentro una pagina (D-130).
export const NAV = [
  { href: "/app", label: "home", home: true },
  { href: "/app/rules", label: "rules" },
  { href: "/app/messages", label: "messages" },
  { href: "/app/guide", label: "guide" },
] as const satisfies readonly { href: string; label: keyof Nav; home?: boolean }[];

type Nav = ReturnType<typeof texts>["nav"];

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
        {NAV.map((item) => (
          <s-link key={item.href} href={item.href} {...("home" in item ? HOME : {})}>
            {t[item.label]}
          </s-link>
        ))}
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
