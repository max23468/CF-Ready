export const APP_WINDOW_NAVIGATION_MESSAGE_TYPE = "cf-ready:navigate-from-app-window";

const APP_ROUTE = /^\/app(?:\/|$)/;

type AppWindowFrame = Pick<Window, "location" | "opener">;
type NavigationMessage = Pick<MessageEvent, "data" | "origin" | "source">;
type NavigationActions = { hideWindow(): Promise<void>; navigate(href: string): void };

export function appWindowSource(document: Pick<Document, "getElementById">, id: string) {
  // Shopify espone il frame della finestra aperta tramite contentWindow.
  // Il parent dell'iframe è l'Admin, non la finestra che invia questi messaggi.
  const appWindow = document.getElementById(id) as
    | (HTMLElement & { readonly contentWindow?: Window | null })
    | null;
  return appWindow?.contentWindow ?? null;
}

export function requestAppWindowNavigation(
  frame: AppWindowFrame,
  href: string,
  fallback: (href: string) => void,
) {
  if (!frame.opener || !APP_ROUTE.test(href)) {
    fallback(href);
    return "fallback" as const;
  }

  frame.opener.postMessage(
    { type: APP_WINDOW_NAVIGATION_MESSAGE_TYPE, href },
    frame.location.origin,
  );
  return "opener" as const;
}

export function isAppWindowNavigation(
  event: NavigationMessage,
  expectedOrigin: string,
  expectedSource: Window | null,
) {
  return (
    expectedSource !== null &&
    event.source === expectedSource &&
    event.origin === expectedOrigin &&
    typeof event.data === "object" &&
    event.data !== null &&
    "type" in event.data &&
    event.data.type === APP_WINDOW_NAVIGATION_MESSAGE_TYPE &&
    "href" in event.data &&
    typeof event.data.href === "string" &&
    APP_ROUTE.test(event.data.href)
  );
}

export async function handleAppWindowNavigation(
  event: NavigationMessage,
  expectedOrigin: string,
  actions: NavigationActions,
  expectedSource: Window | null,
) {
  if (!isAppWindowNavigation(event, expectedOrigin, expectedSource)) return false;
  await actions.hideWindow();
  actions.navigate(event.data.href);
  return true;
}
