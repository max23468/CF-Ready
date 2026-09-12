import { localizedError } from "../app-error";
import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticateAdmin } from "../admin-auth.server";
import { databaseContext } from "../context.server";
import { APP_VERSION } from "../env.server";
import { recordEvent } from "../events.server";
import {
  resolveLocale,
  supportDiagnosticText,
  supportMailto,
  texts,
  type SupportCategory,
  type Locale,
} from "../i18n";
import { readConfig } from "../config";
import { readCheckoutLabelState } from "../checkout-labels/repository.server";
import { checkoutLabelsStatus } from "../checkout-labels/domain";
import {
  CHECKOUT_LABEL_OPTIONAL_SCOPES,
  loadCheckoutLabels,
} from "../checkout-labels/service.server";
import { reconcile } from "../validation.server";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { createServerTiming } from "../server-timing.server";
import { readSupportDiagnosticState, type SupportDiagnosticState } from "../support.server";
import "./app.guide.css";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const timing = createServerTiming();
  const { session } = await timing.measure("auth", () => authenticateAdmin(request, context));
  // La Guida non rilegge Shopify: usa solo lo stato tecnico D1 già riconciliato (§22).
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
      const scopeDetails = await scopes.query().catch(() => null);
      const labelsGranted = CHECKOUT_LABEL_OPTIONAL_SCOPES.every((scope) =>
        scopeDetails?.granted.includes(scope),
      );
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
          enabled: state.validationEnabled,
          entitled: state.entitlement.kind !== "none",
          errorCode: state.errorCode,
          configured: config.rules.taxCode !== "unmanaged" || config.rules.pec !== "unmanaged",
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
  const [copyState, setCopyState] = useState<"copied" | "failed" | null>(null);
  const [supportCategory, setSupportCategory] = useState<SupportCategory>("checkout");
  const diagnosticsFetcher = useFetcher<typeof action>();
  const supportDetails = { shopDomain, version, diagnosticId, ...diagnostics };

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(supportDiagnosticText(supportDetails, locale));
      setCopyState("copied");
      diagnosticsFetcher.submit(
        { intent: "diagnostics_copied", diagnostic_id: diagnosticId },
        { method: "post" },
      );
    } catch {
      setCopyState("failed");
    }
  };

  // Un solo comando per aprire e chiudere tutto. Agisce sull'attributo nativo di `details`,
  // quindi non serve tenere in stato l'apertura di ogni voce.
  const toggleAll = () => {
    const open = !expanded;
    document.querySelectorAll<HTMLDetailsElement>("#faq .guide-faq__entry").forEach((entry) => {
      entry.open = open;
    });
    setExpanded(open);
  };

  return (
    <s-page heading={t.guide.heading}>
      {/* §15.7: pagina unica con sezioni espandibili. Polaris non ha un componente di
          divulgazione, quindi si usa `details`, che è l'elemento nativo della piattaforma:
          accessibile e utilizzabile da tastiera senza reimplementare nulla (§8.1). */}
      <s-section id="faq">
        <s-stack direction="block" gap="small-100">
          <s-grid gridTemplateColumns="1fr auto" alignItems="center" gap="base">
            <s-heading>{t.guide.faqHeading}</s-heading>
            <s-button onClick={toggleAll}>
              {expanded ? t.guide.collapseAll : t.guide.expandAll}
            </s-button>
          </s-grid>
          <div className="guide-faq__groups">
            {t.guide.groups.map((group) => (
              <div className="guide-faq__group" key={group.heading}>
                <s-heading>{group.heading}</s-heading>
                <div className="guide-faq__entries">
                  {group.entries.map((entry) => (
                    <details className="guide-faq__entry" key={entry.q}>
                      <summary>
                        <strong>{entry.q}</strong>
                      </summary>
                      <s-box paddingBlockStart="small-100">
                        <s-paragraph>{entry.a}</s-paragraph>
                      </s-box>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </s-stack>
      </s-section>

      <ValidationDiagnosis locale={locale} diagnostics={diagnostics} />

      {/* A-16: il colore di brand è ammesso dentro un'illustrazione, su superfici prive di
          azioni operative. Questa è documentazione, non configurazione. */}
      <s-section slot="aside" heading={t.guide.asideHeading}>
        <s-stack direction="block" gap="base">
          <s-box maxInlineSize="160px">
            <s-image
              src="/cf-ready-lockup.svg"
              alt="CF Ready"
              aspectRatio="16/3"
              objectFit="contain"
            />
          </s-box>
          <s-paragraph>{t.guide.asideBody}</s-paragraph>
          <s-stack direction="block" gap="small-100">
            <s-heading>{t.guide.asideLinks}</s-heading>
            <s-link href="/app/rules">{t.nav.rules}</s-link>
            <s-link href="/app/messages">{t.nav.messages}</s-link>
            <s-link href="/app/onboarding">{t.onboarding.reopen}</s-link>
          </s-stack>
        </s-stack>
      </s-section>

      {/* FR-090: il recapito è un `mailto:` precompilato, non un modulo che invia (§22). */}
      <s-section slot="aside" heading={t.support.heading}>
        <s-stack direction="block" gap="base">
          <s-paragraph>{t.support.body}</s-paragraph>
          <s-select
            label={t.support.chooseCategory}
            value={supportCategory}
            onChange={(event) => setSupportCategory(event.currentTarget.value as SupportCategory)}
          >
            {Object.entries(t.support.categories).map(([category, label]) => (
              <s-option key={category} value={category}>
                {label}
              </s-option>
            ))}
          </s-select>
          <s-button variant="primary" href={supportMailto(supportDetails, locale, supportCategory)}>
            {t.support.requestSupport}
          </s-button>
          <s-button onClick={copyDiagnostics}>{t.support.copyDiagnostics}</s-button>
          {copyState ? (
            <span className="cf-motion-reveal" key={copyState}>
              <s-text tone={copyState === "copied" ? "success" : "critical"}>
                {copyState === "copied"
                  ? t.support.diagnosticsCopied
                  : t.support.diagnosticsCopyFailed}
              </s-text>
            </span>
          ) : null}
          <s-text color="subdued">{t.support.privacyNote}</s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}

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
      <s-stack direction="block" gap="base">
        <s-paragraph>{checkCopy.body}</s-paragraph>
        <s-button
          disabled={checkFetcher.state !== "idle"}
          loading={checkFetcher.state !== "idle"}
          onClick={() => checkFetcher.submit({ intent: "check_validation" }, { method: "post" })}
        >
          {checkCopy.refresh}
        </s-button>
        {checkResult?.ok === false ? <s-banner tone="warning">{checkCopy.failed}</s-banner> : null}
        <DiagnosisResult check={check} locale={locale} />
        {errorCode ? (
          <s-banner tone="warning">{localizedError(t.errors, errorCode)}</s-banner>
        ) : null}
        <s-text color="subdued">
          {checkCopy.lastSync}:{" "}
          {diagnostics.lastSyncAt
            ? new Date(diagnostics.lastSyncAt).toLocaleString(locale)
            : checkCopy.unknown}
        </s-text>
        <s-heading>{checkCopy.manualHeading}</s-heading>
        <s-paragraph>{checkCopy.manualBody}</s-paragraph>
        <s-link href="/app/rules">{checkCopy.simulate}</s-link>
      </s-stack>
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

type DiagnosisCheck = {
  checkedAt: string;
  enabled: boolean;
  entitled: boolean;
  configured: boolean;
  errorCode: unknown;
  checkoutLabelsStatus: string;
  address2Classification: string;
  address2Decision: string;
};

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
    <>
      <s-text color="subdued">
        {copy.checkedAt}: {new Date(check.checkedAt).toLocaleString(locale)}
      </s-text>
      <s-paragraph>
        {check.enabled ? copy.enabled : copy.disabled} <s-link href="/app">{t.nav.home}</s-link>
      </s-paragraph>
      <s-paragraph>
        {check.entitled ? copy.entitled : copy.notEntitled}{" "}
        <s-link href="/app">{copy.openPlan}</s-link>
      </s-paragraph>
      <s-paragraph>
        {check.configured ? copy.configured : copy.unconfigured}{" "}
        <s-link href="/app/rules">{t.nav.rules}</s-link>
      </s-paragraph>
      <s-paragraph>
        {copy.checkoutLabels}: {check.checkoutLabelsStatus}
      </s-paragraph>
      <s-paragraph>
        {copy.address2}: {check.address2Classification} · {check.address2Decision}
      </s-paragraph>
    </>
  );
}
