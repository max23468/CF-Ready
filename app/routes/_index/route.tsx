import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

// L'URL dell'app non mostra niente prima di OAuth: §24 vieta sia una UI interagibile prima
// dell'autenticazione sia il form che chiede il dominio dello store. Chi arriva senza `shop`
// non sta installando: se ne occupa `authenticate.admin`, che risponde con App Bridge e
// nessuna interfaccia.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { search } = new URL(request.url);

  throw redirect(`/app${search}`);
};
