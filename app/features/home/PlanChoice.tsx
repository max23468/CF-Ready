import { useEffect, useRef, useState } from "react";
import { texts } from "../../i18n";
import { formatMoney } from "../../i18n/format";
import { supportMailto } from "../support/support-diagnostics";
import { commercialState } from "./commercial-state";
import type { HomeData } from "./home.server";
import type { HomeIntent } from "./home-intents";
import { PLANS_ID } from "./show-plans";
import "./PlanChoice.css";

type PlanProps = {
  data: HomeData;
  busy: boolean;
  pendingIntent: string | null;
  submit: (intent: HomeIntent) => void;
  firstCharge: string;
};

export function PlanChoice(props: PlanProps) {
  const { data, pendingIntent, submit } = props;
  const t = texts(data.locale);
  const trialNeverStarted = commercialState(data) === "first_run";
  const currentPlan = subscribedPlan(data);
  return (
    <>
      <s-box paddingBlockEnd="base">
        <div id={PLANS_ID} className="home-plans" tabIndex={-1} data-layout-region="plans">
          <s-stack direction="block" gap="base">
            {trialNeverStarted ? <StartTrialSection {...props} /> : null}
            {currentPlan ? (
              <ManagedSubscription key={currentPlan} {...props} currentPlan={currentPlan} />
            ) : (
              <PlanSelection {...props} trialNeverStarted={trialNeverStarted} />
            )}
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
          {t.plan.keepSubscription}
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
  if (onOneTime) {
    return (
      <s-section heading={heading}>
        <s-stack direction="block" gap="small-100">
          <s-paragraph>
            {data.complimentary ? t.plan.complimentarySettled : t.plan.oneTimeSettled}
          </s-paragraph>
          {data.complimentary ? null : <ConversionCreditNote data={data} />}
        </s-stack>
      </s-section>
    );
  }
  return (
    <s-section heading={heading}>
      <s-stack direction="block" gap="base">
        <s-paragraph>{t.plan.chooseBody}</s-paragraph>
        <s-paragraph>{props.firstCharge}</s-paragraph>
        <RecurringPlanOption {...props} kind="monthly" />
        <s-divider />
        <RecurringPlanOption {...props} kind="annual" />
        <s-divider />
        {data.plan.one_time === null ? (
          <OneTimeOnRequest data={data} />
        ) : (
          <OneTimePlanOption {...props} amount={data.plan.one_time} />
        )}
        <SubscriptionCancellation {...props} />
      </s-stack>
    </s-section>
  );
}

function subscribedPlan(data: HomeData) {
  if (data.entitlement.kind !== "subscription") return null;
  return data.planKind === "monthly" || data.planKind === "annual" ? data.planKind : null;
}

// BFS 4.3.6: con un abbonamento attivo le altre offerte non restano in pagina. Il piano attuale e
// la disdetta stanno nella sezione; cambio piano e pagamento unico si aprono da "Gestisci piano".
function ManagedSubscription(props: PlanProps & { currentPlan: "monthly" | "annual" }) {
  const { data, currentPlan, busy, pendingIntent, submit } = props;
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual" | "one_time">(currentPlan);
  const modalRef = useRef<HTMLElementTagNameMap["s-modal"]>(null);
  // Gli eventi nativi sono minuscoli; il ripristino copre anche X ed Escape.
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const reset = () => setSelectedPlan(currentPlan);
    modal.addEventListener("show", reset);
    modal.addEventListener("hide", reset);
    return () => {
      modal.removeEventListener("show", reset);
      modal.removeEventListener("hide", reset);
    };
  }, [currentPlan]);
  const t = texts(data.locale);
  const annual = currentPlan === "annual";
  const oneTimeAmount = data.plan.one_time;
  const kinds =
    oneTimeAmount === null
      ? (["monthly", "annual"] as const)
      : (["monthly", "annual", "one_time"] as const);
  const prices = { monthly: data.plan.monthly, annual: data.plan.annual, one_time: oneTimeAmount };
  const names = {
    monthly: t.plan.monthlyName,
    annual: t.plan.annualName,
    one_time: t.plan.oneTimeName,
  };
  const actionLabel =
    selectedPlan === currentPlan
      ? t.plan.currentSelection
      : selectedPlan === "one_time"
        ? t.plan.oneTimeStart
        : selectedPlan === "annual"
          ? t.plan.annualSwitch
          : t.plan.monthlySwitch;
  return (
    <s-section heading={t.plan.currentHeading}>
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="small-100" alignItems="baseline">
          <s-text type="strong">{annual ? t.plan.annualName : t.plan.monthlyName}</s-text>
          <s-text color="subdued">
            {formatMoney(data.plan[currentPlan], data.locale)}{" "}
            {annual ? t.plan.annualPeriod : t.plan.monthlyPeriod}
          </s-text>
        </s-stack>
        <s-stack direction="inline" gap="base">
          <s-button commandFor="manage-plan" command="--show">
            {t.plan.manage}
          </s-button>
        </s-stack>
        <SubscriptionCancellation {...props} />
      </s-stack>
      <s-modal
        id="manage-plan"
        ref={modalRef}
        heading={t.plan.manage}
        accessibilityLabel={t.plan.manage}
      >
        <s-stack direction="block" gap="base">
          {/* ChoiceList dispone le etichette nel proprio shadow DOM: per le card della
              proposta usiamo radio HTML con lo stesso nome e layout/testi Polaris. */}
          <fieldset
            className="managed-plan-choices"
            aria-label={t.plan.chooseHeading}
            disabled={busy}
          >
            {kinds.map((kind) => (
              <label key={kind} className="managed-plan-option">
                <input
                  type="radio"
                  name="managed-plan"
                  value={kind}
                  checked={selectedPlan === kind}
                  onChange={() => setSelectedPlan(kind)}
                />
                <span className="managed-plan-copy">
                  <s-stack direction="block" gap="small-100">
                    <s-stack direction="inline" gap="small-100" justifyContent="space-between">
                      <s-text type="strong">{names[kind]}</s-text>
                      {kind === currentPlan ? (
                        <s-badge tone="neutral">{t.plan.currentSelection}</s-badge>
                      ) : null}
                    </s-stack>
                    <s-stack direction="inline" gap="small-100" alignItems="baseline">
                      <s-heading fontSize="large-200" accessibilityRole="presentation">
                        {formatMoney(prices[kind] ?? 0, data.locale)}
                      </s-heading>
                      <s-text color="subdued">
                        {kind === "monthly"
                          ? t.plan.monthlyPeriod
                          : kind === "annual"
                            ? t.plan.annualPeriod
                            : t.plan.oneTimePeriod}
                      </s-text>
                    </s-stack>
                    {kind === "one_time" ? (
                      <s-text color="subdued">{t.plan.noRenewals}</s-text>
                    ) : null}
                  </s-stack>
                </span>
              </label>
            ))}
          </fieldset>
          <s-paragraph>
            {selectedPlan !== currentPlan && selectedPlan !== "one_time"
              ? props.firstCharge
              : t.plan.changeConfirmation}
          </s-paragraph>
          {selectedPlan === "one_time" && data.creditEstimate ? (
            <s-paragraph>{t.plan.creditExpected}</s-paragraph>
          ) : null}
          {oneTimeAmount === null ? <OneTimeOnRequest data={data} /> : null}
        </s-stack>
        <s-button
          slot="secondary-actions"
          commandFor="manage-plan"
          command="--hide"
          disabled={busy}
        >
          {t.common.cancel}
        </s-button>
        <s-button
          slot="primary-action"
          variant="primary"
          commandFor="manage-plan"
          command="--hide"
          disabled={busy || selectedPlan === currentPlan}
          onClick={() => {
            if (!busy && selectedPlan !== currentPlan) submit(selectedPlan);
          }}
        >
          {actionLabel}
        </s-button>
      </s-modal>
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
        <s-heading fontSize="large">{label}</s-heading>
        {annual ? <s-badge tone="info">{t.plan.recommended}</s-badge> : null}
      </s-stack>
      <s-stack direction="inline" gap="small-100" alignItems="baseline">
        <s-heading fontSize="large-200" accessibilityRole="presentation">
          {formatMoney(data.plan[kind], data.locale)}
        </s-heading>
        <s-text color="subdued">{annual ? t.plan.annualPeriod : t.plan.monthlyPeriod}</s-text>
      </s-stack>
      <s-paragraph>{annual ? t.plan.annualDescription : t.plan.monthlyDescription}</s-paragraph>
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

// D-221: senza un'offerta assegnata dall'owner il pagamento unico si chiede al supporto.
function OneTimeOnRequest({ data }: { data: HomeData }) {
  const t = texts(data.locale);
  return (
    <s-stack direction="block" gap="small-100">
      <s-stack direction="inline" gap="small-100" alignItems="center">
        <s-heading fontSize="large">{t.plan.oneTimeRequestHeading}</s-heading>
      </s-stack>
      <s-stack direction="inline" gap="small-100" alignItems="baseline">
        <s-heading fontSize="large-200" accessibilityRole="presentation">
          {t.plan.oneTimeRequestPrice}
        </s-heading>
      </s-stack>
      <s-paragraph>{t.plan.oneTimeRequestBody}</s-paragraph>
      <s-stack direction="inline" gap="base">
        <s-button
          href={supportMailto(
            {
              shopDomain: data.shopDomain,
              version: data.version,
              countryCode: data.countryCode,
              entitlement: data.entitlement.kind !== "none",
              validationEnabled: data.validationEnabled,
              errorCode: data.errorCode,
            },
            data.locale,
            "billing",
            { subject: t.plan.oneTimeRequestSubject, message: t.plan.oneTimeRequestMessage },
          )}
        >
          {t.plan.oneTimeRequest}
        </s-button>
      </s-stack>
    </s-stack>
  );
}

function OneTimePlanOption({
  data,
  busy,
  pendingIntent,
  submit,
  trialNeverStarted,
  amount,
}: PlanProps & {
  trialNeverStarted: boolean;
  amount: number;
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
          {formatMoney(amount, data.locale)}
        </s-heading>
        <s-text color="subdued">{t.plan.oneTimePeriod}</s-text>
      </s-stack>
      <s-paragraph>
        {trialNeverStarted
          ? t.plan.oneTimeChargeNotStarted
          : data.entitlement.kind === "trial"
            ? t.plan.oneTimeChargeTrial
            : t.plan.oneTimeCharge}
      </s-paragraph>
      {creditExpected ? <s-paragraph>{t.plan.creditExpected}</s-paragraph> : null}
      <s-stack direction="inline" gap="base">
        <s-button
          disabled={busy}
          loading={pendingIntent === "one_time"}
          onClick={() => submit("one_time")}
        >
          {t.plan.oneTimeStart}
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
