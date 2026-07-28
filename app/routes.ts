import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/_index/route.tsx"),
  route("app", "routes/app.tsx", [index("routes/app._index.tsx")]),
  route("auth/login", "routes/auth.login/route.tsx"),
  route("auth/*", "routes/auth.$.tsx"),
  route("webhooks/app/uninstalled", "routes/webhooks.app.uninstalled.tsx"),
  route("webhooks/app/scopes_update", "routes/webhooks.app.scopes_update.tsx"),
] satisfies RouteConfig;
