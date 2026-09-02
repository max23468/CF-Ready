import type { ReactNode } from "react";
import { ELIGIBLE_COUNTRY } from "../../config";
import { homeCheckoutSummary, supportMailto, type texts, validationStatus } from "../../i18n";
import type { HomeData } from "./home.server";
import { homeValidationPresentation } from "./home-next-step";

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

export function UnsupportedHome({ data, t }: { data: HomeData; t: Texts }) {
  return (
    <s-page heading={t.home.heading}>
      <s-section heading={t.home.unsupported}>
        <s-box maxInlineSize="180px">
          <s-image
            src="/cf-ready-lockup.svg"
            alt="CF Ready"
            aspectRatio="16/3"
            objectFit="contain"
          />
        </s-box>
        <s-paragraph>{t.home.unsupportedBody}</s-paragraph>
        <s-paragraph>
          {data.shopName} · {data.countryCode} → {ELIGIBLE_COUNTRY}
        </s-paragraph>
        <s-paragraph>{t.home.unsupportedCheckAddress}</s-paragraph>
        <s-paragraph>{t.home.unsupportedGuide}</s-paragraph>
        <s-link href="/app/guide">{t.nav.guide}</s-link>
        <s-paragraph>{t.support.chooseCategory}</s-paragraph>
        {Object.entries(t.support.categories).map(([category, label]) => (
          <s-link
            key={category}
            href={supportMailto(
              {
                shopDomain: data.shopDomain,
                version: data.version,
                countryCode: data.countryCode,
              },
              data.locale,
              category as keyof typeof t.support.categories,
            )}
          >
            {label}
          </s-link>
        ))}
      </s-section>
    </s-page>
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
  t,
}: {
  data: HomeData;
  entitled: boolean;
  firstRun: boolean;
  busy: boolean;
  pendingIntent: string | null;
  pendingSource: string | null;
  submit: Submit;
  t: Texts;
}) {
  const status = validationStatus(data.validationEnabled, entitled);
  const presentation = homeValidationPresentation(data, status, firstRun, t);
  return (
    <s-section>
      <s-stack direction="block" gap="base">
        <s-badge tone={presentation.tone}>{presentation.badge}</s-badge>
        <s-heading>{presentation.title}</s-heading>
        {firstRun ? null : (
          <s-paragraph>
            {homeCheckoutSummary({ rules: data.rules, status }, data.locale)}
          </s-paragraph>
        )}
        <s-divider />
        <div className="cf-data-list">
          <div className="cf-data-row">
            <s-text>{t.rules.taxCodeLabel}</s-text>
            <s-badge>{t.rules.taxCode[data.rules.taxCode]}</s-badge>
          </div>
          <div className="cf-data-row">
            <s-text>{t.rules.pecLabel}</s-text>
            <s-badge>{t.rules.pec[data.rules.pec]}</s-badge>
          </div>
          <div className="cf-data-row">
            <s-text>{t.home.messagesLabel}</s-text>
            <s-badge>
              {data.messagesDefault ? t.home.messagesDefault : t.home.messagesCustom}
            </s-badge>
          </div>
          <s-box background="subdued" borderRadius="base" padding="small-200">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-icon type="location" color="subdued" />
              <s-text color="subdued">{t.rules.exceptions[0]}</s-text>
            </s-stack>
          </s-box>
        </div>
        <s-stack direction="inline" gap="base">
          <s-button href="/app/rules" variant="primary">
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
      <s-button commandFor="deactivate" command="--show">
        {t.home.deactivate}
      </s-button>
    );
  }
  return (
    <s-button
      disabled={!entitled || busy}
      loading={pendingIntent === "enable" && pendingSource === "status"}
      onClick={() => submit("enable", "status")}
    >
      {t.home.activate}
    </s-button>
  );
}

export function HomeAside({
  data,
  nextStep,
  t,
}: {
  data: HomeData;
  nextStep: { text: string; href: string | null };
  t: Texts;
}) {
  return (
    <>
      <s-section slot="aside" heading={t.home.nextHeading}>
        <s-stack direction="block" gap="small-100">
          <s-paragraph>{nextStep.text}</s-paragraph>
          {nextStep.href ? <s-link href={nextStep.href}>{t.nav.rules}</s-link> : null}
          {data.address2Declared ? (
            <>
              <s-paragraph>{t.home.nextAddress2}</s-paragraph>
              <s-link href="/app/rules">{t.nav.rules}</s-link>
            </>
          ) : null}
        </s-stack>
      </s-section>
      <s-section slot="aside" heading={t.home.helpHeading}>
        <s-stack direction="block" gap="small-100">
          <s-paragraph>{t.home.helpBody}</s-paragraph>
          <s-link href="/app/guide">{t.nav.guide}</s-link>
        </s-stack>
      </s-section>
      <s-stack
        slot="aside"
        direction="inline"
        gap="base"
        alignItems="center"
        justifyContent="center"
      >
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
