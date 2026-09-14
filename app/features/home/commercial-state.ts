import { formatDate } from "../../i18n/format";
import { trialContinuityTexts } from "../../i18n/trial-continuity";
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
    | "validationEnabled"
    | "errorCode"
  >,
): { tone: "info" | "warning"; text: string; detail: string | null; action: string | null } | null {
  if (data.errorCode) return null;
  const t = trialContinuityTexts(data.locale);

  if (data.entitlement.kind === "none") {
    return commercialState(data) === "lapsed"
      ? { tone: "warning", text: t.expired, detail: null, action: t.choosePlan }
      : null;
  }
  if (data.entitlement.kind === "one_time") return null;
  if (data.trialStatus !== "active" || data.remaining < 1) return null;

  // Un piano già confermato non deve ricevere solleciti basati sulla sola prova locale.
  if (data.entitlement.kind === "subscription") {
    if (data.accountStatus !== "active" || !data.firstChargeAt) return null;
    return {
      tone: "info",
      text: t.confirmed(formatDate(data.firstChargeAt, data.locale)),
      detail: null,
      action: null,
    };
  }
  if (!data.trialEndsAt) return null;
  const date = formatDate(data.trialEndsAt, data.locale);
  return {
    tone: data.remaining <= 3 ? "warning" : "info",
    text: data.validationEnabled ? t.trialActive(date) : t.trialInactive(date),
    detail: t.approvalHelp,
    action: t.choosePlan,
  };
}
