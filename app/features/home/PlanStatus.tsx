import { formatDate, texts } from "../../i18n";
import { trialContinuityTexts } from "../../i18n/trial-continuity";
import { commercialState } from "./commercial-state";
import { showPlans } from "./show-plans";
import type { HomeData } from "./home.server";

export function PlanStatus({ data }: { data: HomeData }) {
  const t = texts(data.locale);
  const status = planStatusText(data);

  return (
    <s-section heading={t.plan.heading}>
      <s-stack direction="block" gap="small-100" alignItems="start">
        <s-paragraph>{status}</s-paragraph>
        {/* La prova in corso non ha più il banner nella card principale: l'azione sta qui. */}
        {data.entitlement.kind === "trial" ? (
          <s-link onClick={showPlans}>{trialContinuityTexts(data.locale).choosePlan}</s-link>
        ) : null}
        {data.periodEnd && data.planKind !== "one_time" ? (
          <s-paragraph>
            {data.accountStatus === "ending"
              ? t.plan.periodEnds(formatDate(data.periodEnd, data.locale))
              : t.plan.nextCharge(formatDate(data.periodEnd, data.locale))}
          </s-paragraph>
        ) : null}
        {/* Con il pagamento unico non ci sono altri addebiti: i prezzi di lancio non contano. */}
        {data.plan && !data.complimentary && data.entitlement.kind !== "one_time" ? (
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
