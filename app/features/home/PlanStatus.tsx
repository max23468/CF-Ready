import { formatDate, texts } from "../../i18n";
import { commercialState } from "./commercial-state";
import type { HomeData } from "./home.server";

export function PlanStatus({ data }: { data: HomeData }) {
  const t = texts(data.locale);
  const status = planStatusText(data);

  return (
    <s-section slot="aside" heading={t.plan.heading}>
      <s-stack direction="block" gap="small-100">
        <s-paragraph>{status}</s-paragraph>
        {data.periodEnd && data.planKind !== "one_time" ? (
          <s-paragraph>
            {data.accountStatus === "ending"
              ? t.plan.periodEnds(formatDate(data.periodEnd, data.locale))
              : t.plan.nextCharge(formatDate(data.periodEnd, data.locale))}
          </s-paragraph>
        ) : null}
        {data.plan && !data.complimentary ? (
          <s-paragraph>
            {data.plan.generation === "launch"
              ? t.plan.generationLaunch
              : t.plan.generationStandard}
          </s-paragraph>
        ) : null}
      </s-stack>
    </s-section>
  );
}

function planStatusText(data: HomeData) {
  const t = texts(data.locale);
  if (data.entitlement.kind === "trial") {
    return t.plan.trial(formatDate(data.trialEndsAt, data.locale));
  }
  if (data.entitlement.kind === "one_time") {
    return data.complimentary ? t.plan.complimentary : t.plan.oneTime;
  }
  if (data.entitlement.kind === "subscription") {
    return t.plan.subscription(formatDate(data.entitlement.validThrough, data.locale));
  }
  if (data.trialStatus === "expired") return t.plan.trialOver;
  return commercialState(data) === "first_run" ? t.plan.notStartedStatus : t.plan.none;
}
