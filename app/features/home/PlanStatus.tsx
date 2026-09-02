import { formatDate, texts } from "../../i18n";
import { commercialState } from "./commercial-state";
import type { HomeData } from "./home.server";

function entitlementStatus(data: HomeData) {
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
  if (commercialState(data) === "first_run") return t.plan.notStartedStatus;
  return t.plan.none;
}

function PeriodStatus({ data }: { data: HomeData }) {
  if (!data.periodEnd || data.planKind === "one_time") return null;

  const t = texts(data.locale);
  const formattedPeriodEnd = formatDate(data.periodEnd, data.locale);
  return (
    <s-paragraph>
      {data.accountStatus === "ending"
        ? t.plan.periodEnds(formattedPeriodEnd)
        : t.plan.nextCharge(formattedPeriodEnd)}
    </s-paragraph>
  );
}

function PlanGenerationStatus({ data }: { data: HomeData }) {
  if (!data.plan || data.complimentary) return null;

  const t = texts(data.locale);
  return (
    <s-paragraph>
      {data.plan.generation === "launch" ? t.plan.generationLaunch : t.plan.generationStandard}
    </s-paragraph>
  );
}

export function PlanStatus({ data }: { data: HomeData }) {
  const t = texts(data.locale);

  return (
    <s-section slot="aside" heading={t.plan.heading}>
      <s-stack direction="block" gap="small-100">
        <s-paragraph>{entitlementStatus(data)}</s-paragraph>
        <PeriodStatus data={data} />
        <PlanGenerationStatus data={data} />
      </s-stack>
    </s-section>
  );
}
