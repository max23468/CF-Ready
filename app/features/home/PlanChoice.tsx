import { formatMoney, texts } from "../../i18n";
import { commercialState } from "./commercial-state";
import type { HomeData } from "./home.server";

type PlanChoiceProps = {
  data: HomeData;
  busy: boolean;
  pendingIntent: string | null;
  submit: (intent: string) => void;
  firstCharge: string;
};

function StartTrialSection({ data, busy, pendingIntent, submit }: PlanChoiceProps) {
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

function MonthlyPlan({ data, busy, pendingIntent, submit, firstCharge }: PlanChoiceProps) {
  const t = texts(data.locale);
  return (
    <s-stack direction="block" gap="small-100">
      <s-stack direction="inline" gap="small-100" alignItems="center">
        <s-text type="strong">{t.plan.monthlyName}</s-text>
        <s-text>{formatMoney(data.plan!.monthly, data.locale)}</s-text>
      </s-stack>
      <s-paragraph>{firstCharge}</s-paragraph>
      {data.planKind === "monthly" ? null : (
        <s-stack direction="inline" gap="base">
          <s-button
            disabled={busy}
            loading={pendingIntent === "monthly"}
            onClick={() => submit("monthly")}
          >
            {data.planKind === "annual" ? t.plan.monthlySwitch : t.plan.monthlyStart}
          </s-button>
        </s-stack>
      )}
    </s-stack>
  );
}

function AnnualPlan(props: PlanChoiceProps & { trialNeverStarted: boolean }) {
  const { data, busy, pendingIntent, submit, firstCharge, trialNeverStarted } = props;
  const t = texts(data.locale);
  return (
    <s-stack direction="block" gap="small-100">
      <s-stack direction="inline" gap="small-100" alignItems="center">
        <s-text type="strong">{t.plan.annualName}</s-text>
        <s-text>{formatMoney(data.plan!.annual, data.locale)}</s-text>
        <s-badge>{t.plan.recommended}</s-badge>
      </s-stack>
      <s-paragraph>{firstCharge}</s-paragraph>
      {data.planKind === "annual" ? null : (
        <s-stack direction="inline" gap="base">
          <s-button
            variant={trialNeverStarted ? undefined : "primary"}
            disabled={busy}
            loading={pendingIntent === "annual"}
            onClick={() => submit("annual")}
          >
            {data.planKind === "monthly" ? t.plan.annualSwitch : t.plan.annualStart}
          </s-button>
        </s-stack>
      )}
    </s-stack>
  );
}

function OneTimePlan(props: PlanChoiceProps & { trialNeverStarted: boolean }) {
  const { data, busy, pendingIntent, submit, trialNeverStarted } = props;
  const t = texts(data.locale);
  return (
    <s-stack direction="block" gap="small-100">
      <s-stack direction="inline" gap="small-100" alignItems="center">
        <s-text type="strong">{t.plan.oneTimeName}</s-text>
        <s-text>{formatMoney(data.plan!.one_time, data.locale)}</s-text>
      </s-stack>
      <s-paragraph>
        {trialNeverStarted ? t.plan.oneTimeChargeNotStarted : t.plan.oneTimeCharge}
      </s-paragraph>
      {data.entitlement.kind === "subscription" && data.creditEstimate ? (
        <>
          <s-paragraph>
            {t.plan.netCost(
              formatMoney(Math.max(0, data.plan!.one_time - data.creditEstimate), data.locale),
            )}
          </s-paragraph>
          <s-paragraph>
            {t.plan.creditEstimate(formatMoney(data.creditEstimate, data.locale))}
          </s-paragraph>
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

function CancellationChoice({ data, busy, pendingIntent }: PlanChoiceProps) {
  if (data.entitlement.kind !== "subscription") return null;

  const t = texts(data.locale);
  return (
    <>
      <s-divider />
      <s-stack direction="block" gap="small-100">
        <s-paragraph>
          {data.accountStatus === "ending" ? t.plan.endingAlready : t.plan.cancelBody}
        </s-paragraph>
        {data.accountStatus === "ending" ? null : (
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

function PlanOptions(props: PlanChoiceProps & { trialNeverStarted: boolean }) {
  const t = texts(props.data.locale);
  return (
    <s-stack direction="block" gap="base">
      <s-paragraph>{t.plan.chooseBody}</s-paragraph>
      <MonthlyPlan {...props} />
      <s-divider />
      <AnnualPlan {...props} />
      <s-divider />
      <OneTimePlan {...props} />
      <CancellationChoice {...props} />
    </s-stack>
  );
}

function choiceHeading(data: HomeData, trialNeverStarted: boolean) {
  const t = texts(data.locale);
  if (data.entitlement.kind === "one_time") return t.plan.oneTimeName;
  return trialNeverStarted ? t.plan.chooseNowHeading : t.plan.chooseHeading;
}

function PlanSelection(props: PlanChoiceProps & { trialNeverStarted: boolean }) {
  const { data, trialNeverStarted } = props;
  const t = texts(data.locale);
  const onOneTime = data.entitlement.kind === "one_time";
  return (
    <s-section heading={choiceHeading(data, trialNeverStarted)}>
      {onOneTime || !data.plan ? (
        <s-paragraph>
          {onOneTime
            ? data.complimentary
              ? t.plan.complimentarySettled
              : t.plan.oneTimeSettled
            : t.plan.none}
        </s-paragraph>
      ) : (
        <PlanOptions {...props} />
      )}
    </s-section>
  );
}

function CancellationModal({ data, pendingIntent, submit }: PlanChoiceProps) {
  const t = texts(data.locale);
  return (
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
  );
}

export function PlanChoice(props: PlanChoiceProps) {
  const trialNeverStarted = commercialState(props.data) === "first_run";
  const sharedProps = { ...props, trialNeverStarted };

  return (
    <>
      <s-box id="plans" paddingBlockEnd="base">
        <s-stack direction="block" gap="base">
          {trialNeverStarted ? <StartTrialSection {...props} /> : null}
          <PlanSelection {...sharedProps} />
        </s-stack>
      </s-box>
      <CancellationModal {...props} />
    </>
  );
}
