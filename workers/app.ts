import { createRequestHandler } from "react-router";
import { applyRetention } from "../app/shop.server";

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(applyRetention(env.DB));
  },
} satisfies ExportedHandler<Env>;
