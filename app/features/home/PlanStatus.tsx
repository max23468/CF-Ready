import { formatDate, texts } from "../../i18n";
import type { HomeData } from "./home.server";

export function PlanStatus({ data }: { data: HomeData }) {
  const t = texts(data.locale);
  const onOneTime = data.entitlement.kind === "one_time";

  return (
    <s-section slot="aside" heading={t.plan.heading}>
      <s-stack direction="block" gap="small-100">
        <s-paragraph>
          {data.entitlement.kind === "trial"
            ? t.plan.trial(formatDate(data.trialEndsAt, data.locale))
            : onOneTime
              ? t.plan.oneTime
              : data.entitlement.kind === "subscription"
                ? t.plan.subscription(formatDate(data.entitlement.validThrough, data.locale))
                : data.trialStatus === "expired"
                  ? t.plan.trialOver
                  : t.plan.none}
        </s-paragraph>
        {data.periodEnd && data.planKind !== "one_time" ? (
          <s-paragraph>
            {data.accountStatus === "ending"
              ? t.plan.periodEnds(formatDate(data.periodEnd, data.locale))
              : t.plan.nextCharge(formatDate(data.periodEnd, data.locale))}
          </s-paragraph>
        ) : null}
        {data.plan ? (
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
