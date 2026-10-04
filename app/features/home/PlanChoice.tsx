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
      <s-box paddingBlockEnd="base">
        <div id="plans" className="home-plans" tabIndex={-1}>
          <s-stack direction="block" gap="base">
            {trialNeverStarted ? <StartTrialSection {...props} /> : null}
            <PlanSelection {...props} trialNeverStarted={trialNeverStarted} />
          </s-stack>
        </div>
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
            disabled={busy}
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
    ? t.plan.includedHeading
    : trialNeverStarted
      ? t.plan.chooseNowHeading
      : t.plan.chooseHeading;
  if (onOneTime || !data.plan) {
    return (
      <s-section heading={heading}>
        <s-stack direction="block" gap="small-100">
          <s-paragraph>
            {onOneTime
              ? data.complimentary
                ? t.plan.complimentarySettled
                : t.plan.oneTimeSettled
              : t.plan.none}
          </s-paragraph>
          {onOneTime && !data.complimentary ? <ConversionCreditNote data={data} /> : null}
        </s-stack>
      </s-section>
    );
  }
  return (
    <s-section heading={heading}>
      <s-stack direction="block" gap="base">
        <s-paragraph>{t.plan.chooseBody}</s-paragraph>
        {/* Mensile e annuale hanno lo stesso primo addebito: la data si dice una volta. */}
        <s-paragraph>{props.firstCharge}</s-paragraph>
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
        {/* H-4: il nome è il titolo dell'opzione, un gradino sotto il prezzo. */}
        <s-heading fontSize="large">{label}</s-heading>
        {/* P2-T4: l'unico badge della scelta del piano, nel tono del banner della prova. */}
        {annual ? <s-badge tone="info">{t.plan.recommended}</s-badge> : null}
      </s-stack>
      <s-stack direction="inline" gap="small-100" alignItems="baseline">
        <s-heading fontSize="large-200" accessibilityRole="presentation">
          {formatMoney(data.plan![kind], data.locale)}
        </s-heading>
        <s-text color="subdued">{annual ? t.plan.annualPeriod : t.plan.monthlyPeriod}</s-text>
      </s-stack>
      {/* H-4: ogni opzione ha una riga descrittiva, così le tre hanno lo stesso ritmo. */}
      <s-paragraph>
        {annual
          ? t.plan.annualDescription(formatMoney(data.plan!.annual / 12, data.locale))
          : t.plan.monthlyDescription}
      </s-paragraph>
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
  const creditExpected = data.entitlement.kind === "subscription" && Boolean(data.creditEstimate);
  return (
    <s-stack direction="block" gap="small-100">
      <s-stack direction="inline" gap="small-100" alignItems="center">
        <s-heading fontSize="large">{t.plan.oneTimeName}</s-heading>
      </s-stack>
      <s-stack direction="inline" gap="small-100" alignItems="baseline">
        <s-heading fontSize="large-200" accessibilityRole="presentation">
          {formatMoney(data.plan!.one_time, data.locale)}
        </s-heading>
        <s-text color="subdued">{t.plan.oneTimePeriod}</s-text>
      </s-stack>
      <s-paragraph>
        {trialNeverStarted ? t.plan.oneTimeChargeNotStarted : t.plan.oneTimeCharge}
      </s-paragraph>
      {creditExpected ? <s-paragraph>{t.plan.creditExpected}</s-paragraph> : null}
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

function ConversionCreditNote({ data }: { data: HomeData }) {
  const t = texts(data.locale);
  const credit = data.conversionCredit;
  if (!credit) return null;
  if (credit.status === "confirmed") {
    return <s-paragraph>{t.plan.creditComplete}</s-paragraph>;
  }
  if (credit.status === "not_applicable") {
    return null;
  }
  return <s-paragraph>{t.plan.creditProcessing}</s-paragraph>;
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
