import { localizedError } from "../app-error";
import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticateAdmin, authenticateAdminTimed } from "../admin-auth.server";
import { databaseContext } from "../context.server";
import { APP_VERSION } from "../env.server";
import { recordEvent } from "../events.server";
import {
  formatDateTime,
  resolveLocale,
  supportDiagnosticText,
  supportMailto,
  texts,
  type SupportCategory,
  type Locale,
} from "../i18n";
import { readConfig } from "../config";
import { readCheckoutLabelState } from "../checkout-labels/repository.server";
import {
  checkoutLabelsStatus,
  type Address2Classification,
  type Address2Decision,
  type CheckoutLabelsStatus,
} from "../checkout-labels/domain";
import {
  CHECKOUT_LABEL_OPTIONAL_SCOPES,
  loadCheckoutLabels,
} from "../checkout-labels/service.server";
import { reconcile } from "../validation.server";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { showToast } from "../save-bar";
import { createServerTiming } from "../server-timing.server";
import { readSupportDiagnosticState, type SupportDiagnosticState } from "../support.server";
import "./app.guide.css";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const timing = createServerTiming();
  const { session } = await authenticateAdminTimed(request, context, timing);
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
          timeZone: state.timeZone,
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
  const [copyFailed, setCopyFailed] = useState(false);
  const [supportCategory, setSupportCategory] = useState<SupportCategory>("checkout");
  const diagnosticsFetcher = useFetcher<typeof action>();
  const supportDetails = { shopDomain, version, diagnosticId, ...diagnostics };

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

  // Un solo comando per aprire e chiudere tutto. Agisce sull'attributo nativo di `details`,
  // quindi non serve tenere in stato l'apertura di ogni voce.
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
    <s-page heading={t.guide.heading}>
      {/* §15.7: pagina unica con sezioni espandibili. Polaris non ha un componente di
          divulgazione, quindi si usa `details`, che è l'elemento nativo della piattaforma:
          accessibile e utilizzabile da tastiera senza reimplementare nulla (§8.1). */}
      {/* G-B5: titoli `s-heading` nativi, domande senza grassetto. `s-section` non accetta
          azioni accanto al titolo: il titolo sta nel contenuto, con "Espandi tutte" a destra. */}
      <s-section id="faq">
        <s-stack direction="block" gap="base">
          <s-grid gridTemplateColumns="minmax(0, 1fr) auto" alignItems="center" gap="base">
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
                    <details className="guide-faq__entry" key={entry.q} onToggle={syncExpanded}>
                      <summary className="cf-disclosure">
                        <span className="guide-faq__question">{entry.q}</span>
                      </summary>
                      <div className="guide-faq__answer">
                        <s-paragraph>
                          {/* G-B8: a uno store con piano omaggio non si parla di prova e prezzi. */}
                          {"id" in entry &&
                          entry.id === "billing" &&
                          diagnostics.entitlementKind === "complimentary"
                            ? t.guide.complimentaryBillingAnswer
                            : entry.a}
                        </s-paragraph>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </s-stack>
      </s-section>

      <ValidationDiagnosis locale={locale} diagnostics={diagnostics} />

      {/* FR-090: il recapito è un `mailto:` precompilato, non un modulo che invia (§22). */}
      <s-stack slot="aside" direction="block" gap="base">
        <s-section heading={t.support.heading}>
          <div id="support">
            {/* G-B9, G-N1: spiegazione, argomento e invio in sequenza; il salto alla
                diagnosi è un percorso diverso e sta in fondo. */}
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
              <s-button
                variant="primary"
                inlineSize="fill"
                href={supportMailto(supportDetails, locale, supportCategory)}
              >
                {t.support.requestSupport}
              </s-button>
              <s-button inlineSize="fill" onClick={copyDiagnostics}>
                {t.support.copyDiagnostics}
              </s-button>
              {copyFailed ? (
                <span className="cf-motion-reveal">
                  <s-text tone="critical">{t.support.diagnosticsCopyFailed}</s-text>
                </span>
              ) : null}
              <s-divider />
              <s-button icon="search" inlineSize="fill" onClick={showDiagnosis}>
                {t.guide.diagnosis.heading}
              </s-button>
            </s-stack>
          </div>
        </s-section>
        {/* A-16: il colore di brand è ammesso dentro un'illustrazione, su superfici prive di
          azioni operative. Questa è documentazione, non configurazione. */}
        <s-section heading={t.guide.asideHeading}>
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
            <s-stack direction="block" gap="small-100" alignItems="start">
              <s-heading>{t.guide.asideLinks}</s-heading>
              <s-link href="/app/rules">{t.nav.rules}</s-link>
              <s-link href="/app/messages">{t.nav.messages}</s-link>
              <s-link href="/app/onboarding">{t.onboarding.reopen}</s-link>
            </s-stack>
          </s-stack>
        </s-section>
      </s-stack>
    </s-page>
  );
}

// Il titolo ha un box reale: centrarlo mantiene visibile il punto di arrivo anche sotto
// l'intestazione fissa dell'Admin, senza dipendere dallo shadow DOM di Polaris.
function showDiagnosis() {
  const target = document.getElementById("validation-diagnosis");
  if (!target) return;
  const heading = target.querySelector(".guide-diagnosis__heading");
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  heading?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  target.focus({ preventScroll: true });
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
    <s-section>
      <div id="validation-diagnosis" className="guide-diagnosis" tabIndex={-1}>
        <s-stack direction="block" gap="base">
          <div className="guide-diagnosis__heading">
            <s-heading>{checkCopy.heading}</s-heading>
          </div>
          <s-paragraph>{checkCopy.body}</s-paragraph>
          <s-button
            disabled={checkFetcher.state !== "idle"}
            loading={checkFetcher.state !== "idle"}
            onClick={() => checkFetcher.submit({ intent: "check_validation" }, { method: "post" })}
          >
            {checkCopy.refresh}
          </s-button>
          {checkResult?.ok === false ? (
            <s-banner tone="warning">{checkCopy.failed}</s-banner>
          ) : null}
          <DiagnosisResult check={check} locale={locale} />
          {errorCode ? (
            <s-banner tone="warning">{localizedError(t.errors, errorCode)}</s-banner>
          ) : null}
          {/* Dopo "Aggiorna e verifica" l'ultima verifica è quella appena fatta: un solo orario. */}
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
          <s-link href="/app/rules#simulatore">{checkCopy.simulate}</s-link>
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

type DiagnosisCheck = {
  checkedAt: string;
  timeZone: string | null;
  enabled: boolean;
  entitled: boolean;
  configured: boolean;
  errorCode: unknown;
  checkoutLabelsStatus: CheckoutLabelsStatus;
  address2Classification: Address2Classification;
  address2Decision: Address2Decision;
};

type DiagnosisTone = "success" | "warning" | "neutral";

const DIAGNOSIS_ICON = {
  success: "check-circle",
  warning: "alert-triangle",
  neutral: "info",
} as const;

const LABELS_TONE: Record<CheckoutLabelsStatus, DiagnosisTone> = {
  synced: "success",
  action_required: "warning",
  scope_required: "warning",
  unknown: "neutral",
};

function address2Tone(check: DiagnosisCheck): DiagnosisTone {
  if (
    check.address2Decision === "manual_restore_required" ||
    (check.address2Classification === "fiscal_conflict" && check.address2Decision === "pending")
  ) {
    return "warning";
  }
  return check.address2Classification === "unknown" ? "neutral" : "success";
}

// G-B1: ogni esito ha un'icona di stato e il link fuori dal paragrafo, quindi blu come altrove.
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
      <DiagnosisRow
        tone={check.enabled ? "success" : "warning"}
        text={check.enabled ? copy.enabled : copy.disabled}
        href="/app"
        link={t.nav.home}
      />
      <DiagnosisRow
        tone={check.entitled ? "success" : "warning"}
        text={check.entitled ? copy.entitled : copy.notEntitled}
        href="/app"
        link={copy.openPlan}
      />
      <DiagnosisRow
        tone={check.configured ? "success" : "warning"}
        text={check.configured ? copy.configured : copy.unconfigured}
        href="/app/rules"
        link={t.nav.rules}
      />
      {check.checkoutLabelsStatus in LABELS_TONE ? (
        <DiagnosisRow
          tone={LABELS_TONE[check.checkoutLabelsStatus]}
          text={copy.labelsStatus[check.checkoutLabelsStatus]}
          href="/app/rules"
          link={t.nav.rules}
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
          href="/app/rules"
          link={t.nav.rules}
        />
      ) : null}
    </>
  );
}
