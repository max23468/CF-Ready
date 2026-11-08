import { APP_ROUTES } from "../../app-routes";
import { hasManagedField } from "../../config";
import type { texts } from "../../i18n";
import type { CommercialState } from "./commercial-state";
import type { HomeData } from "./home.server";

// `href: null` porta alla scelta del piano nella stessa pagina.
export function homeNextStep(
  data: Pick<HomeData, "rules" | "validationEnabled">,
  state: CommercialState,
  t: ReturnType<typeof texts>,
) {
  const configure = { text: t.home.nextConfigure, href: APP_ROUTES.rules, label: t.nav.rules };
  const configured = hasManagedField(data.rules);
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
    : { text: t.home.nextActivate, href: APP_ROUTES.rules, label: t.nav.rules };
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
  const note = status === "lapsed" ? t.home.titleLapsed : null;
  const tone =
    status === "lapsed"
      ? "warning"
      : status === "active" && hasManagedField(data.rules)
        ? "success"
        : "neutral";
  return { badge, note, tone } as const;
}
