import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import {
  ELIGIBLE_COUNTRY,
  pendingFetcherIntent,
  pendingFetcherSource,
} from "../../config";
import {
  formatDate,
  homeCheckoutSummary,
  supportMailto,
  texts,
  trialNotice,
  validationStatus,
} from "../../i18n";
import { openBillingApproval } from "../../revalidation";
import { PlanChoice } from "./PlanChoice";
import { PlanStatus } from "./PlanStatus";
import { SetupGuide } from "./SetupGuide";
import type { HomeData, action } from "./home.server";

export default function HomePage() {
  const data = useLoaderData<HomeData>();
  const fetcher = useFetcher<typeof action>();
  const t = texts(data.locale);
  const result = fetcher.data as
    | { ok: boolean; errorCode?: string; confirmationUrl?: string }
    | undefined;
  const confirmationUrl = result?.confirmationUrl;
  const submit = (intent: string, source?: string) =>
    fetcher.submit(source ? { intent, source } : { intent }, { method: "post" });

  useEffect(() => {
    if (!data.reviewDue || typeof shopify === "undefined") return;
    void shopify.reviews.request().catch(() => undefined);
  }, [data.reviewDue]);

  useEffect(() => {
    openBillingApproval(confirmationUrl);
  }, [confirmationUrl]);

  if (!data.eligible) {
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

  const entitled = data.entitlement.kind !== "none";
  const notice = trialNotice({ remaining: data.remaining, endsAt: data.trialEndsAt }, data.locale);
  const busy = fetcher.state !== "idle";
  const pendingIntent = pendingFetcherIntent(fetcher.formData);
  const pendingSource = pendingFetcherSource(fetcher.formData);
  const firstCharge = data.firstChargeAt
    ? t.plan.firstCharge(formatDate(data.firstChargeAt, data.locale))
    : t.plan.firstChargeNow;
  const status = validationStatus(data.validationEnabled, entitled);
  const configured = data.rules.taxCode !== "unmanaged" || data.rules.pec !== "unmanaged";
  const nextStep = !entitled
    ? { text: t.home.nextChoosePlan, href: null }
    : !configured
      ? { text: t.home.nextConfigure, href: "/app/rules" }
      : !data.validationEnabled
        ? { text: t.home.nextActivate, href: null }
        : { text: t.home.nextTestOrder, href: null };

  return (
    <s-page heading={t.home.heading}>
      {data.errorCode ? (
        <s-banner tone="warning">
          <s-stack direction="block" gap="small-100">
            <s-paragraph>
              {data.errorCode === "billing_read_failed"
                ? t.plan.lastAttempt
                : data.errorCode === "duplicate_validations" ||
                    data.errorCode === "duplicate_validations_active"
                  ? t.errors[data.errorCode]
                  : t.home.syncNeeded}
            </s-paragraph>
            <s-button
              disabled={busy}
              loading={pendingIntent === "repair"}
              onClick={() => submit("repair")}
            >
              {t.home.repair}
            </s-button>
          </s-stack>
        </s-banner>
      ) : !entitled ? (
        <s-banner tone="warning">{t.home.noEntitlement}</s-banner>
      ) : notice ? (
        <s-banner tone={notice.tone}>{notice.text}</s-banner>
      ) : null}
      {result && !result.ok ? (
        <s-banner tone="critical">
          {t.errors[result.errorCode as keyof typeof t.errors] ?? t.errors.generic}
        </s-banner>
      ) : null}

      {data.onboarding === "completed" ? null : (
        <SetupGuide
          data={data}
          busy={busy}
          pendingIntent={pendingIntent}
          pendingSource={pendingSource}
          submit={submit}
        />
      )}

      <s-section>
        <s-stack direction="block" gap="base">
          <s-badge
            tone={status === "active" ? "success" : status === "lapsed" ? "warning" : "neutral"}
          >
            {data.validationEnabled ? t.home.badgeActive : t.home.badgeInactive}
          </s-badge>
          <s-heading>
            {status === "active"
              ? t.home.titleActive
              : status === "lapsed"
                ? t.home.titleLapsed
                : t.home.titleDisabled}
          </s-heading>
          <s-paragraph>
            {homeCheckoutSummary({ rules: data.rules, status }, data.locale)}
          </s-paragraph>

          <s-divider />

          <s-stack direction="block" gap="small-100">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text>{t.rules.taxCodeLabel}</s-text>
              <s-badge>{t.rules.taxCode[data.rules.taxCode]}</s-badge>
            </s-stack>
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text>{t.rules.pecLabel}</s-text>
              <s-badge>{t.rules.pec[data.rules.pec]}</s-badge>
            </s-stack>
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text>{t.home.messagesLabel}</s-text>
              <s-badge>
                {data.messagesDefault ? t.home.messagesDefault : t.home.messagesCustom}
              </s-badge>
            </s-stack>
          </s-stack>

          <s-stack direction="inline" gap="base">
            <s-button href="/app/rules" variant="primary">
              {t.home.editRules}
            </s-button>
            {data.validationEnabled ? (
              <s-button commandFor="deactivate" command="--show">
                {t.home.deactivate}
              </s-button>
            ) : (
              <s-button
                disabled={!entitled || fetcher.state !== "idle"}
                loading={pendingIntent === "enable" && pendingSource === "status"}
                onClick={() => submit("enable", "status")}
              >
                {t.home.activate}
              </s-button>
            )}
          </s-stack>
        </s-stack>
      </s-section>

      <PlanChoice
        data={data}
        busy={busy}
        pendingIntent={pendingIntent}
        submit={submit}
        firstCharge={firstCharge}
      />

      <s-section heading={t.home.howHeading}>
        <s-unordered-list>
          {t.rules.exceptions.map((line) => (
            <s-list-item key={line}>{line}</s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      <PlanStatus data={data} />

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

      <s-app-window id="onboarding-window" src="/app/onboarding" />

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
    </s-page>
  );
}
