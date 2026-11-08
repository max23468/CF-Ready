import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { APP_ROUTES } from "./app-routes";
import {
  ENGAGEMENT_ENDPOINT,
  ENGAGEMENT_EVENT_HEADER,
  ENGAGEMENT_INSTALLATION_HEADER,
} from "./engagement-contract";

const SURFACES = new Set<string>(Object.values(APP_ROUTES));

export function InstallationReporter({ installedAt }: { installedAt: string | null }) {
  const { pathname } = useLocation();
  const reported = useRef(new Set<string>());
  const pending = useRef(new Set<string>());

  // È un beacon di visibilità, non un caricamento dati: nessuna risposta aggiorna la UI.
  // Ref e batch D1 deduplicano StrictMode e retry; keepalive dopo l'uscita è intenzionale.
  // React documenta questo caso in synchronizing-with-effects#sending-analytics.
  // react-doctor-disable-next-line react-doctor/no-fetch-in-effect
  useEffect(() => {
    const surface = pathname.replace(/\/$/, "");
    if (!installedAt || !SURFACES.has(surface)) return;
    const event = surface === APP_ROUTES.onboarding ? "onboarding_started" : "app_opened";
    const key = `${installedAt}:${event}`;

    const report = async () => {
      if (
        document.visibilityState !== "visible" ||
        reported.current.has(key) ||
        pending.current.has(key) ||
        typeof shopify === "undefined"
      ) {
        return;
      }
      pending.current.add(key);
      try {
        // App Bridge autentica la fetch same-origin con il token Shopify corrente.
        const response = await fetch(ENGAGEMENT_ENDPOINT, {
          method: "POST",
          headers: {
            [ENGAGEMENT_EVENT_HEADER]: event,
            [ENGAGEMENT_INSTALLATION_HEADER]: installedAt,
          },
          keepalive: true,
        });
        if (response.status === 204) {
          reported.current.add(key);
          reported.current.add(`${installedAt}:app_opened`);
        }
      } catch {
        // Una rilevazione fallita non interferisce con l'app. Nessun dato viene scritto nei log.
      } finally {
        pending.current.delete(key);
      }
    };

    // Si registra il componente montato e visibile, non un loader, un prefetch o il callback OAuth.
    void report();
    document.addEventListener("visibilitychange", report);
    window.addEventListener("online", report);
    return () => {
      document.removeEventListener("visibilitychange", report);
      window.removeEventListener("online", report);
    };
  }, [installedAt, pathname]);

  return null;
}
