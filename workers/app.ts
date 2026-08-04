import { createRequestHandler } from "react-router";
import { createAppContext } from "../app/context.server";
import { applyRetention } from "../app/shop.server";
import { limitFormBody } from "./form-body";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env) {
    const limited = await limitFormBody(request);
    if (limited instanceof Response) return limited;
    return requestHandler(limited, createAppContext(env.DB));
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(applyRetention(env.DB));
  },
} satisfies ExportedHandler<Env>;
