import { formatMoney, texts } from "../../i18n";
import { commercialState } from "./commercial-state";
import type { HomeData } from "./home.server";

type PlanProps = {
  data: HomeData;
  busy: boolean;
  pendingIntent: string | null;
  submit: (intent: string) => void;
  firstCharge: string;
};

export function PlanChoice(props: PlanProps) {
  const { data, pendingIntent, submit } = props;
  const t = texts(data.locale);
  const trialNeverStarted = commercialState(data) === "first_run";
  return (
    <>
      <s-box id="plans" paddingBlockEnd="base">
        <s-stack direction="block" gap="base">
          {trialNeverStarted ? <StartTrialSection {...props} /> : null}
          <PlanSelection {...props} trialNeverStarted={trialNeverStarted} />
        </s-stack>
      </s-box>
      <s-modal
        id="cancel-renewal"
        heading={t.plan.cancelRenewal}
        accessibilityLabel={t.plan.cancelBody}
      >
        <s-paragraph>{t.plan.cancelBody}</s-paragraph>
        <s-button slot="secondary-actions" commandFor="cancel-renewal" command="--hide">
          {t.common.cancel}
        </s-button>
        <s-button
          slot="primary-action"
          variant="primary"
          loading={pendingIntent === "cancel"}
          commandFor="cancel-renewal"
          command="--hide"
          onClick={() => submit("cancel")}
        >
          {t.plan.cancelRenewal}
        </s-button>
      </s-modal>
    </>
  );
}

function StartTrialSection({ data, busy, pendingIntent, submit }: PlanProps) {
  const t = texts(data.locale);
  return (
    <s-section heading={t.plan.notStartedHeading}>
      <s-stack direction="block" gap="base">
        <s-paragraph>{t.plan.notStartedBody}</s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button
            variant="primary"
            disabled={busy || !data.eligible}
            loading={pendingIntent === "start_trial"}
            onClick={() => submit("start_trial")}
          >
            {t.plan.startTrial}
          </s-button>
        </s-stack>
        <s-paragraph>{t.plan.orChoose}</s-paragraph>
      </s-stack>
    </s-section>
  );
}

function PlanSelection(props: PlanProps & { trialNeverStarted: boolean }) {
  const { data, trialNeverStarted } = props;
  const t = texts(data.locale);
  const onOneTime = data.entitlement.kind === "one_time";
  const heading = onOneTime
    ? t.plan.oneTimeName
    : trialNeverStarted
      ? t.plan.chooseNowHeading
      : t.plan.chooseHeading;
  if (onOneTime || !data.plan) {
    return (
      <s-section heading={heading}>
        <s-paragraph>
          {onOneTime
            ? data.complimentary
              ? t.plan.complimentarySettled
              : t.plan.oneTimeSettled
            : t.plan.none}
        </s-paragraph>
      </s-section>
    );
  }
  return (
    <s-section heading={heading}>
      <s-stack direction="block" gap="base">
        <s-paragraph>{t.plan.chooseBody}</s-paragraph>
        <RecurringPlanOption {...props} kind="monthly" />
        <s-divider />
        <RecurringPlanOption {...props} kind="annual" />
        <s-divider />
        <OneTimePlanOption {...props} />
        <SubscriptionCancellation {...props} />
      </s-stack>
    </s-section>
  );
}

function RecurringPlanOption({
  data,
  busy,
  pendingIntent,
  submit,
  firstCharge,
  trialNeverStarted,
  kind,
}: PlanProps & { trialNeverStarted: boolean; kind: "monthly" | "annual" }) {
  const t = texts(data.locale);
  const annual = kind === "annual";
  const active = data.planKind === kind;
  const label = annual ? t.plan.annualName : t.plan.monthlyName;
  const actionLabel = annual
    ? data.planKind === "monthly"
      ? t.plan.annualSwitch
      : t.plan.annualStart
    : data.planKind === "annual"
      ? t.plan.monthlySwitch
      : t.plan.monthlyStart;
  return (
    <s-stack direction="block" gap="small-100">
      <s-stack direction="inline" gap="small-100" alignItems="center">
        <s-text type="strong">{label}</s-text>
        <s-text>{formatMoney(data.plan![kind], data.locale)}</s-text>
        {annual ? <s-badge>{t.plan.recommended}</s-badge> : null}
      </s-stack>
      <s-paragraph>{firstCharge}</s-paragraph>
      {active ? null : (
        <s-stack direction="inline" gap="base">
          <s-button
            variant={annual && !trialNeverStarted ? "primary" : undefined}
            disabled={busy}
            loading={pendingIntent === kind}
            onClick={() => submit(kind)}
          >
            {actionLabel}
          </s-button>
        </s-stack>
      )}
    </s-stack>
  );
}

function OneTimePlanOption({
  data,
  busy,
  pendingIntent,
  submit,
  trialNeverStarted,
}: PlanProps & {
  trialNeverStarted: boolean;
}) {
  const t = texts(data.locale);
  const credit =
    data.entitlement.kind === "subscription" && data.creditEstimate
      ? {
          net: formatMoney(Math.max(0, data.plan!.one_time - data.creditEstimate), data.locale),
          value: formatMoney(data.creditEstimate, data.locale),
        }
      : null;
  return (
    <s-stack direction="block" gap="small-100">
      <s-stack direction="inline" gap="small-100" alignItems="center">
        <s-text type="strong">{t.plan.oneTimeName}</s-text>
        <s-text>{formatMoney(data.plan!.one_time, data.locale)}</s-text>
      </s-stack>
      <s-paragraph>
        {trialNeverStarted ? t.plan.oneTimeChargeNotStarted : t.plan.oneTimeCharge}
      </s-paragraph>
      {credit ? (
        <>
          <s-paragraph>{t.plan.netCost(credit.net)}</s-paragraph>
          <s-paragraph>{t.plan.creditEstimate(credit.value)}</s-paragraph>
        </>
      ) : null}
      <s-stack direction="inline" gap="base">
        <s-button
          disabled={busy}
          loading={pendingIntent === "one_time"}
          onClick={() => submit("one_time")}
        >
          {data.entitlement.kind === "none" ? t.plan.oneTimeStart : t.plan.oneTimeSwitch}
        </s-button>
      </s-stack>
    </s-stack>
  );
}

function SubscriptionCancellation({ data, busy, pendingIntent }: PlanProps) {
  const t = texts(data.locale);
  if (data.entitlement.kind !== "subscription") return null;
  const ending = data.accountStatus === "ending";
  return (
    <>
      <s-divider />
      <s-stack direction="block" gap="small-100">
        <s-paragraph>{ending ? t.plan.endingAlready : t.plan.cancelBody}</s-paragraph>
        {ending ? null : (
          <s-stack direction="inline" gap="base">
            <s-button
              disabled={busy}
              loading={pendingIntent === "cancel"}
              commandFor="cancel-renewal"
              command="--show"
            >
              {t.plan.cancelRenewal}
            </s-button>
          </s-stack>
        )}
      </s-stack>
    </>
  );
}
