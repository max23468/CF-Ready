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
export const RULES_CHECKOUT_LABELS_ANCHOR = "etichette-checkout";
export const TAX_CODE_LABEL_FAQ_ANCHOR = "faq-etichetta-codice-fiscale";
export const TAX_CODE_LABEL_FAQ_HREF = `${APP_ROUTES.guide}#${TAX_CODE_LABEL_FAQ_ANCHOR}`;

// L'App URL è `/app` (D-166). La Home è dichiarata una sola volta con `rel="home"`: App Bridge
// la nasconde dal menu e il nome dell'app porta a `/app` (BFS 4.1.4, D-230).
export const NAV = [
  { href: APP_ROUTES.home, label: "home", rel: "home" },
  { href: APP_ROUTES.rules, label: "rules" },
  { href: APP_ROUTES.messages, label: "messages" },
  { href: APP_ROUTES.guide, label: "guide" },
] as const satisfies readonly {
  href: string;
  label: keyof ReturnType<typeof texts>["nav"];
  rel?: "home";
}[];
