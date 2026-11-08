import type { texts } from "./i18n";

export const APP_ROUTES = {
  home: "/app",
  rules: "/app/rules",
  messages: "/app/messages",
  guide: "/app/guide",
  onboarding: "/app/onboarding",
} as const;

export const APP_ROUTE = /^\/app(?:\/|$)/;

export const RULES_SIMULATOR_ANCHOR = "simulatore";

// L'App URL è `/app` (D-166): titolo e apertura dall'Admin arrivano alla Home senza il redirect
// da `/`.
export const NAV = [
  { href: APP_ROUTES.home, label: "home" },
  { href: APP_ROUTES.rules, label: "rules" },
  { href: APP_ROUTES.messages, label: "messages" },
  { href: APP_ROUTES.guide, label: "guide" },
] as const satisfies readonly { href: string; label: keyof ReturnType<typeof texts>["nav"] }[];
