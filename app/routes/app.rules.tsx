import { useEffect, useRef } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunction,
} from "react-router";
import { data, useActionData, useLoaderData, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { localizedError } from "../app-error";
import { authenticateAdminTimed } from "../admin-auth.server";
import { ConfigConflict } from "../features/ConfigConflict";
import { AutomaticLabelsConfirmModal } from "../features/rules/AutomaticLabelsConfirmModal";
import { CheckoutSimulator } from "../features/rules/CheckoutSimulator";
import { CheckoutLabelsSection } from "../features/rules/CheckoutLabelsSection";
import "../features/rules/RulesLayout.css";
import { AbsentWithoutDeliverySection } from "../features/rules/AbsentWithoutDeliverySection";
import { blocksAbsentWithoutDelivery, type RulesFormDraft } from "../features/rules/rules-form";
import { describeCheckout, resolveLocale, texts, validationStatus, type Locale } from "../i18n";
import { skipRevalidationWhenLeaving, useSavedData } from "../revalidation";
import { RevealBanner } from "../ui/ui-feedback";
import { createServerTiming } from "../server-timing.server";
import {
  hasManagedField,
  PEC_RULE_MODES,
  readConfig,
  showSavedBanner,
  TAX_CODE_RULE_MODES,
} from "../config";
import { databaseContext } from "../context.server";
import { readCheckoutLabelState } from "../checkout-labels/repository.server";
import { CHECKOUT_LABEL_OPTIONAL_SCOPES } from "../checkout-labels/service.server";
import { type CheckoutLabelsSnapshot } from "../checkout-labels/domain";
import {
  useRulesDraft,
  RULES_SAVE_BAR,
  LABEL_CONFIRM_MODAL,
} from "../features/rules/use-rules-draft";
import { observedConfigHash, reconcile } from "../validation.server";
import { handleRulesAction, saveAddress2Mode } from "../features/rules/rules-action.server";
import { parseRulesIntent, RULES_INTENTS } from "../features/rules/rules-intents";
import { useDeferredCheckoutLabels } from "../features/rules/use-deferred-checkout-labels";
import { NATIVE_LABELS_ID } from "../features/rules/NativeCheckoutLabels";

type RulesActionData =
  | Awaited<ReturnType<typeof handleRulesAction>>
  | Awaited<ReturnType<typeof saveAddress2Mode>>;
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const timing = createServerTiming();
  const authentication = await authenticateAdminTimed(request, context, timing);
  const { admin, session } = authentication;
  const db = context.get(databaseContext);
  const labelStatePromise = timing.measure("d1_validation_state", () =>
    readCheckoutLabelState(db, session.shop),
  );
  const statePromise = reconcile(admin, db, session.shop, {
    prefetchBilling: true,
    reportTiming: timing.record,
  });
  const state = await statePromise;
  const validation = state.validation;
  const config = readConfig(validation?.metafield?.jsonValue);
  const duplicateError: "duplicate_validations" | "duplicate_validations_active" | null =
    state.errorCode === "duplicate_validations" ||
    state.errorCode === "duplicate_validations_active"
      ? state.errorCode
      : null;
  const [configHash, labelState] = await Promise.all([
    observedConfigHash(validation),
    labelStatePromise,
  ]);
  const shopHandle = session.shop.replace(/\.myshopify\.com$/, "");

  return data(
    {
      locale: resolveLocale(request),
      timeZone: state.timeZone,
      duplicateError,
      // §11.4: firma della configurazione osservata, rimandata indietro al salvataggio.
      configHash,
      rules: config.rules,
      messages: config.messages,
      enabled: state.validationEnabled,
      entitled: state.entitlement.kind !== "none",
      labelScopesGranted: null as boolean | null,
      labelState,
      labelSnapshot: null as CheckoutLabelsSnapshot | null,
      guidedConfirmations: [] as Array<{ slotId: string; confirmedAt: string }>,
      labelLoadError: null as string | null,
      checkoutSettingsUrl: `https://admin.shopify.com/store/${shopHandle}/settings/checkout`,
      storefrontUrl: `https://${session.shop}`,
    },
    { headers: { "Server-Timing": timing.header() } },
  );
};

export const headers: HeadersFunction = (args) => boundary.headers(args);

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const timing = createServerTiming();
  const { admin, session, scopes } = await authenticateAdminTimed(request, context, timing);
  const db = context.get(databaseContext);
  const form = await request.formData();
  const intent = parseRulesIntent(form.get("intent"));
  const result = !intent
    ? { ok: false as const, errorCode: "generic" as const }
    : intent === RULES_INTENTS.saveAddress2FormMode
      ? await saveAddress2Mode(db, session.shop, form)
      : await timing.measure("rules_save", async () => {
          const scopeDetails = await timing
            .measure("shopify_scopes", () => scopes.query())
            .catch(() => null);
          const labelScopesGranted = CHECKOUT_LABEL_OPTIONAL_SCOPES.every((scope) =>
            scopeDetails?.granted.includes(scope),
          );
          return await handleRulesAction(intent, {
            admin,
            db,
            shop: session.shop,
            form,
            labelScopesGranted,
            timing,
          });
        });
  return data(result, { headers: { "Server-Timing": timing.header() } });
};

export const shouldRevalidate: ShouldRevalidateFunction = (args) => {
  const actionResult = args.actionResult;
  if (
    actionResult &&
    typeof actionResult === "object" &&
    ("refreshed" in actionResult || "loaded" in actionResult)
  ) {
    return false;
  }
  return skipRevalidationWhenLeaving(args);
};

const SIMULATOR_ID = "simulatore";

function savedRulesResult(result: RulesActionData | undefined) {
  return result?.ok && "saved" in result ? result.saved : undefined;
}

export default function CheckoutRules() {
  const loaded = useLoaderData<typeof loader>();
  const result = useActionData<RulesActionData>();
  const saved = useSavedData(loaded, savedRulesResult(result));
  // R-H3: se le etichette sono cambiate dopo l'ultima lettura, si rileggono da sole e la bozza
  // resta pronta per un nuovo salvataggio.
  const labelsConflict =
    result?.ok === false && result.errorCode === "checkout_labels_conflict" ? result : null;
  const labels = useDeferredCheckoutLabels(saved, labelsConflict);
  const labelsLoading = labels.loading;
  const labelState = labels.state;
  const labelSnapshot = labels.snapshot;

  const t = texts(saved.locale);
  const {
    current,
    draft,
    busy,
    conflict,
    errorCode,
    labelsErrorCode,
    dirty,
    labelsDirty,
    changedSinceResult,
    formRevision,
    labelsEnabled,
    automaticLabelWrites,
    readDraft,
    save,
    submitSave,
    reapply,
    discard,
    changeLabelsEnabled,
    changeAbsentWithoutDelivery,
  } = useRulesDraft(saved, result, labels);
  // G-B4: dalla Guida "Riproduci il caso nel simulatore" arriva con l'ancora del simulatore.
  // Le etichette si caricano dopo e allungano la colonna sopra il simulatore: a caricamento
  // concluso lo si riporta in vista, se il merchant non ha spostato il focus altrove.
  const { hash } = useLocation();
  const simulatorReached = useRef(false);
  useEffect(() => {
    if (hash !== `#${SIMULATOR_ID}` || (labelsLoading && simulatorReached.current)) return;
    const target = document.getElementById(SIMULATOR_ID);
    if (!target || (simulatorReached.current && document.activeElement !== target)) return;
    simulatorReached.current = true;
    target.scrollIntoView?.({ block: "start" });
    target.focus({ preventScroll: true });
  }, [hash, labelsLoading]);

  if (saved.duplicateError) {
    return (
      <s-page heading={t.rules.heading}>
        <s-banner tone="critical">{t.errors[saved.duplicateError]}</s-banner>
      </s-page>
    );
  }

  return (
    <s-page heading={t.rules.heading}>
      <ui-save-bar id={RULES_SAVE_BAR}>
        {/* Il salvataggio con le etichette dura alcuni secondi: Salva mostra il caricamento. */}
        <button
          type="button"
          variant="primary"
          disabled={busy || Boolean(conflict)}
          loading={busy ? "" : undefined}
          onClick={save}
        >
          {t.common.save}
        </button>
        <button type="button" disabled={busy} onClick={discard}>
          {t.common.cancel}
        </button>
      </ui-save-bar>

      <AutomaticLabelsConfirmModal
        id={LABEL_CONFIRM_MODAL}
        locale={saved.locale}
        writes={automaticLabelWrites}
        onConfirm={() => submitSave(true)}
      />

      {/* Decisione del 4 ottobre: regole e simulatore affiancati al 50%, così una scelta e il
          suo effetto restano in vista insieme; le etichette, lunghe quando aperte, stanno a
          tutta larghezza sotto e non lasciano vuota la colonna del simulatore. Senza colonna
          laterale il contenitore, banner compresi, raggiunge la larghezza delle altre pagine. */}
      <div className="rules-layout-container">
        {conflict ? (
          <ConfigConflict
            locale={saved.locale}
            busy={busy}
            onReapply={reapply}
            onDiscard={discard}
            rows={rulesConflictRows(current, draft, t)}
          />
        ) : null}
        <RulesResultBanners
          t={t}
          result={result}
          dirty={dirty || labelsDirty}
          changedSinceResult={changedSinceResult}
          labelsErrorCode={labelsErrorCode}
          errorCode={errorCode}
          conflict={Boolean(conflict)}
        />
        <div className="rules-layout">
          <form
            className="rules-layout__form"
            key={formRevision}
            onChange={readDraft}
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="rules-layout__fields">
              <s-section heading={t.rules.taxCodeLabel}>
                <s-choice-list
                  label={t.rules.taxCodeLabel}
                  labelAccessibilityVisibility="exclusive"
                  name="taxCode"
                >
                  {TAX_CODE_RULE_MODES.map((mode) => (
                    <s-choice key={mode} value={mode} selected={mode === draft.rules.taxCode}>
                      {t.rules.taxCode[mode]}
                      <s-text slot="details">{t.rules.taxCode[`${mode}Help`]}</s-text>
                    </s-choice>
                  ))}
                </s-choice-list>
              </s-section>
              <s-section heading={t.rules.pecLabel}>
                <s-choice-list
                  label={t.rules.pecLabel}
                  labelAccessibilityVisibility="exclusive"
                  name="pec"
                >
                  {PEC_RULE_MODES.map((mode) => (
                    <s-choice key={mode} value={mode} selected={mode === draft.rules.pec}>
                      {t.rules.pec[mode]}
                      <s-text slot="details">{t.rules.pec[`${mode}Help`]}</s-text>
                    </s-choice>
                  ))}
                </s-choice-list>
              </s-section>
            </div>
          </form>
          <div className="rules-layout__preview" id={SIMULATOR_ID} tabIndex={-1}>
            <s-section heading={t.rules.previewHeading}>
              <s-stack direction="block" gap="base">
                <RulesSummary
                  rules={draft.rules}
                  status={validationStatus(saved.enabled, saved.entitled)}
                  locale={saved.locale}
                />

                <CheckoutSimulator
                  locale={saved.locale}
                  rules={draft.rules}
                  messages={saved.messages}
                />
              </s-stack>
            </s-section>
          </div>
        </div>
        <div className="rules-layout__labels">
          <CheckoutLabelsSection
            locale={saved.locale}
            timeZone={saved.timeZone}
            rules={draft.rules}
            scopeGranted={labels.scopeGranted}
            snapshot={labelSnapshot}
            state={labelState}
            loadErrorCode={labels.loadError}
            guidedConfirmations={labels.guidedConfirmations}
            enabled={labelsEnabled}
            busy={busy}
            checkoutSettingsUrl={saved.checkoutSettingsUrl}
            storefrontUrl={saved.storefrontUrl}
            onEnabledChange={changeLabelsEnabled}
            onScopeGranted={() => labels.load(draft.rules)}
          />
        </div>
        <AbsentWithoutDeliverySection
          locale={saved.locale}
          rules={draft.rules}
          busy={busy}
          onChange={changeAbsentWithoutDelivery}
        />
      </div>
    </s-page>
  );
}

// P2-T7: senza campi gestiti lo dice già il simulatore, una volta sola.
function RulesSummary({
  rules,
  status,
  locale,
}: Parameters<typeof describeCheckout>[0] & { locale: Locale }) {
  if (!hasManagedField(rules)) return null;
  return (
    <s-stack direction="block" gap="small-100">
      {describeCheckout({ rules, status }, locale).map((line) => (
        <s-paragraph key={line}>{line}</s-paragraph>
      ))}
    </s-stack>
  );
}

function RulesResultBanners({
  t,
  result,
  dirty,
  changedSinceResult,
  labelsErrorCode,
  errorCode,
  conflict,
}: {
  t: ReturnType<typeof texts>;
  result: ReturnType<typeof useActionData<RulesActionData>>;
  dirty: boolean;
  changedSinceResult: boolean;
  labelsErrorCode: string | null;
  errorCode: string | null;
  conflict: boolean;
}) {
  return (
    <>
      {dirty ? <s-banner tone="info">{t.common.unsavedNavigation}</s-banner> : null}
      {labelsErrorCode && showSavedBanner(result, dirty, changedSinceResult) ? (
        <RevealBanner tone="warning">
          {t.rules.labelsSaved}
          <s-button slot="secondary-actions" onClick={showNativeLabels}>
            {t.rules.showLabels}
          </s-button>
        </RevealBanner>
      ) : null}
      {errorCode === "checkout_labels_conflict" ? (
        <RevealBanner tone="warning">{t.rules.labelsConflict}</RevealBanner>
      ) : errorCode && (errorCode !== "config_conflict" || conflict) ? (
        <RevealBanner tone="critical">{localizedError(t.errors, errorCode)}</RevealBanner>
      ) : null}
    </>
  );
}

// R-H5: apre "Testi del checkout" e lo porta in vista.
function showNativeLabels() {
  const details = document.getElementById(NATIVE_LABELS_ID) as HTMLDetailsElement | null;
  if (!details) return;
  details.open = true;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  details.scrollIntoView?.({ block: "start", behavior: reduced ? "auto" : "smooth" });
  // Senza preventScroll il focus interrompe lo scorrimento morbido a metà pagina.
  details.querySelector("summary")?.focus({ preventScroll: true });
}

function rulesConflictRows(
  current: RulesFormDraft,
  draft: RulesFormDraft,
  t: ReturnType<typeof texts>,
) {
  return [
    {
      label: t.rules.taxCodeLabel,
      current: t.rules.taxCode[current.rules.taxCode],
      draft: t.rules.taxCode[draft.rules.taxCode],
    },
    {
      label: t.rules.pecLabel,
      current: t.rules.pec[current.rules.pec],
      draft: t.rules.pec[draft.rules.pec],
    },
    {
      label: t.rules.absentWithoutDelivery.heading,
      current:
        t.rules.absentWithoutDelivery[blocksAbsentWithoutDelivery(current.rules) ? "on" : "off"],
      draft: t.rules.absentWithoutDelivery[blocksAbsentWithoutDelivery(draft.rules) ? "on" : "off"],
    },
  ];
}
