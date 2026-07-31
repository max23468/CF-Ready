import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
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

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function App() {
  const { apiKey, locale } = useLoaderData<typeof loader>();
  const t = texts(locale).nav;

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        {/* §15.2: Home è una voce permanente, quindi resta visibile invece di essere
            assorbita dal titolo dell'app con `rel="home"`. */}
        <s-link href="/app">{t.home}</s-link>
        <s-link href="/app/rules">{t.rules}</s-link>
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
