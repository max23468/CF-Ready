import { createContext, type LoaderFunctionArgs } from "react-router";
import type { createServerTiming } from "./server-timing.server";
import { readSessionTimings, type SessionTimingName } from "./session-storage.server";
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

export async function authenticateAdminTimed(
  request: Request,
  context: AppContext,
  timing: ReturnType<typeof createServerTiming>,
) {
  const startedAt = performance.now();
  const authentication = await authenticateAdmin(request, context);
  const duration = performance.now() - startedAt;
  timing.record("auth", duration);
  const sessionTiming = readSessionTimings(authentication.session);
  for (const [name, value] of Object.entries(sessionTiming) as [SessionTimingName, number][]) {
    timing.record(name, value);
  }
  if (sessionTiming.auth_session_store !== undefined) {
    const measured = Object.values(sessionTiming).reduce((sum, value) => sum + (value ?? 0), 0);
    timing.record("auth_token_exchange", Math.max(0, duration - measured));
  }
  return authentication;
}
