import type { ReactNode } from "react";
import { homeCheckoutSummary, type texts, validationStatus } from "../../i18n";
import type { HomeData } from "./home.server";
import { homeValidationPresentation } from "./home-next-step";
import { trialContinuityNotice } from "./commercial-state";
import { showPlans } from "./show-plans";
import { BrandLockup } from "../../ui-brand";
import { StatusList } from "../../ui-status-list";

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
        <HomeValidationActions
          data={data}
          entitled={entitled}
          busy={busy}
          pendingIntent={pendingIntent}
          pendingSource={pendingSource}
          submit={submit}
          t={t}
        />
      </s-stack>
    </s-section>
  );
}

// Decisione del 4 ottobre: la prova sta in un banner subito dopo la card della validazione, non
// dentro di essa; l'azione usa lo slot nativo del banner, che Polaris stila secondo il tono.
export function HomeTrialNotice({ data, busy }: { data: HomeData; busy: boolean }) {
  const continuity = trialContinuityNotice(data);
  if (!continuity) return null;
  return (
    // Il contenitore bilancia lo spazio nativo della card e del titolo successivo.
    <div className="cf-trial-notice">
      <MotionBanner tone={continuity.tone}>
        {continuity.text}
        {continuity.action ? (
          <s-button slot="secondary-actions" onClick={showPlans} disabled={busy}>
            {continuity.action}
          </s-button>
        ) : null}
      </MotionBanner>
    </div>
  );
}

// P2-T4: le regole sono valori di configurazione, quindi badge neutri; il verde resta agli esiti.
function HomeRulesSummary({ data, t }: { data: HomeData; t: Texts }) {
  return (
    <StatusList
      rows={[
        {
          key: "taxCode",
          label: <s-text>{t.rules.taxCodeLabel}</s-text>,
          value: <s-badge tone="neutral">{t.rules.taxCode[data.rules.taxCode]}</s-badge>,
        },
        {
          key: "pec",
          label: <s-text>{t.rules.pecLabel}</s-text>,
          // La forma breve tiene il badge leggibile anche a 320 px.
          value: (
            <s-badge tone="neutral">
              {data.rules.pec === "required_when_company"
                ? t.home.pecRequiredForCompanies
                : t.rules.pec[data.rules.pec]}
            </s-badge>
          ),
        },
        {
          key: "messages",
          label: <s-text>{t.home.messagesLabel}</s-text>,
          value: (
            <s-badge tone="neutral">
              {data.messagesDefault ? t.home.messagesDefault : t.home.messagesCustom}
            </s-badge>
          ),
        },
      ]}
    />
  );
}

// H-2: il primario è sempre il primo bottone. Da disattivata, con un diritto attivo, è
// riattivare; altrimenti è modificare le regole. La disattivazione resta un'azione terziaria
// critica: confermata dalla finestra, mai più evidente del primario.
function HomeValidationActions({
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
  const activateFirst = !data.validationEnabled && entitled;
  const editRules = (
    <s-button href="/app/rules" variant={activateFirst ? "secondary" : "primary"}>
      {t.home.editRules}
    </s-button>
  );
  const toggle = data.validationEnabled ? (
    <s-button
      variant="tertiary"
      tone="critical"
      commandFor="deactivate"
      command="--show"
      disabled={busy}
    >
      {t.home.deactivate}
    </s-button>
  ) : (
    <s-button
      variant={entitled ? "primary" : "secondary"}
      disabled={!entitled || busy}
      loading={pendingIntent === "enable" && pendingSource === "status"}
      onClick={() => submit("enable", "status")}
    >
      {t.home.activate}
    </s-button>
  );
  return (
    <s-stack direction="inline" gap="base">
      {activateFirst ? toggle : editRules}
      {activateFirst ? editRules : toggle}
    </s-stack>
  );
}

export function HomeAside({
  nextStep,
  t,
}: {
  nextStep: { text: string; href: string | null; label: string };
  t: Texts;
}) {
  return (
    <>
      <s-section heading={t.home.nextHeading}>
        <s-stack direction="block" gap="small-100" alignItems="start">
          <s-paragraph>{nextStep.text}</s-paragraph>
          {nextStep.href ? (
            <s-link href={nextStep.href}>{nextStep.label}</s-link>
          ) : (
            <s-link onClick={showPlans}>{nextStep.label}</s-link>
          )}
        </s-stack>
      </s-section>
      <s-section heading={t.home.helpHeading}>
        <s-stack direction="block" gap="small-100" alignItems="start">
          <s-paragraph>{t.home.helpBody}</s-paragraph>
          <s-link href="/app/guide">{t.nav.guide}</s-link>
          {/* P2-T5: dentro la sezione, allineato al testo come nella Guida. */}
          <BrandLockup />
        </s-stack>
      </s-section>
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
