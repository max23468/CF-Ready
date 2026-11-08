import { texts } from "../../i18n";
import { formatDate } from "../../i18n/format";
import type { HomeData } from "./home.server";

export type CommercialState = "first_run" | "entitled" | "lapsed";

export function commercialState(
  data: Pick<HomeData, "entitlement" | "trialStatus">,
): CommercialState {
  if (data.entitlement.kind !== "none") return "entitled";
  return data.trialStatus === null ? "first_run" : "lapsed";
}

export function trialContinuityNotice(
  data: Pick<
    HomeData,
    | "locale"
    | "entitlement"
    | "trialStatus"
    | "trialEndsAt"
    | "remaining"
    | "firstChargeAt"
    | "accountStatus"
    | "errorCode"
  >,
): { tone: "info" | "warning"; text: string; action: string | null } | null {
  if (data.errorCode) return null;
  const t = texts(data.locale).trialContinuity;

  if (data.entitlement.kind === "none") {
    return commercialState(data) === "lapsed"
      ? { tone: "warning", text: t.expired, action: t.choosePlan }
      : null;
  }
  if (data.entitlement.kind === "one_time") return null;
  if (data.trialStatus !== "active" || data.remaining < 1) return null;

  if (data.entitlement.kind === "subscription") {
    if (data.accountStatus !== "active" || !data.firstChargeAt) return null;
    return {
      tone: "info",
      text: t.confirmed(formatDate(data.firstChargeAt, data.locale)),
      action: null,
    };
  }
  if (!data.trialEndsAt) return null;
  return {
    tone: data.remaining <= 3 ? "warning" : "info",
    text: t.trialActive(formatDate(data.trialEndsAt, data.locale)),
    action: t.choosePlan,
  };
}
