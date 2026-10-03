import type { ReactNode } from "react";
import { homeCheckoutSummary, type texts, validationStatus } from "../../i18n";
import type { HomeData } from "./home.server";
import { homeValidationPresentation } from "./home-next-step";
import { trialContinuityNotice } from "./commercial-state";
import { showPlans } from "./show-plans";

type Texts = ReturnType<typeof texts>;
type Submit = (intent: string, source?: string) => void;

export function MotionBanner({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "critical" | "info" | "warning";
}) {
  return (
    <div className="cf-motion-reveal">
      <s-banner tone={tone}>{children}</s-banner>
    </div>
  );
}

export function HomeValidationSection({
  data,
  entitled,
  firstRun,
  busy,
  pendingIntent,
  pendingSource,
  submit,
  verification,
  t,
}: {
  data: HomeData;
  entitled: boolean;
  firstRun: boolean;
  busy: boolean;
  pendingIntent: string | null;
  pendingSource: string | null;
  submit: Submit;
  verification: "pending" | "confirmed" | "failed";
  t: Texts;
}) {
  const status = validationStatus(data.validationEnabled, entitled);
  const presentation = homeValidationPresentation(data, status, firstRun, t);
  const continuity = trialContinuityNotice(data);
  return (
    <s-section heading={t.home.validationHeading}>
      <s-stack direction="block" gap="base">
        <s-stack direction="block" gap="small-100">
          <div role="status">
            <s-badge tone={verification === "pending" ? "info" : presentation.tone}>
              {verification === "pending" ? t.home.verifying : presentation.badge}
            </s-badge>
          </div>
          {presentation.note ? <s-paragraph>{presentation.note}</s-paragraph> : null}
          {firstRun ? null : (
            <s-paragraph>
              {homeCheckoutSummary({ rules: data.rules, status }, data.locale)}
            </s-paragraph>
          )}
        </s-stack>
        {continuity ? (
          <MotionBanner tone={continuity.tone}>
            <s-stack direction="block" gap="small-100">
              <s-paragraph>{continuity.text}</s-paragraph>
              {continuity.action ? (
                <s-button onClick={showPlans} disabled={busy}>
                  {continuity.action}
                </s-button>
              ) : null}
            </s-stack>
          </MotionBanner>
        ) : null}
        <s-divider />
        <s-stack direction="block" gap="small-100">
          <HomeRulesSummary data={data} t={t} />
          <s-box background="subdued" borderRadius="base" padding="small-200">
            <s-grid gridTemplateColumns="auto 1fr" columnGap="small-100" alignItems="start">
              <s-icon type="location" color="subdued" />
              <s-text color="subdued">{t.rules.exceptions[0]}</s-text>
            </s-grid>
          </s-box>
        </s-stack>
        <s-stack direction="inline" gap="base">
          {/* Da disattivata, con un diritto attivo, l'azione principale è riattivare. */}
          <s-button
            href="/app/rules"
            variant={!data.validationEnabled && entitled ? "secondary" : "primary"}
          >
            {t.home.editRules}
          </s-button>
          <HomeValidationAction
            data={data}
            entitled={entitled}
            busy={busy}
            pendingIntent={pendingIntent}
            pendingSource={pendingSource}
            submit={submit}
            t={t}
          />
        </s-stack>
      </s-stack>
    </s-section>
  );
}

function HomeRulesSummary({ data, t }: { data: HomeData; t: Texts }) {
  return (
    <s-query-container>
      <s-grid
        gridTemplateColumns="@container (inline-size > 300px) auto auto, 1fr"
        justifyContent="start"
        alignItems="center"
        columnGap="base"
        rowGap="small-100"
      >
        <s-text>{t.rules.taxCodeLabel}</s-text>
        <s-badge tone={data.rules.taxCode === "unmanaged" ? "neutral" : "info"}>
          {t.rules.taxCode[data.rules.taxCode]}
        </s-badge>
        <s-text>{t.rules.pecLabel}</s-text>
        {/* La forma breve tiene il badge leggibile anche a 320 px. */}
        <s-badge tone={data.rules.pec === "unmanaged" ? "neutral" : "info"}>
          {data.rules.pec === "required_when_company"
            ? t.home.pecRequiredForCompanies
            : t.rules.pec[data.rules.pec]}
        </s-badge>
        <s-text>{t.home.messagesLabel}</s-text>
        <s-badge tone={data.messagesDefault ? "neutral" : "info"}>
          {data.messagesDefault ? t.home.messagesDefault : t.home.messagesCustom}
        </s-badge>
      </s-grid>
    </s-query-container>
  );
}

function HomeValidationAction({
  data,
  entitled,
  busy,
  pendingIntent,
  pendingSource,
  submit,
  t,
}: {
  data: HomeData;
  entitled: boolean;
  busy: boolean;
  pendingIntent: string | null;
  pendingSource: string | null;
  submit: Submit;
  t: Texts;
}) {
  if (data.validationEnabled) {
    return (
      <s-button tone="critical" commandFor="deactivate" command="--show" disabled={busy}>
        {t.home.deactivate}
      </s-button>
    );
  }
  return (
    <s-button
      variant={entitled ? "primary" : "secondary"}
      disabled={!entitled || busy}
      loading={pendingIntent === "enable" && pendingSource === "status"}
      onClick={() => submit("enable", "status")}
    >
      {t.home.activate}
    </s-button>
  );
}

export function HomeAside({
  nextStep,
  t,
}: {
  nextStep: { text: string; href: string | null; label: string | null };
  t: Texts;
}) {
  return (
    <>
      <s-section heading={t.home.nextHeading}>
        <s-stack direction="block" gap="small-100" alignItems="start">
          <s-paragraph>{nextStep.text}</s-paragraph>
          {nextStep.href ? <s-link href={nextStep.href}>{nextStep.label}</s-link> : null}
        </s-stack>
      </s-section>
      <s-section heading={t.home.helpHeading}>
        <s-stack direction="block" gap="small-100" alignItems="start">
          <s-paragraph>{t.home.helpBody}</s-paragraph>
          <s-link href="/app/guide">{t.nav.guide}</s-link>
        </s-stack>
      </s-section>
      <s-stack direction="inline" gap="base" alignItems="center" justifyContent="center">
        <s-box maxInlineSize="130px">
          <s-image src="/cf-ready-lockup.svg" alt="" aspectRatio="16/3" objectFit="contain" />
        </s-box>
      </s-stack>
    </>
  );
}

export function DeactivateModal({
  pendingIntent,
  submit,
  t,
}: {
  pendingIntent: string | null;
  submit: Submit;
  t: Texts;
}) {
  return (
    <s-modal
      id="deactivate"
      heading={t.home.deactivate}
      accessibilityLabel={t.home.deactivateConfirm}
    >
      <s-paragraph>{t.home.deactivateConfirm}</s-paragraph>
      <s-button slot="secondary-actions" commandFor="deactivate" command="--hide">
        {t.common.cancel}
      </s-button>
      <s-button
        slot="primary-action"
        variant="primary"
        tone="critical"
        loading={pendingIntent === "disable"}
        commandFor="deactivate"
        command="--hide"
        onClick={() => submit("disable")}
      >
        {t.home.deactivate}
      </s-button>
    </s-modal>
  );
}
