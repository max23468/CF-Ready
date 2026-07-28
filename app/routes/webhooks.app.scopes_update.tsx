import type { ActionFunctionArgs } from "react-router";
import { authenticate, sessionStorage } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session } = await authenticate.webhook(request);

  if (session) {
    session.scope = (payload.current as string[]).join(",");
    await sessionStorage.storeSession(session);
  }

  return new Response();
};
