import { createRequestHandler } from "react-router";
import { createAppContext } from "../app/context.server";
import { applyRetention } from "../app/shop.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  fetch(request, env) {
    return requestHandler(request, createAppContext(env.DB));
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(applyRetention(env.DB));
  },
} satisfies ExportedHandler<Env>;
