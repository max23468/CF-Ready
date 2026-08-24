import { formatMoney, texts } from "../../i18n";
import { commercialState } from "./commercial-state";
import type { HomeData } from "./home.server";

export function PlanChoice({
  data,
  busy,
  pendingIntent,
  submit,
  firstCharge,
}: {
  data: HomeData;
  busy: boolean;
  pendingIntent: string | null;
  submit: (intent: string) => void;
  firstCharge: string;
}) {
  const t = texts(data.locale);
  const onOneTime = data.entitlement.kind === "one_time";
  const trialNeverStarted = commercialState(data) === "first_run";

  const startTrialSection = trialNeverStarted ? (
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
  ) : null;

  const choice = (
    <s-section
      heading={
        onOneTime
          ? t.plan.oneTimeName
          : trialNeverStarted
            ? t.plan.chooseNowHeading
            : t.plan.chooseHeading
      }
    >
      {onOneTime || !data.plan ? (
        <s-paragraph>{onOneTime ? t.plan.oneTimeSettled : t.plan.none}</s-paragraph>
      ) : (
        <s-stack direction="block" gap="base">
          <s-paragraph>{t.plan.chooseBody}</s-paragraph>
          <s-stack direction="block" gap="small-100">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text type="strong">{t.plan.monthlyName}</s-text>
              <s-text>{formatMoney(data.plan.monthly, data.locale)}</s-text>
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

          <s-divider />

          <s-stack direction="block" gap="small-100">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text type="strong">{t.plan.annualName}</s-text>
              <s-text>{formatMoney(data.plan.annual, data.locale)}</s-text>
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

          <s-divider />

          <s-stack direction="block" gap="small-100">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text type="strong">{t.plan.oneTimeName}</s-text>
              <s-text>{formatMoney(data.plan.one_time, data.locale)}</s-text>
            </s-stack>
            <s-paragraph>
              {trialNeverStarted ? t.plan.oneTimeChargeNotStarted : t.plan.oneTimeCharge}
            </s-paragraph>
            {data.entitlement.kind === "subscription" && data.creditEstimate ? (
              <>
                <s-paragraph>
                  {t.plan.netCost(
                    formatMoney(Math.max(0, data.plan.one_time - data.creditEstimate), data.locale),
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

          {data.entitlement.kind === "subscription" ? (
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
          ) : null}
        </s-stack>
      )}
    </s-section>
  );

  return (
    <>
      <div id="plans">
        <s-stack direction="block" gap="base">
          {startTrialSection}
          {choice}
        </s-stack>
      </div>
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
