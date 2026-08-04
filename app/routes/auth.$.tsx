import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { pathname, search } = new URL(request.url);

  // Tolta la pagina di accesso (D-128), `/auth/login` ricade qui: la libreria riconosce il
  // `loginPath` che deriva da `authPathPrefix` e risponde 500 chiedendo `shopify.login()`, che
  // non esiste più. Lì non c'è più niente da servire, e la destinazione è quella della radice.
  if (pathname === "/auth/login") {
    throw redirect(`/app${search}`);
  }

  await authenticate.admin(request);

  return null;
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
