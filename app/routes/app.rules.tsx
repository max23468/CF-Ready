import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { localizedError } from "../app-error";
import { authenticateAdmin } from "../admin-auth.server";
import { ConfigConflict } from "../features/ConfigConflict";
import { CheckoutSimulator } from "../features/rules/CheckoutSimulator";
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
  const timing = createServerTiming();
  const { admin, session } = await timing.measure("auth", () =>
    authenticateAdmin(request, context),
  );
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
  const [configHash, address2Declaration] = await Promise.all([
    observedConfigHash(validation),
    timing.measure("d1_address", () => readAddress2Declaration(db, session.shop)),
  ]);

  return data(
    {
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
    },
    { headers: { "Server-Timing": timing.header() } },
  );
};

export const headers: HeadersFunction = (args) => boundary.headers(args);

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
  const busy = useNavigation().state !== "idle";
  const current = {
    rules: saved.rules,
    errorDisplay: saved.errorDisplay,
    address2: saved.address2Declared,
  };
  const baseRef = useRef(current);
  const sentRef = useRef<RulesFormDraft | null>(null);
  const baseHash = useRef(saved.configHash);
  const [resolvedConflict, setResolvedConflict] = useState(false);
  const errorCode = result?.ok === false ? result.errorCode : null;
  const conflict = errorCode === "config_conflict" && !resolvedConflict;
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

  const save = () => {
    if (busy || conflict || sentRef.current) return;
    sentRef.current = draft;
    setResolvedConflict(false);
    send(
      {
        configHash: baseHash.current ?? "",
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
  };

  useEffect(() => {
    if (!result || !sentRef.current || busy) return;
    sentRef.current = null;
    if (result.ok) {
      baseRef.current = {
        rules: saved.rules,
        errorDisplay: saved.errorDisplay,
        address2: saved.address2Declared,
      };
      baseHash.current = saved.configHash;
    }
  }, [result, saved.rules, saved.errorDisplay, saved.address2Declared, saved.configHash, busy]);

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
      {showSavedBanner(result, dirty, changedSinceResult) ? (
        <div className="cf-motion-reveal">
          <s-banner tone="success">{t.rules.saved}</s-banner>
        </div>
      ) : null}
      {errorCode && (errorCode !== "config_conflict" || conflict) ? (
        <div className="cf-motion-reveal">
          <s-banner tone="critical">{localizedError(t.errors, errorCode)}</s-banner>
        </div>
      ) : null}

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
              <s-stack direction="block" gap="base">
                <s-section heading={t.rules.taxCodeLabel}>
                  <s-choice-list
                    label={t.rules.taxCodeLabel}
                    labelAccessibilityVisibility="exclusive"
                    name="taxCode"
                  >
                    {RULE_MODES.map((mode) => (
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
                    {RULE_MODES.map((mode) => (
                      <s-choice key={mode} value={mode} selected={mode === draft.rules.pec}>
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
              <s-stack direction="block" gap="base">
                <s-section heading={t.rules.address2Heading}>
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
                </s-section>
                <s-section>
                  <s-checkbox
                    label={t.rules.preventiveLabel}
                    details={t.rules.preventiveHelp}
                    name="errorDisplay"
                    value="preventive"
                    defaultChecked={draft.errorDisplay === "preventive"}
                  />
                </s-section>
              </s-stack>
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
              </s-stack>
            </s-section>
          </div>
        </div>
      </div>
    </s-page>
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
      label: t.rules.preventiveLabel,
      current: current.errorDisplay === "preventive" ? t.common.yes : t.common.no,
      draft: draft.errorDisplay === "preventive" ? t.common.yes : t.common.no,
    },
    {
      label: t.rules.address2Heading,
      current: current.address2 ? t.common.yes : t.common.no,
      draft: draft.address2 ? t.common.yes : t.common.no,
    },
  ];
}
