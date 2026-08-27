import type { LoaderFunctionArgs } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";

import { APP_API_KEY } from "./env.server";
import { resolveLocale } from "./i18n";

const APP_BRIDGE_URL = "https://cdn.shopify.com/shopifycloud/app-bridge.js";
const POLARIS_URL = "https://cdn.shopify.com/shopifycloud/polaris.js";

// §10.10: la lingua dichiarata dal documento deve coincidere con quella dei contenuti.
export const loader = ({ request }: LoaderFunctionArgs) => ({
  apiKey: APP_API_KEY,
  locale: resolveLocale(request),
});

export default function App() {
  const { apiKey, locale } = useLoaderData<typeof loader>();

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {import.meta.env.DEV ? <meta name="shopify-debug" content="web-vitals" /> : null}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        {/* Shopify richiede il bootstrap CDN sincrono nel head. L'ordine definisce App Bridge
            prima dei Web Components Polaris e impedisce che l'app si idrati con componenti
            ancora non registrati; doctor.config.json limita l'eccezione a queste due righe. */}
        <script src={APP_BRIDGE_URL} data-api-key={apiKey} />
        <script src={POLARIS_URL} />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
