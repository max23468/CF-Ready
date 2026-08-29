import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useSubmit } from "react-router";
import { authenticateAdmin } from "../admin-auth.server";
import { CheckoutSimulator } from "../features/rules/CheckoutSimulator";
import "../features/rules/RulesLayout.css";
import { mergeRulesFormDraft } from "../features/rules/rules-form";
import { describeCheckout, resolveLocale, texts, validationStatus } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { setSaveBarVisibility } from "../save-bar";
import { authenticate } from "../shopify.server";
import {
  address2Declaration,
  ERROR_DISPLAYS,
  oneOf,
  readConfig,
  RULE_MODES,
  showSavedBanner,
} from "../config";
import { databaseContext } from "../context.server";
import {
  observedConfigHash,
  readAddress2Declaration,
  reconcile,
  writeValidation,
} from "../validation.server";

const SAVE_BAR = "checkout-rules-save-bar";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticateAdmin(request, context);
  const db = context.get(databaseContext);
  const state = await reconcile(admin, db, session.shop);
  const validation = state.validation;
  const config = readConfig(validation?.metafield?.jsonValue);
  const duplicateError: "duplicate_validations" | "duplicate_validations_active" | null =
    state.errorCode === "duplicate_validations" ||
    state.errorCode === "duplicate_validations_active"
      ? state.errorCode
      : null;
  const [configHash, address2Declaration] = await Promise.all([
    observedConfigHash(validation),
    readAddress2Declaration(db, session.shop),
  ]);

  return {
    locale: resolveLocale(request),
    duplicateError,
    // §11.4: firma della configurazione osservata, rimandata indietro al salvataggio.
    configHash,
    rules: config.rules,
    errorDisplay: config.errorDisplay,
    messages: config.messages,
    enabled: state.validationEnabled,
    entitled: state.entitlement.kind !== "none",
    address2Declared: address2Declaration !== null,
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.get(databaseContext);
  const form = await request.formData();

  // NFR-023: la validazione lato client è cortesia, questa è la difesa. Un valore fuori
  // dall'insieme ammesso non viene corretto in silenzio: la scrittura non parte.
  const taxCode = oneOf(RULE_MODES, form.get("taxCode"));
  const pec = oneOf(RULE_MODES, form.get("pec"));
  const errorDisplay = oneOf(ERROR_DISPLAYS, form.get("errorDisplay") ? "preventive" : "inline");
  if (!taxCode || !pec || !errorDisplay) return { ok: false as const, errorCode: "generic" };

  const declared = address2Declaration(form);

  // FR-051: il salvataggio aggiorna la configurazione e conserva lo stato della Validation.
  // I messaggi non sono editabili da questa pagina: il percorso condiviso conserva quelli
  // osservati sotto la stessa lease usata per la scrittura.
  const result = await writeValidation(
    admin,
    db,
    session.shop,
    { rules: { taxCode, pec }, errorDisplay },
    null,
    (form.get("configHash") as string) || null,
    declared,
  );

  return result.ok ? { ok: true as const } : { ok: false as const, errorCode: result.errorCode };
};

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function CheckoutRules() {
  const saved = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();

  const t = texts(saved.locale);
  const send = useSubmit();
  const [changedSinceResult, setChangedSinceResult] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const [draft, setDraft] = useState({
    rules: saved.rules,
    errorDisplay: saved.errorDisplay,
    address2: saved.address2Declared,
  });

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
    draft.errorDisplay !== saved.errorDisplay ||
    draft.address2 !== saved.address2Declared;

  useEffect(() => setSaveBarVisibility(SAVE_BAR, dirty), [dirty]);

  const save = () =>
    send(
      {
        configHash: saved.configHash ?? "",
        taxCode: draft.rules.taxCode,
        pec: draft.rules.pec,
        ...(draft.errorDisplay === "preventive" ? { errorDisplay: "preventive" } : {}),
        // Il blocco resta sempre visibile: la dichiarazione può quindi essere aggiornata anche
        // mentre il Codice Fiscale non è gestito.
        address2Shown: "1",
        ...(draft.address2 ? { address2: "declared" } : {}),
      },
      { method: "post" },
    );

  const discard = () => {
    setDraft({
      rules: saved.rules,
      errorDisplay: saved.errorDisplay,
      address2: saved.address2Declared,
    });
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
    <s-page heading={t.rules.heading} inlineSize="large">
      {showSavedBanner(result, dirty, changedSinceResult) ? (
        <s-banner tone="success">{t.rules.saved}</s-banner>
      ) : null}
      {result && !result.ok ? (
        <s-banner tone="critical">
          {t.errors[result.errorCode as keyof typeof t.errors] ?? t.errors.generic}
        </s-banner>
      ) : null}

      <ui-save-bar id={SAVE_BAR}>
        <button type="button" variant="primary" onClick={save}>
          {t.common.save}
        </button>
        <button type="button" onClick={discard}>
          {t.common.cancel}
        </button>
      </ui-save-bar>

      <div className="rules-layout-container">
        <div className="rules-layout">
          <form
            className="rules-layout__form"
            key={`${saved.rules.taxCode}-${saved.rules.pec}-${saved.errorDisplay}-${saved.address2Declared}-${formRevision}`}
            onChange={readDraft}
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="rules-layout__fields">
              <s-stack direction="block" gap="base">
                <s-section heading={t.rules.taxCodeLabel}>
                  <s-choice-list
                    label={t.rules.taxCodeLabel}
                    labelAccessibilityVisibility="exclusive"
                    name="taxCode"
                  >
                    {RULE_MODES.map((mode) => (
                      <s-choice key={mode} value={mode} selected={mode === saved.rules.taxCode}>
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
                    {RULE_MODES.map((mode) => (
                      <s-choice key={mode} value={mode} selected={mode === saved.rules.pec}>
                        {t.rules.pec[mode]}
                        <s-text slot="details">{t.rules.pec[`${mode}Help`]}</s-text>
                      </s-choice>
                    ))}
                  </s-choice-list>
                </s-section>
              </s-stack>
            </div>

            <div className="rules-layout__address">
              {/* FR-058: resta una dichiarazione del merchant, non un rilevamento. Tenerla sempre
                visibile evita che sparisca proprio mentre si sta correggendo la configurazione. */}
              <s-section heading={t.rules.address2Heading}>
                <s-banner tone="warning">{t.rules.address2Body}</s-banner>
                <s-checkbox
                  label={t.rules.address2Checkbox}
                  name="address2"
                  value="declared"
                  defaultChecked={saved.address2Declared}
                />
                {draft.address2 ? <s-paragraph>{t.rules.address2Instructions}</s-paragraph> : null}
              </s-section>
            </div>
          </form>

          <div className="rules-layout__preview">
            <s-section heading={t.rules.previewHeading}>
              <s-stack direction="block" gap="base">
                <s-stack direction="block" gap="small-100">
                  {describeCheckout(
                    {
                      rules: draft.rules,
                      errorDisplay: draft.errorDisplay,
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
                  errorDisplay={draft.errorDisplay}
                  messages={saved.messages[saved.locale]}
                />

                <form
                  key={`${saved.errorDisplay}-${formRevision}`}
                  onChange={(event) => {
                    const data = new FormData(event.currentTarget);
                    setChangedSinceResult(true);
                    setDraft((current) => ({
                      ...current,
                      errorDisplay: data.get("errorDisplay") ? "preventive" : "inline",
                    }));
                  }}
                >
                  <s-checkbox
                    label={t.rules.preventiveLabel}
                    details={t.rules.preventiveHelp}
                    name="errorDisplay"
                    value="preventive"
                    defaultChecked={saved.errorDisplay === "preventive"}
                  />
                </form>
              </s-stack>
            </s-section>
          </div>
        </div>
      </div>
    </s-page>
  );
}
