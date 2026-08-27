import { createContext, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "./shopify.server";

type AdminAuthentication = Awaited<ReturnType<typeof authenticate.admin>>;
type AppContext = LoaderFunctionArgs["context"];

const adminAuthenticationContext = createContext<Promise<AdminAuthentication> | null>(null);

// I loader padre e figlio partono in parallelo con lo stesso contesto React Router. Conservare
// subito la Promise evita due verifiche della medesima sessione senza condividere autenticazioni
// tra richieste o Worker diversi.
export function authenticateAdmin(request: Request, context: AppContext) {
  let pending = context.get(adminAuthenticationContext);
  if (!pending) {
    pending = authenticate.admin(request);
    context.set(adminAuthenticationContext, pending);
  }
  return pending;
}
