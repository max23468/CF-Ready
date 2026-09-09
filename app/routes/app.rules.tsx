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
import {
  address2Declaration,
  oneOf,
  PEC_RULE_MODES,
  readConfig,
  showSavedBanner,
  TAX_CODE_RULE_MODES,
} from "../config";
import { databaseContext } from "../context.server";
import { readCheckoutLabelState } from "../checkout-labels/repository.server";
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
  observedConfigHash,
  readAddress2Declaration,
  reconcile,
  writeValidation,
} from "../validation.server";

const SAVE_BAR = "checkout-rules-save-bar";

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
  const [configHash, address2Declaration, scopeDetails, labelState] = await Promise.all([
    observedConfigHash(validation),
    timing.measure("d1_address", () => readAddress2Declaration(db, session.shop)),
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
      address2Declared: address2Declaration !== null,
      labelScopesGranted,
      labelState: labels?.state ?? labelState,
      labelSnapshot: labels?.available ? labels.snapshot : null,
      confirmedGuidedSlotIds: labels?.available ? labels.confirmedGuidedSlotIds : [],
      labelLoadError:
        labels && !labels.available
          ? labels.errorCode
          : labelScopesGranted
            ? null
            : labelState.mode === "off"
              ? null
              : "checkout_labels_scope_required",
      checkoutSettingsUrl: `https://admin.shopify.com/store/${shopHandle}/settings/checkout`,
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

  if (intent === "request_label_scopes") {
    await scopes.request([...CHECKOUT_LABEL_OPTIONAL_SCOPES]);
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

  const declared = address2Declaration(form);

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
        address2Declared: declared,
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
        declared,
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
  const current = {
    rules: saved.rules,
    address2: saved.address2Declared,
  };
  const baseRef = useRef(current);
  const sentRef = useRef<RulesFormDraft | null>(null);
  const baseHash = useRef(saved.configHash);
  const [resolvedConflict, setResolvedConflict] = useState(false);
  const errorCode = result?.ok === false ? result.errorCode : null;
  const conflict = errorCode === "config_conflict" && !resolvedConflict;
  const labelsErrorCode = result?.ok && "labelsErrorCode" in result ? result.labelsErrorCode : null;
  const [changedSinceResult, setChangedSinceResult] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const [draft, setDraft] = useState({
    rules: saved.rules,
    address2: saved.address2Declared,
  });
  const [labelsEnabled, setLabelsEnabled] = useState(saved.labelState.mode !== "off");

  // Un solo ascoltatore sul form delle impostazioni. Il simulatore è deliberatamente fuori:
  // i suoi valori sono locali e non devono rendere sporca la configurazione del merchant.
  const readDraft = (event: { currentTarget: HTMLFormElement }) => {
    const data = new FormData(event.currentTarget);
    setChangedSinceResult(true);
    setDraft((current) => mergeRulesFormDraft(current, data));
  };

  useEffect(() => setChangedSinceResult(false), [result]);

  const dirty =
    draft.rules.taxCode !== saved.rules.taxCode ||
    draft.rules.pec !== saved.rules.pec ||
    draft.address2 !== saved.address2Declared;
  const labelsDirty = labelsEnabled !== (saved.labelState.mode !== "off");
  const automaticLabelsAvailable = Boolean(
    saved.labelSnapshot?.slots.some(
      (slot) => slot.capability === "automatic" && (slot.name === "taxCode" || slot.name === "pec"),
    ),
  );

  useEffect(() => setSaveBarVisibility(SAVE_BAR, dirty || labelsDirty), [dirty, labelsDirty]);

  const save = () => {
    if (busy || conflict || sentRef.current) return;
    const firstAutomaticWrite =
      labelsEnabled && saved.labelState.mode === "off" && automaticLabelsAvailable;
    if (firstAutomaticWrite && !window.confirm(t.rules.labels.enableConfirm)) return;
    sentRef.current = draft;
    setResolvedConflict(false);
    send(
      {
        configHash: baseHash.current ?? "",
        taxCode: draft.rules.taxCode,
        pec: draft.rules.pec,
        labelsEnabled: labelsEnabled ? "1" : "0",
        labelsConfirmed: firstAutomaticWrite ? "1" : "0",
        labelsRevision: saved.labelSnapshot?.revision ?? "",
        // Il blocco resta sempre visibile: la dichiarazione può quindi essere aggiornata anche
        // mentre il Codice Fiscale non è gestito.
        address2Shown: "1",
        ...(draft.address2 ? { address2: "declared" } : {}),
      },
      { method: "post" },
    );
  };

  useEffect(() => {
    if (!result || !sentRef.current || busy) return;
    sentRef.current = null;
    if (result.ok) {
      baseRef.current = {
        rules: saved.rules,
        address2: saved.address2Declared,
      };
      baseHash.current = saved.configHash;
    }
  }, [result, saved.rules, saved.address2Declared, saved.configHash, busy]);

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
    setDraft({
      rules: saved.rules,
      address2: saved.address2Declared,
    });
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

      <div className="rules-layout-container">
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
              <CheckoutLabelsSection
                locale={saved.locale}
                rules={draft.rules}
                scopeGranted={saved.labelScopesGranted}
                snapshot={saved.labelSnapshot}
                state={saved.labelState}
                loadErrorCode={saved.labelLoadError}
                confirmedGuidedSlotIds={saved.confirmedGuidedSlotIds}
                enabled={labelsEnabled}
                busy={busy}
                checkoutSettingsUrl={saved.checkoutSettingsUrl}
                onEnabledChange={(value) => {
                  setChangedSinceResult(true);
                  setLabelsEnabled(value);
                }}
                ruleControls={
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
                }
                addressDeclaration={
                  <s-stack direction="block" gap="small-200">
                    <s-banner tone="warning">{t.rules.address2Body}</s-banner>
                    <s-checkbox
                      label={t.rules.address2Checkbox}
                      name="address2"
                      value="declared"
                      defaultChecked={draft.address2}
                    />
                    {draft.address2 ? (
                      <div className="cf-motion-reveal">
                        <s-paragraph>{t.rules.address2Instructions}</s-paragraph>
                      </div>
                    ) : null}
                  </s-stack>
                }
              />
            </div>
          </form>

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
    {
      label: t.rules.address2Heading,
      current: current.address2 ? t.common.yes : t.common.no,
      draft: draft.address2 ? t.common.yes : t.common.no,
    },
  ];
}
