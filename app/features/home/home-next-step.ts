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
      ? { text: t.home.nextStartTrial, href: null }
      : { text: t.home.nextConfigure, href: "/app/rules" };
  }
  if (state !== "entitled") return { text: t.home.nextChoosePlan, href: null };
  if (!configured) return { text: t.home.nextConfigure, href: "/app/rules" };
  return data.validationEnabled
    ? { text: t.home.nextTestOrder, href: null }
    : { text: t.home.nextActivate, href: null };
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
  const title =
    status === "active"
      ? t.home.titleActive
      : status === "lapsed"
        ? t.home.titleLapsed
        : firstRun
          ? t.home.titleNotStarted
          : t.home.titleDisabled;
  const tone = status === "active" ? "success" : status === "lapsed" ? "warning" : "neutral";
  return { badge, title, tone } as const;
}
