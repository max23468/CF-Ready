import { localizedError } from "../app-error";
import { Fragment, useCallback, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticateAdmin, authenticateAdminTimed } from "../admin-auth.server";
import { databaseContext } from "../context.server";
import { APP_VERSION } from "../env.server";
import { recordEvent } from "../events.server";
import { resolveLocale, texts, type Locale } from "../i18n";
import { formatDateTime } from "../i18n/format";
import { APP_ROUTES, RULES_SIMULATOR_ANCHOR } from "../app-routes";
import { hasManagedField, readConfig } from "../config";
import {
  CHECKOUT_LABEL_OPTIONAL_SCOPES,
  checkoutLabelsStatus,
  type CheckoutLabelsStatus,
} from "../checkout-labels/domain";
import { loadCheckoutLabels, readCheckoutLabelState } from "../checkout-labels/service.server";
import { hasGrantedScopes, queryScopesOrNull } from "../primitives";
import { reconcile } from "../validation/reconcile.server";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { showToast } from "../save-bar";
import { createServerTiming } from "../server-timing.server";
import { readSupportDiagnosticState, type SupportDiagnosticState } from "../support.server";
import { BrandLockup } from "../ui/ui-brand";
import { planComparisonLocationState } from "../features/onboarding/plan-comparison";
import {
  ONBOARDING_WINDOW_ID,
  OnboardingWindow,
  useOnboardingWindowNavigation,
} from "../features/onboarding/onboarding-window";
import {
  supportDiagnosticText,
  supportMailto,
  type SupportCategory,
} from "../features/support/support-diagnostics";
import { Disclosure } from "../ui/ui-disclosure";
import { PageWithAside } from "../ui/ui-page";
import { revealById } from "../ui/ui-scroll";
import "./app.guide.css";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const timing = createServerTiming();
  const { session } = await authenticateAdminTimed(request, context, timing);
  // La Guida non rilegge Shopify: usa solo lo stato tecnico D1 già riconciliato (ui-content.md, Assistenza).
  const diagnostics = await timing.measure("d1_support", () =>
    readSupportDiagnosticState(context.get(databaseContext), session.shop),
  );
  return data(
    {
      locale: resolveLocale(request),
      shopDomain: session.shop,
      version: APP_VERSION,
      diagnosticId: crypto.randomUUID(),
      diagnostics,
    },
    { headers: { "Server-Timing": timing.header() } },
  );
};

export const headers: HeadersFunction = (args) => boundary.headers(args);

const DIAGNOSTIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session, scopes } = await authenticateAdmin(request, context);
  const form = await request.formData();
  if (form.get("intent") === "check_validation") {
    try {
      const state = await reconcile(admin, context.get(databaseContext), session.shop);
      const config = readConfig(state.validation?.metafield?.jsonValue);
      const db = context.get(databaseContext);
      const scopeDetails = await queryScopesOrNull(scopes);
      const labelsGranted = hasGrantedScopes(CHECKOUT_LABEL_OPTIONAL_SCOPES, scopeDetails?.granted);
      if (labelsGranted) {
        const labels = await loadCheckoutLabels(admin, db, session.shop, config.rules);
        if (!labels.available) {
          return { ok: false as const, errorCode: labels.errorCode };
        }
      }
      const labelState = await readCheckoutLabelState(db, session.shop);
      return {
        ok: true as const,
        check: {
          checkedAt: new Date().toISOString(),
          timeZone: state.timeZone,
          enabled: state.validationEnabled,
          entitled: state.entitlement.kind !== "none",
          errorCode: state.errorCode,
          configured: hasManagedField(config.rules),
          checkoutLabelsStatus: labelsGranted
            ? checkoutLabelsStatus(labelState)
            : labelState.mode === "off"
              ? checkoutLabelsStatus(labelState)
              : "scope_required",
          address2Classification: labelState.address2Classification,
          address2Decision: labelState.address2Decision,
        },
      };
    } catch {
      return { ok: false as const };
    }
  }
  const diagnosticId = form.get("diagnostic_id");
  if (
    form.get("intent") !== "diagnostics_copied" ||
    typeof diagnosticId !== "string" ||
    !DIAGNOSTIC_ID.test(diagnosticId)
  ) {
    return { ok: false };
  }
  await recordEvent(context.get(databaseContext), {
    shopDomain: session.shop,
    name: "support_diagnostics_copied",
    class: "support",
    metadata: { correlation_id: diagnosticId },
  });
  return { ok: true };
};

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function Guide() {
  const { locale, shopDomain, version, diagnosticId, diagnostics } = useLoaderData<typeof loader>();
  const t = texts(locale);
  const [expanded, setExpanded] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [supportCategory, setSupportCategory] = useState<SupportCategory>("checkout");
  const diagnosticsFetcher = useFetcher<typeof action>();
  const supportDetails = { shopDomain, version, diagnosticId, ...diagnostics };
  const navigate = useNavigate();
  const showPlans = useCallback(
    () => void navigate(APP_ROUTES.home, { state: planComparisonLocationState() }),
    [navigate],
  );
  useOnboardingWindowNavigation(navigate, showPlans);

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(supportDiagnosticText(supportDetails, locale));
      setCopyFailed(false);
      showToast(t.support.diagnosticsCopied);
      diagnosticsFetcher.submit(
        { intent: "diagnostics_copied", diagnostic_id: diagnosticId },
        { method: "post" },
      );
    } catch {
      setCopyFailed(true);
    }
  };

  const toggleAll = () => {
    const entries = document.querySelectorAll<HTMLDetailsElement>("#faq .guide-faq__entry");
    const open = [...entries].some((entry) => !entry.open);
    entries.forEach((entry) => {
      entry.open = open;
    });
    setExpanded(open);
  };

  const syncExpanded = () => {
    const entries = [...document.querySelectorAll<HTMLDetailsElement>("#faq .guide-faq__entry")];
    setExpanded(entries.length > 0 && entries.every((entry) => entry.open));
  };

  return (
    <PageWithAside
      heading={t.guide.heading}
      aside={
        <>
          <s-section heading={t.support.heading}>
            <div id="support">
              <s-stack direction="block" gap="base">
                <s-paragraph>{t.support.body}</s-paragraph>
                <s-text color="subdued">{t.support.privacyNote}</s-text>
                <s-select
                  label={t.support.chooseCategory}
                  value={supportCategory}
                  onChange={(event) =>
                    setSupportCategory(event.currentTarget.value as SupportCategory)
                  }
                >
                  {Object.entries(t.support.categories).map(([category, label]) => (
                    <s-option key={category} value={category}>
                      {label}
                    </s-option>
                  ))}
                </s-select>
                <s-button href={supportMailto(supportDetails, locale, supportCategory)}>
                  {t.support.requestSupport}
                </s-button>
                <s-button variant="tertiary" onClick={copyDiagnostics}>
                  {t.support.copyDiagnostics}
                </s-button>
                {copyFailed ? (
                  <span className="cf-motion-reveal">
                    <s-text tone="critical">{t.support.diagnosticsCopyFailed}</s-text>
                  </span>
                ) : null}
                <s-divider />
                <div className="guide-support__diagnosis-link">
                  <s-link
                    href="#validation-diagnosis"
                    onClick={(event) => {
                      event.preventDefault();
                      revealById(DIAGNOSIS_ID);
                    }}
                  >
                    {t.guide.diagnosis.heading}
                  </s-link>
                </div>
              </s-stack>
            </div>
          </s-section>
          <s-section heading={t.guide.asideHeading}>
            <s-stack direction="block" gap="base">
              <BrandLockup alt="CF Ready" />
              <s-paragraph>{t.guide.asideBody}</s-paragraph>
              <s-stack direction="block" gap="small-100" alignItems="start">
                <s-heading>{t.guide.asideLinks}</s-heading>
                <s-link href={APP_ROUTES.rules}>{t.nav.rules}</s-link>
                <s-link href={APP_ROUTES.messages}>{t.nav.messages}</s-link>
                <s-link commandFor={ONBOARDING_WINDOW_ID} command="--show">
                  {t.onboarding.reopen}
                </s-link>
              </s-stack>
            </s-stack>
          </s-section>
          <OnboardingWindow />
        </>
      }
    >
      <s-section id="faq" heading={t.guide.faqHeading}>
        <s-button slot="secondary-actions" onClick={toggleAll}>
          {expanded ? t.guide.collapseAll : t.guide.expandAll}
        </s-button>
        <s-stack direction="block" gap="base">
          <div className="guide-faq__groups">
            {t.guide.groups.map((group) => (
              <div className="guide-faq__group" key={group.heading}>
                <s-heading>{group.heading}</s-heading>
                <div className="guide-faq__entries">
                  {group.entries.map((entry, index) => (
                    <Fragment key={entry.q}>
                      {index > 0 ? <s-divider /> : null}
                      <Disclosure
                        className="guide-faq__entry"
                        onToggle={syncExpanded}
                        summary={<span className="guide-faq__question">{entry.q}</span>}
                      >
                        <div className="guide-faq__answer">
                          <s-paragraph color="subdued">
                            {"id" in entry &&
                            entry.id === "billing" &&
                            diagnostics.entitlementKind === "complimentary"
                              ? t.guide.complimentaryBillingAnswer
                              : entry.a}
                          </s-paragraph>
                        </div>
                      </Disclosure>
                    </Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </s-stack>
      </s-section>

      <ValidationDiagnosis locale={locale} diagnostics={diagnostics} />
    </PageWithAside>
  );
}

// Il titolo sta nello shadow DOM di `s-section`: si fa scorrere il contenuto della card, il cui
// margine di scorrimento lascia il titolo visibile sopra di esso e sotto l'intestazione
// fissa dell'Admin.
const DIAGNOSIS_ID = "validation-diagnosis";

function ValidationDiagnosis({
  locale,
  diagnostics,
}: {
  locale: Locale;
  diagnostics: SupportDiagnosticState;
}) {
  const t = texts(locale);
  const checkFetcher = useFetcher<typeof action>();
  const checkResult = checkFetcher.data;
  const check = checkResult && "check" in checkResult ? checkResult.check : null;
  const checkCopy = t.guide.diagnosis;
  const errorCode = diagnosisErrorCode(check, checkResult, diagnostics.errorCode);
  return (
    <s-section heading={checkCopy.heading}>
      <div id={DIAGNOSIS_ID} className="guide-diagnosis" tabIndex={-1}>
        <s-stack direction="block" gap="base">
          <s-paragraph>{checkCopy.body}</s-paragraph>
          <s-button
            disabled={checkFetcher.state !== "idle"}
            loading={checkFetcher.state !== "idle"}
            onClick={() => checkFetcher.submit({ intent: "check_validation" }, { method: "post" })}
          >
            {checkCopy.refresh}
          </s-button>
          {checkResult?.ok === false ? (
            <s-banner tone="critical">{checkCopy.failed}</s-banner>
          ) : null}
          <DiagnosisResult check={check} locale={locale} />
          {errorCode ? (
            <s-banner tone="critical">{localizedError(t.errors, errorCode)}</s-banner>
          ) : null}
          <s-text color="subdued">
            {checkCopy.lastSync}:{" "}
            {check
              ? formatDateTime(check.checkedAt, locale, check.timeZone)
              : diagnostics.lastSyncAt
                ? formatDateTime(diagnostics.lastSyncAt, locale, diagnostics.timeZone)
                : checkCopy.unknown}
          </s-text>
          <s-stack direction="block" gap="small-100">
            <s-heading>{checkCopy.manualHeading}</s-heading>
            <s-paragraph>{checkCopy.manualBody}</s-paragraph>
          </s-stack>
          <s-link href={`${APP_ROUTES.rules}#${RULES_SIMULATOR_ANCHOR}`}>
            {checkCopy.simulate}
          </s-link>
        </s-stack>
      </div>
    </s-section>
  );
}

function diagnosisErrorCode(
  check: { errorCode: unknown } | null | undefined,
  result: { ok: boolean; errorCode?: unknown } | undefined,
  fallback: unknown,
) {
  if (check) return check.errorCode;
  if (result?.ok === false && "errorCode" in result) return result.errorCode;
  return fallback;
}

type DiagnosisCheck = Extract<Awaited<ReturnType<typeof action>>, { check: unknown }>["check"];

type DiagnosisTone = "success" | "warning" | "info";

const DIAGNOSIS_ICON = {
  success: "check-circle",
  warning: "alert-triangle",
  info: "info",
} as const;

const LABELS_TONE: Record<CheckoutLabelsStatus, DiagnosisTone> = {
  synced: "success",
  action_required: "warning",
  scope_required: "warning",
  unknown: "info",
};

function address2Tone(check: DiagnosisCheck): DiagnosisTone {
  if (
    check.address2Decision === "manual_restore_required" ||
    (check.address2Classification === "fiscal_conflict" && check.address2Decision === "pending")
  ) {
    return "warning";
  }
  return check.address2Classification === "unknown" ? "info" : "success";
}

function DiagnosisRow({
  tone,
  text,
  href,
  link,
}: {
  tone: DiagnosisTone;
  text: string;
  href: string;
  link: string;
}) {
  return (
    <s-grid gridTemplateColumns="auto minmax(0, 1fr)" gap="small-200" alignItems="start">
      <s-icon type={DIAGNOSIS_ICON[tone]} tone={tone} />
      <s-stack direction="block" gap="small-100" alignItems="start">
        <s-text>{text}</s-text>
        <s-link href={href}>{link}</s-link>
      </s-stack>
    </s-grid>
  );
}

function diagnosisSummary(check: DiagnosisCheck, t: ReturnType<typeof texts>) {
  const copy = t.guide.diagnosis;
  const tones = [
    check.enabled ? "success" : "warning",
    check.entitled ? "success" : "warning",
    check.configured ? "success" : "warning",
    LABELS_TONE[check.checkoutLabelsStatus],
    check.address2Classification in t.rules.labels.addressSummary ? address2Tone(check) : null,
  ];
  if (tones.includes("warning")) return copy.needsAttention;
  if (tones.includes("info")) return copy.incomplete;
  return copy.checked;
}

function DiagnosisResult({
  check,
  locale,
}: {
  check: DiagnosisCheck | null | undefined;
  locale: Locale;
}) {
  const t = texts(locale);
  const copy = t.guide.diagnosis;
  if (!check || check.errorCode) return <s-paragraph>{copy.notChecked}</s-paragraph>;
  return (
    <s-box background="subdued" borderRadius="base" padding="base">
      <s-stack direction="block" gap="large">
        <s-text type="strong">{diagnosisSummary(check, t)}</s-text>
        <DiagnosisRow
          tone={check.enabled ? "success" : "warning"}
          text={check.enabled ? copy.enabled : copy.disabled}
          href={APP_ROUTES.home}
          link={t.nav.home}
        />
        <DiagnosisRow
          tone={check.entitled ? "success" : "warning"}
          text={check.entitled ? copy.entitled : copy.notEntitled}
          href={APP_ROUTES.home}
          link={copy.openPlan}
        />
        <DiagnosisRow
          tone={check.configured ? "success" : "warning"}
          text={check.configured ? copy.configured : copy.unconfigured}
          href={APP_ROUTES.rules}
          link={copy.openRules}
        />
        {check.checkoutLabelsStatus in LABELS_TONE ? (
          <DiagnosisRow
            tone={LABELS_TONE[check.checkoutLabelsStatus]}
            text={copy.labelsStatus[check.checkoutLabelsStatus]}
            href={APP_ROUTES.rules}
            link={copy.openLabels}
          />
        ) : null}
        {check.address2Classification in t.rules.labels.addressSummary ? (
          <DiagnosisRow
            tone={address2Tone(check)}
            text={[
              t.rules.labels.addressSummary[check.address2Classification],
              check.address2Decision === "accepted" ||
              check.address2Decision === "manual_restore_required"
                ? copy.address2Decision[check.address2Decision]
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
            href={APP_ROUTES.rules}
            link={copy.openAddress2}
          />
        ) : null}
      </s-stack>
    </s-box>
  );
}
