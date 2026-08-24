import type { HomeData } from "./home.server";

export type CommercialState = "first_run" | "entitled" | "lapsed";

export function commercialState(
  data: Pick<HomeData, "entitlement" | "trialStatus">,
): CommercialState {
  if (data.entitlement.kind !== "none") return "entitled";
  return data.trialStatus === null ? "first_run" : "lapsed";
}
