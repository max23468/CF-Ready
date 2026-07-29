import type { ActionFunctionArgs } from "react-router";
import { authenticate, sessionStorage } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  await sessionStorage.deleteSessionsByShop(shop);

  return new Response();
};
