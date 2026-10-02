import type { HomeData } from "./home.server";
import type { texts } from "../../i18n";

export function homeNextStep(
  data: Pick<HomeData, "rules" | "validationEnabled">,
  state: "entitled" | "first_run" | "lapsed",
  t: ReturnType<typeof texts>,
) {
  const configured = data.rules.taxCode !== "unmanaged" || data.rules.pec !== "unmanaged";
  if (state === "first_run") {
    return configured
      ? { text: t.home.nextStartTrial, href: null, label: null }
      : { text: t.home.nextConfigure, href: "/app/rules", label: t.nav.rules };
  }
  if (state !== "entitled") return { text: t.home.nextChoosePlan, href: null, label: null };
  if (!configured) return { text: t.home.nextConfigure, href: "/app/rules", label: t.nav.rules };
  return data.validationEnabled
    ? { text: t.home.nextTestOrder, href: "shopify://admin/orders", label: t.home.openOrders }
    : { text: t.home.nextActivate, href: null, label: null };
}

export function homeValidationPresentation(
  data: Pick<HomeData, "locale" | "validationEnabled">,
  status: "active" | "disabled" | "lapsed",
  firstRun: boolean,
  t: ReturnType<typeof texts>,
) {
  const badge = data.validationEnabled
    ? t.home.badgeActive
    : firstRun
      ? t.home.badgeNotStarted
      : t.home.badgeInactive;
  // Il titolo della card è fisso: lo stato lo dice il badge, e solo il piano scaduto aggiunge
  // una frase perché il badge "Attiva" da solo sarebbe fuorviante.
  const note = status === "lapsed" ? t.home.titleLapsed : null;
  const tone = status === "active" ? "success" : status === "lapsed" ? "warning" : "neutral";
  return { badge, note, tone } as const;
}
