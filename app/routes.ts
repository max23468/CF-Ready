import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/_index/route.tsx"),
  route("app", "routes/app.tsx", [
    index("routes/app._index.tsx"),
    route("rules", "routes/app.rules.tsx"),
    route("messages", "routes/app.messages.tsx"),
    route("guide", "routes/app.guide.tsx"),
    route("onboarding", "routes/app.onboarding.tsx"),
  ]),
  route("auth/login", "routes/auth.login/route.tsx"),
  route("auth/*", "routes/auth.$.tsx"),
  route("webhooks/app/uninstalled", "routes/webhooks.app.uninstalled.tsx"),
  route("webhooks/app/scopes_update", "routes/webhooks.app.scopes_update.tsx"),
  route("webhooks/shop/update", "routes/webhooks.shop.update.tsx"),
  route("webhooks/app/billing", "routes/webhooks.app.billing.tsx"),
  route("webhooks/compliance", "routes/webhooks.compliance.tsx"),
] satisfies RouteConfig;
