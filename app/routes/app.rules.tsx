import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { localizedError } from "../app-error";
import { authenticateAdmin } from "../admin-auth.server";
import { ConfigConflict } from "../features/ConfigConflict";
import { CheckoutSimulator } from "../features/rules/CheckoutSimulator";
import { CheckoutLabelsSection } from "../features/rules/CheckoutLabelsSection";
import "../features/rules/RulesLayout.css";
import {
  mergeRulesFormDraft,
  rebaseRulesDraft,
  type RulesFormDraft,
} from "../features/rules/rules-form";
import { describeCheckout, resolveLocale, texts, validationStatus } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { setSaveBarVisibility } from "../save-bar";
import { createServerTiming } from "../server-timing.server";
import { authenticate } from "../shopify.server";
import { oneOf, PEC_RULE_MODES, readConfig, showSavedBanner, TAX_CODE_RULE_MODES } from "../config";
import { databaseContext } from "../context.server";
import { readCheckoutLabelState, saveAddress2FormMode } from "../checkout-labels/repository.server";
import {
  acceptCheckoutLabelsCustomization,
  acceptAddress2Customization,
  CHECKOUT_LABEL_OPTIONAL_SCOPES,
  confirmGuidedCheckoutLabels,
  loadCheckoutLabels,
  restoreAddress2Translations,
  saveRulesAndCheckoutLabels,
} from "../checkout-labels/service.server";
import {
  checkoutLabelValuesMatch,
  proposedLabelForSlot,
  type CheckoutLabelSlot,
} from "../checkout-labels/domain";
import { observedConfigHash, reconcile, writeValidation } from "../validation.server";

const SAVE_BAR = "checkout-rules-save-bar";
const LABEL_CONFIRM_MODAL = "confirm-checkout-label-management";
const ADDRESS2_FORM_MODES = ["required", "optional"] as const;

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const timing = createServerTiming();
  const authentication = await timing.measure("auth", () => authenticateAdmin(request, context));
  const { admin, session, scopes } = authentication;
  const db = context.get(databaseContext);
  const state = await reconcile(admin, db, session.shop, {
    prefetchBilling: true,
    reportTiming: timing.record,
  });
  const validation = state.validation;
  const config = readConfig(validation?.metafield?.jsonValue);
  const duplicateError: "duplicate_validations" | "duplicate_validations_active" | null =
    state.errorCode === "duplicate_validations" ||
    state.errorCode === "duplicate_validations_active"
      ? state.errorCode
      : null;
  const [configHash, scopeDetails, labelState] = await Promise.all([
    observedConfigHash(validation),
    timing.measure("shopify_snapshot", () => scopes.query().catch(() => null)),
    timing.measure("d1_validation_state", () => readCheckoutLabelState(db, session.shop)),
  ]);
  const labelScopesGranted = CHECKOUT_LABEL_OPTIONAL_SCOPES.every((scope) =>
    scopeDetails?.granted.includes(scope),
  );
  const labels = labelScopesGranted
    ? await timing.measure("shopify_snapshot", () =>
        loadCheckoutLabels(admin, db, session.shop, config.rules),
      )
    : null;
  const shopHandle = session.shop.replace(/\.myshopify\.com$/, "");

  return data(
    {
      locale: resolveLocale(request),
      duplicateError,
      // §11.4: firma della configurazione osservata, rimandata indietro al salvataggio.
      configHash,
      rules: config.rules,
      messages: config.messages,
      enabled: state.validationEnabled,
      entitled: state.entitlement.kind !== "none",
      labelScopesGranted,
      labelState: labels?.state ?? labelState,
      labelSnapshot: labels?.available ? labels.snapshot : null,
      guidedConfirmations: labels?.available ? labels.guidedConfirmations : [],
      labelLoadError:
        labels && !labels.available
          ? labels.errorCode
          : labelScopesGranted
            ? null
            : labelState.mode === "off"
              ? null
              : "checkout_labels_scope_required",
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
  const intent = form.get("intent");

  if (intent === "save_address2_form_mode") {
    const mode = oneOf(ADDRESS2_FORM_MODES, form.get("address2FormMode"));
    if (!mode) return { ok: false as const, errorCode: "generic" as const };
    await saveAddress2FormMode(db, session.shop, mode);
    return { ok: true as const };
  }

  const scopeDetails = await scopes.query().catch(() => null);
  const labelScopesGranted = CHECKOUT_LABEL_OPTIONAL_SCOPES.every((scope) =>
    scopeDetails?.granted.includes(scope),
  );

  if (intent === "restore_address2_labels") {
    if (!labelScopesGranted) {
      return { ok: false as const, errorCode: "checkout_labels_scope_required" as const };
    }
    const revision = form.get("labelsRevision");
    if (typeof revision !== "string" || !revision) {
      return { ok: false as const, errorCode: "address2_restore_conflict" as const };
    }
    return restoreAddress2Translations(
      admin,
      db,
      session.shop,
      revision,
      form.getAll("slotId").filter((value): value is string => typeof value === "string"),
    );
  }

  if (intent === "accept_address2_labels") {
    if (!labelScopesGranted) {
      return { ok: false as const, errorCode: "checkout_labels_scope_required" as const };
    }
    const revision = form.get("labelsRevision");
    if (typeof revision !== "string" || !revision) {
      return { ok: false as const, errorCode: "checkout_labels_conflict" as const };
    }
    return acceptAddress2Customization(admin, db, session.shop, revision);
  }

  if (intent === "accept_checkout_labels") {
    const revision = form.get("labelsRevision");
    if (labelScopesGranted && (typeof revision !== "string" || !revision)) {
      return { ok: false as const, errorCode: "checkout_labels_conflict" as const };
    }
    return acceptCheckoutLabelsCustomization(
      admin,
      db,
      session.shop,
      labelScopesGranted && typeof revision === "string" ? revision : null,
    );
  }

  if (intent === "confirm_guided_labels") {
    if (!labelScopesGranted) {
      return { ok: false as const, errorCode: "checkout_labels_scope_required" as const };
    }
    const revision = form.get("labelsRevision");
    if (typeof revision !== "string" || !revision) {
      return { ok: false as const, errorCode: "checkout_labels_conflict" as const };
    }
    const current = await reconcile(admin, db, session.shop);
    const rules = readConfig(current.validation?.metafield?.jsonValue).rules;
    return confirmGuidedCheckoutLabels(
      admin,
      db,
      session.shop,
      rules,
      revision,
      form.getAll("slotId").filter((value): value is string => typeof value === "string"),
    );
  }

  // NFR-023: la validazione lato client è cortesia, questa è la difesa. Un valore fuori
  // dall'insieme ammesso non viene corretto in silenzio: la scrittura non parte.
  const taxCode = oneOf(TAX_CODE_RULE_MODES, form.get("taxCode"));
  const pec = oneOf(PEC_RULE_MODES, form.get("pec"));
  if (!taxCode || !pec) return { ok: false as const, errorCode: "generic" };

  // FR-051: il salvataggio aggiorna la configurazione e conserva lo stato della Validation.
  // I messaggi non sono editabili da questa pagina: il percorso condiviso conserva quelli
  // osservati sotto la stessa lease usata per la scrittura.
  const labelsEnabled = form.get("labelsEnabled") === "1";
  if (labelsEnabled && !labelScopesGranted) {
    return { ok: false as const, errorCode: "checkout_labels_scope_required" as const };
  }
  const labelsWereEnabled = labelScopesGranted
    ? false
    : (await readCheckoutLabelState(db, session.shop)).mode !== "off";

  const result = labelScopesGranted
    ? await saveRulesAndCheckoutLabels(admin, db, session.shop, {
        rules: { taxCode, pec },
        expectedConfigHash: (form.get("configHash") as string) || null,
        labelsEnabled,
        confirmAutomaticWrite: form.get("labelsConfirmed") === "1",
        expectedLabelsRevision: (form.get("labelsRevision") as string) || null,
      })
    : await writeValidation(
        admin,
        db,
        session.shop,
        { rules: { taxCode, pec } },
        null,
        (form.get("configHash") as string) || null,
      );

  if (!labelScopesGranted && labelsWereEnabled) {
    // Le regole restano salvabili anche dopo una revoca. La gestione delle etichette rimane
    // sospesa finché il merchant non concede nuovamente gli scope.
    return result.ok
      ? { ok: true as const, labelsErrorCode: "checkout_labels_scope_required" as const }
      : result;
  }

  if (!result.ok) return { ok: false as const, errorCode: result.errorCode };
  const labelsErrorCode = "labelsErrorCode" in result ? result.labelsErrorCode : null;
  return labelsErrorCode ? { ok: true as const, labelsErrorCode } : { ok: true as const };
};

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function CheckoutRules() {
  const saved = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();

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
  const labelsErrorCode = result?.ok && "labelsErrorCode" in result ? result.labelsErrorCode : null;
  const [changedSinceResult, setChangedSinceResult] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const [draft, setDraft] = useState({ rules: saved.rules });
  const [labelsEnabled, setLabelsEnabled] = useState(saved.labelState.mode !== "off");

  // Un solo ascoltatore sul form delle impostazioni. Il simulatore è deliberatamente fuori:
  // i suoi valori sono locali e non devono rendere sporca la configurazione del merchant.
  const readDraft = (event: { currentTarget: HTMLFormElement }) => {
    const data = new FormData(event.currentTarget);
    setChangedSinceResult(true);
    setDraft((current) => mergeRulesFormDraft(current, data));
  };

  useEffect(() => setChangedSinceResult(false), [result]);

  const dirty = draft.rules.taxCode !== saved.rules.taxCode || draft.rules.pec !== saved.rules.pec;
  const labelsDirty = labelsEnabled !== (saved.labelState.mode !== "off");
  const automaticLabelWrites =
    saved.labelSnapshot?.slots.flatMap((slot) => {
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
        labelsRevision: saved.labelSnapshot?.revision ?? "",
      },
      { method: "post" },
    );
  };

  const save = () => {
    if (busy || conflict || sentRef.current) return;
    const firstAutomaticWrite =
      labelsEnabled && saved.labelState.mode === "off" && automaticLabelWrites.length > 0;
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
    setLabelsEnabled(saved.labelState.mode !== "off");
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
                    <s-choice-list label={t.rules.taxCodeLabel} name="taxCode">
                      {TAX_CODE_RULE_MODES.map((mode) => (
                        <s-choice key={mode} value={mode} selected={mode === draft.rules.taxCode}>
                          {t.rules.taxCode[mode]}
                          <s-text slot="details">{t.rules.taxCode[`${mode}Help`]}</s-text>
                        </s-choice>
                      ))}
                    </s-choice-list>
                    <s-choice-list label={t.rules.pecLabel} name="pec">
                      {PEC_RULE_MODES.map((mode) => (
                        <s-choice key={mode} value={mode} selected={mode === draft.rules.pec}>
                          {t.rules.pec[mode]}
                          <s-text slot="details">{t.rules.pec[`${mode}Help`]}</s-text>
                        </s-choice>
                      ))}
                    </s-choice-list>
                  </s-stack>
                </s-section>
              </div>
            </form>

            <div className="rules-layout__labels">
              <CheckoutLabelsSection
                locale={saved.locale}
                rules={draft.rules}
                scopeGranted={saved.labelScopesGranted}
                snapshot={saved.labelSnapshot}
                state={saved.labelState}
                loadErrorCode={saved.labelLoadError}
                guidedConfirmations={saved.guidedConfirmations}
                enabled={labelsEnabled}
                busy={busy}
                checkoutSettingsUrl={saved.checkoutSettingsUrl}
                storefrontUrl={saved.storefrontUrl}
                onEnabledChange={(value) => {
                  setChangedSinceResult(true);
                  setLabelsEnabled(value);
                }}
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
                  labelSnapshot={saved.labelSnapshot}
                />
              </s-stack>
            </s-section>
          </div>
        </div>
      </div>
    </s-page>
  );
}

function AutomaticLabelsConfirmModal({
  locale,
  writes,
  onConfirm,
}: {
  locale: "it" | "en";
  writes: Array<{
    slot: CheckoutLabelSlot;
    proposed: string;
  }>;
  onConfirm: () => void;
}) {
  const t = texts(locale);
  const copy = t.rules.labels;
  return (
    <s-modal
      id={LABEL_CONFIRM_MODAL}
      heading={copy.enableConfirmHeading}
      accessibilityLabel={copy.enableConfirmHeading}
    >
      <s-stack direction="block" gap="base">
        <s-paragraph>{copy.enableConfirmBody}</s-paragraph>
        <s-unordered-list>
          {writes.map(({ slot, proposed }) => (
            <s-list-item key={`${slot.name}:${slot.family}`}>
              {slot.name === "taxCode" ? t.rules.taxCodeLabel : t.rules.pecLabel} ·{" "}
              {slot.family === "it" ? copy.italian : copy.english}: {proposed}
            </s-list-item>
          ))}
        </s-unordered-list>
      </s-stack>
      <s-button slot="secondary-actions" commandFor={LABEL_CONFIRM_MODAL} command="--hide">
        {t.common.cancel}
      </s-button>
      <s-button
        slot="primary-action"
        variant="primary"
        commandFor={LABEL_CONFIRM_MODAL}
        command="--hide"
        onClick={onConfirm}
      >
        {copy.enableConfirmAction}
      </s-button>
    </s-modal>
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
