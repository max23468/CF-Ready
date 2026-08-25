export const APP_WINDOW_NAVIGATION_MESSAGE_TYPE = "cf-ready:navigate-from-app-window";

const APP_ROUTE = /^\/app(?:\/|$)/;

type AppWindowFrame = Pick<Window, "location" | "opener">;
type NavigationMessage = Pick<MessageEvent, "data" | "origin">;
type NavigationActions = { hideWindow(): Promise<void>; navigate(href: string): void };

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

export function isAppWindowNavigation(event: NavigationMessage, expectedOrigin: string) {
  return (
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
) {
  if (!isAppWindowNavigation(event, expectedOrigin)) return false;
  await actions.hideWindow();
  actions.navigate(event.data.href);
  return true;
}
