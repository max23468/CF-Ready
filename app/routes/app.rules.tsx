import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunction,
} from "react-router";
import { data, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { localizedError } from "../app-error";
import { authenticateAdminTimed } from "../admin-auth.server";
import { ConfigConflict } from "../features/ConfigConflict";
import { AutomaticLabelsConfirmModal } from "../features/rules/AutomaticLabelsConfirmModal";
import { CheckoutSimulator } from "../features/rules/CheckoutSimulator";
import { CheckoutLabelsSection } from "../features/rules/CheckoutLabelsSection";
import "../features/rules/RulesLayout.css";
import {
  mergeRulesFormDraft,
  rebaseRulesDraft,
  type RulesFormDraft,
} from "../features/rules/rules-form";
import {
  describeCheckout,
  formatDateTime,
  resolveLocale,
  texts,
  validationStatus,
  type Locale,
} from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { setSaveBarVisibility } from "../save-bar";
import { createServerTiming } from "../server-timing.server";
import { authenticate } from "../shopify.server";
import { PEC_RULE_MODES, readConfig, showSavedBanner, TAX_CODE_RULE_MODES } from "../config";
import { databaseContext } from "../context.server";
import { readCheckoutLabelState } from "../checkout-labels/repository.server";
import { CHECKOUT_LABEL_OPTIONAL_SCOPES } from "../checkout-labels/service.server";
import { checkoutLabelValuesMatch, proposedLabelForSlot } from "../checkout-labels/domain";
import { observedConfigHash, reconcile } from "../validation.server";
import { changedConfigurationFields, type ConfigurationSnapshot } from "../configuration-history";
import { readConfigurationHistory } from "../configuration-history.server";
import { handleRulesAction, saveAddress2Mode } from "../features/rules/rules-action.server";
import { parseRulesIntent, RULES_INTENTS } from "../features/rules/rules-intents";
import { useDeferredCheckoutLabels } from "../features/rules/use-deferred-checkout-labels";

const SAVE_BAR = "checkout-rules-save-bar";
const LABEL_CONFIRM_MODAL = "confirm-checkout-label-management";
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const timing = createServerTiming();
  const authentication = await authenticateAdminTimed(request, context, timing);
  const { admin, session } = authentication;
  const db = context.get(databaseContext);
  const labelStatePromise = timing.measure("d1_validation_state", () =>
    readCheckoutLabelState(db, session.shop),
  );
  const historyPromise = timing.measure("d1_configuration_history", () =>
    readConfigurationHistory(db, session.shop),
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
  const [configHash, labelState, configurationHistory] = await Promise.all([
    observedConfigHash(validation),
    labelStatePromise,
    historyPromise,
  ]);
  const shopHandle = session.shop.replace(/\.myshopify\.com$/, "");

  return data(
    {
      locale: resolveLocale(request),
      duplicateError,
      // §11.4: firma della configurazione osservata, rimandata indietro al salvataggio.
      configHash,
      rules: config.rules,
      messages: config.messages,
      configurationHistory,
      enabled: state.validationEnabled,
      entitled: state.entitlement.kind !== "none",
      labelScopesGranted: null,
      labelState,
      labelSnapshot: null,
      guidedConfirmations: [],
      labelLoadError: null,
      checkoutSettingsUrl: `https://admin.shopify.com/store/${shopHandle}/settings/checkout`,
      storefrontUrl: `https://${session.shop}`,
    },
    { headers: { "Server-Timing": timing.header() } },
  );
};

export const headers: HeadersFunction = (args) => boundary.headers(args);

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session, scopes } = await authenticate.admin(request);
  const db = context.get(databaseContext);
  const form = await request.formData();
  const intent = parseRulesIntent(form.get("intent"));
  if (!intent) return { ok: false as const, errorCode: "generic" as const };

  if (intent === RULES_INTENTS.saveAddress2FormMode) {
    return saveAddress2Mode(db, session.shop, form);
  }

  const scopeDetails = await scopes.query().catch(() => null);
  const labelScopesGranted = CHECKOUT_LABEL_OPTIONAL_SCOPES.every((scope) =>
    scopeDetails?.granted.includes(scope),
  );
  return handleRulesAction(intent, { admin, db, shop: session.shop, form, labelScopesGranted });
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

export default function CheckoutRules() {
  const saved = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const labels = useDeferredCheckoutLabels(saved);
  const labelsLoading = labels.loading;
  const labelState = labels.state;
  const labelSnapshot = labels.snapshot;

  const t = texts(saved.locale);
  const send = useSubmit();
  const busy = useNavigation().state !== "idle";
  const current = { rules: saved.rules };
  const baseRef = useRef(current);
  const sentRef = useRef<RulesFormDraft | null>(null);
  const baseHash = useRef(saved.configHash);
  const [resolvedConflict, setResolvedConflict] = useState(false);
  const errorCode = result?.ok === false ? result.errorCode : null;
  const conflict = errorCode === "config_conflict" && !resolvedConflict;
  const labelsErrorCode =
    result?.ok && "labelsErrorCode" in result && typeof result.labelsErrorCode === "string"
      ? result.labelsErrorCode
      : null;
  const [changedSinceResult, setChangedSinceResult] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const [draft, setDraft] = useState({ rules: saved.rules });
  const [labelsEnabled, setLabelsEnabled] = useState(labelState.mode !== "off");

  // Un solo ascoltatore sul form delle impostazioni. Il simulatore è deliberatamente fuori:
  // i suoi valori sono locali e non devono rendere sporca la configurazione del merchant.
  const readDraft = (event: { currentTarget: HTMLFormElement }) => {
    const data = new FormData(event.currentTarget);
    setChangedSinceResult(true);
    setDraft((current) => mergeRulesFormDraft(current, data));
  };

  useEffect(() => setChangedSinceResult(false), [result]);

  const dirty = draft.rules.taxCode !== saved.rules.taxCode || draft.rules.pec !== saved.rules.pec;
  const labelsDirty = labelsEnabled !== (labelState.mode !== "off");
  const automaticLabelWrites =
    labelSnapshot?.slots.flatMap((slot) => {
      if (slot.capability !== "automatic" || (slot.name !== "taxCode" && slot.name !== "pec")) {
        return [];
      }
      const proposed = proposedLabelForSlot(slot, draft.rules);
      if (proposed === null || checkoutLabelValuesMatch(proposed, slot.currentValue)) return [];
      return [{ slot, proposed }];
    }) ?? [];

  useEffect(() => setSaveBarVisibility(SAVE_BAR, dirty || labelsDirty), [dirty, labelsDirty]);

  const submitSave = (labelsConfirmed: boolean) => {
    if (busy || conflict || sentRef.current) return;
    sentRef.current = draft;
    setResolvedConflict(false);
    send(
      {
        configHash: baseHash.current ?? "",
        taxCode: draft.rules.taxCode,
        pec: draft.rules.pec,
        labelsEnabled: labelsEnabled ? "1" : "0",
        labelsConfirmed: labelsConfirmed ? "1" : "0",
        labelsRevision: labelSnapshot?.revision ?? "",
      },
      { method: "post" },
    );
  };

  const save = () => {
    if (busy || labelsLoading || conflict || sentRef.current) return;
    const firstAutomaticWrite =
      labelsEnabled && labelState.mode === "off" && automaticLabelWrites.length > 0;
    if (firstAutomaticWrite) {
      const modal = document.getElementById(LABEL_CONFIRM_MODAL) as
        | (HTMLElement & {
            showOverlay?: () => void;
          })
        | null;
      modal?.showOverlay?.();
      return;
    }
    submitSave(false);
  };

  useEffect(() => {
    if (!result || !sentRef.current || busy) return;
    sentRef.current = null;
    if (result.ok) {
      baseRef.current = { rules: saved.rules };
      baseHash.current = saved.configHash;
    }
  }, [result, saved.rules, saved.configHash, busy]);

  const reapply = () => {
    setDraft(rebaseRulesDraft(baseRef.current, draft, current));
    baseRef.current = current;
    baseHash.current = saved.configHash;
    setResolvedConflict(true);
    setFormRevision((revision) => revision + 1);
  };

  const discard = () => {
    baseRef.current = current;
    baseHash.current = saved.configHash;
    setResolvedConflict(true);
    setDraft({ rules: saved.rules });
    setLabelsEnabled(labelState.mode !== "off");
    setFormRevision((current) => current + 1);
  };

  if (saved.duplicateError) {
    return (
      <s-page heading={t.rules.heading}>
        <s-banner tone="critical">{t.errors[saved.duplicateError]}</s-banner>
      </s-page>
    );
  }

  return (
    <s-page heading={t.rules.heading}>
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

      <ui-save-bar id={SAVE_BAR}>
        <button type="button" variant="primary" disabled={busy || Boolean(conflict)} onClick={save}>
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

      <div className="rules-layout-container">
        <div className="rules-layout">
          <div className="rules-layout__main">
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
                <s-section>
                  <s-stack direction="block" gap="base">
                    <s-stack direction="block" gap="small-100">
                      <s-heading>{t.rules.taxCodeLabel}</s-heading>
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
                    </s-stack>
                    <s-stack direction="block" gap="small-100">
                      <s-heading>{t.rules.pecLabel}</s-heading>
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
                    </s-stack>
                  </s-stack>
                </s-section>
              </div>
            </form>

            <div className="rules-layout__labels">
              <CheckoutLabelsSection
                locale={saved.locale}
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
                onEnabledChange={(value) => {
                  setChangedSinceResult(true);
                  setLabelsEnabled(value);
                }}
                onScopeGranted={() => labels.load(draft.rules)}
              />
              <ConfigurationHistory
                locale={saved.locale}
                current={{ rules: saved.rules, messages: saved.messages }}
                entries={saved.configurationHistory}
                busy={busy}
                onRestore={(historyId) =>
                  send(
                    {
                      intent: RULES_INTENTS.restoreConfiguration,
                      historyId: String(historyId),
                      configHash: saved.configHash ?? "",
                      labelsRevision: labelSnapshot?.revision ?? "",
                    },
                    { method: "post" },
                  )
                }
              />
            </div>
          </div>

          <div className="rules-layout__preview">
            <s-section heading={t.rules.previewHeading}>
              <s-stack direction="block" gap="base">
                <s-stack direction="block" gap="small-100">
                  {describeCheckout(
                    {
                      rules: draft.rules,
                      status: validationStatus(saved.enabled, saved.entitled),
                    },
                    saved.locale,
                  ).map((line) => (
                    <s-paragraph key={line}>{line}</s-paragraph>
                  ))}
                </s-stack>

                <CheckoutSimulator
                  locale={saved.locale}
                  rules={draft.rules}
                  messages={saved.messages}
                />
              </s-stack>
            </s-section>
          </div>
        </div>
      </div>
    </s-page>
  );
}

function ConfigurationHistory({
  locale,
  current,
  entries,
  busy,
  onRestore,
}: {
  locale: Locale;
  current: ConfigurationSnapshot;
  entries: Awaited<ReturnType<typeof readConfigurationHistory>>;
  busy: boolean;
  onRestore: (id: number) => void;
}) {
  const t = texts(locale);
  const copy = t.rules.history;
  const visible = entries.flatMap((entry) => {
    const changed = changedConfigurationFields(current, entry);
    return changed.length > 0 ? [{ entry, changed }] : [];
  });
  if (visible.length === 0) return null;

  return (
    <s-section heading={copy.heading}>
      <s-stack direction="block" gap="base">
        <s-paragraph color="subdued">{copy.body}</s-paragraph>
        {visible.map(({ entry, changed }) => (
          <s-box key={entry.id} background="subdued" borderRadius="base" padding="base">
            <s-stack direction="block" gap="small-100">
              <s-text type="strong">{formatDateTime(entry.createdAt, locale)}</s-text>
              <s-text color="subdued">
                {copy.changed(
                  changed.map((field) =>
                    field === "taxCode"
                      ? t.rules.taxCodeLabel
                      : field === "pec"
                        ? t.rules.pecLabel
                        : copy.messages,
                  ),
                )}
              </s-text>
              <s-button disabled={busy} onClick={() => onRestore(entry.id)}>
                {copy.restore}
              </s-button>
            </s-stack>
          </s-box>
        ))}
      </s-stack>
    </s-section>
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
  result: Awaited<ReturnType<typeof action>> | undefined;
  dirty: boolean;
  changedSinceResult: boolean;
  labelsErrorCode: string | null;
  errorCode: string | null;
  conflict: boolean;
}) {
  return (
    <>
      {showSavedBanner(result, dirty, changedSinceResult) ? (
        <div className="cf-motion-reveal">
          <s-banner tone={labelsErrorCode ? "warning" : "success"}>
            {labelsErrorCode ? t.rules.labelsSaved : t.rules.saved}
          </s-banner>
        </div>
      ) : null}
      {errorCode && (errorCode !== "config_conflict" || conflict) ? (
        <div className="cf-motion-reveal">
          <s-banner tone="critical">{localizedError(t.errors, errorCode)}</s-banner>
        </div>
      ) : null}
    </>
  );
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
  ];
}
