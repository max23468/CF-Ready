import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/_index/route.tsx"),
  route("app", "routes/app.tsx", [
    index("routes/app._index.tsx"),
    route("rules", "routes/app.rules.tsx"),
    route("messages", "routes/app.messages.tsx"),
    route("guide", "routes/app.guide.tsx"),
    route("onboarding", "routes/app.onboarding.tsx"),
    route("engagement", "routes/app.engagement.tsx"),
  ]),
  // Fuori dal layout autenticato: il beacon arriva senza session token e porta la propria firma.
  route("performance", "routes/performance.tsx"),
  route("auth/*", "routes/auth.$.tsx"),
] satisfies RouteConfig;
