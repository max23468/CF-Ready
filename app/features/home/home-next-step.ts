import type { HomeData } from "./home.server";
import type { texts } from "../../i18n";

function rulesConfigured(rules: HomeData["rules"]) {
  return rules.taxCode !== "unmanaged" || rules.pec !== "unmanaged";
}

// H-6: ogni stato ha un testo e un'azione, così la colonna laterale non cambia struttura.
// `href: null` porta alla scelta del piano nella stessa pagina.
export function homeNextStep(
  data: Pick<HomeData, "rules" | "validationEnabled">,
  state: "entitled" | "first_run" | "lapsed",
  t: ReturnType<typeof texts>,
) {
  const configure = { text: t.home.nextConfigure, href: "/app/rules", label: t.nav.rules };
  const configured = rulesConfigured(data.rules);
  if (state === "first_run") {
    return configured
      ? { text: t.home.nextStartTrial, href: null, label: t.home.showPlans }
      : configure;
  }
  if (state !== "entitled") {
    return { text: t.home.nextChoosePlan, href: null, label: t.home.showPlans };
  }
  if (!configured) return configure;
  return data.validationEnabled
    ? { text: t.home.nextTestOrder, href: "shopify://admin/orders", label: t.home.openOrders }
    : { text: t.home.nextActivate, href: "/app/rules", label: t.nav.rules };
}

export function homeValidationPresentation(
  data: Pick<HomeData, "locale" | "validationEnabled" | "rules">,
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
  // H-5: il verde dice che il checkout è protetto; senza campi configurati non lo è.
  const tone =
    status === "lapsed"
      ? "warning"
      : status === "active" && rulesConfigured(data.rules)
        ? "success"
        : "neutral";
  return { badge, note, tone } as const;
}
