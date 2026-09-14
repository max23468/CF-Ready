import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

const SURFACES = new Set(["/app", "/app/rules", "/app/messages", "/app/guide", "/app/onboarding"]);

export function InstallationReporter({ installedAt }: { installedAt: string | null }) {
  const { pathname } = useLocation();
  const reported = useRef(new Set<string>());
  const pending = useRef(new Set<string>());

  useEffect(() => {
    const surface = pathname.replace(/\/$/, "");
    if (!installedAt || !SURFACES.has(surface)) return;
    const event = surface === "/app/onboarding" ? "onboarding_started" : "app_opened";
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
        const response = await fetch("/app/engagement", {
          method: "POST",
          headers: {
            "X-CF-Ready-Event": event,
            "X-CF-Ready-Installation": installedAt,
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
