import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useSubmit } from "react-router";
import { describeCheckout, resolveLocale, texts, validationStatus } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { authenticate } from "../shopify.server";
import {
  address2Declaration,
  ERROR_DISPLAYS,
  oneOf,
  readConfig,
  RULE_MODES,
  showSavedBanner,
} from "../config";
import type { ErrorDisplay, RuleMode } from "../config";
import {
  findValidation,
  observedConfigHash,
  queryContext,
  readAddress2Declaration,
  reconcile,
  writeValidation,
} from "../validation.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const state = await reconcile(admin, context.cloudflare.env.DB, session.shop);
  const validation = state.validation;
  const config = readConfig(validation?.metafield?.jsonValue);

  return {
    locale: resolveLocale(request),
    // §11.4: firma della configurazione osservata, rimandata indietro al salvataggio.
    configHash: await observedConfigHash(validation),
    rules: config.rules,
    errorDisplay: config.errorDisplay,
    messages: config.messages,
    enabled: validation?.enabled ?? false,
    entitled: state.entitlement.kind !== "none",
    address2Declared:
      (await readAddress2Declaration(context.cloudflare.env.DB, session.shop)) !== null,
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.cloudflare.env.DB;
  const form = await request.formData();

  // NFR-023: la validazione lato client è cortesia, questa è la difesa. Un valore fuori
  // dall'insieme ammesso non viene corretto in silenzio: la scrittura non parte.
  const taxCode = oneOf(RULE_MODES, form.get("taxCode"));
  const pec = oneOf(RULE_MODES, form.get("pec"));
  const errorDisplay = oneOf(ERROR_DISPLAYS, form.get("errorDisplay") ? "preventive" : "inline");
  if (!taxCode || !pec || !errorDisplay) return { ok: false as const, errorCode: "generic" };

  let current;
  try {
    const validation = findValidation((await queryContext(admin)).validations.nodes);
    current = readConfig(validation?.metafield?.jsonValue);
  } catch {
    return { ok: false as const, errorCode: "validation_write_failed" };
  }

  const declared = address2Declaration(form);

  // FR-051: il salvataggio aggiorna la configurazione e conserva lo stato della Validation.
  // I messaggi non sono editabili da questa pagina: si riscrivono quelli osservati.
  const result = await writeValidation(
    admin,
    db,
    session.shop,
    { rules: { taxCode, pec }, errorDisplay, messages: current.messages },
    null,
    (form.get("configHash") as string) || null,
    declared,
  );

  return result.ok ? { ok: true as const } : { ok: false as const, errorCode: result.errorCode };
};

const SAVE_BAR = "cf-ready-rules";

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function CheckoutRules() {
  const saved = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();

  const t = texts(saved.locale);
  const form = useRef<HTMLFormElement>(null);
  const send = useSubmit();
  const [changedSinceResult, setChangedSinceResult] = useState(false);
  const [draft, setDraft] = useState({
    rules: saved.rules,
    errorDisplay: saved.errorDisplay,
    address2: saved.address2Declared,
  });

  // Un solo ascoltatore sul form invece di uno per controllo: gli eventi dei componenti
  // Polaris risalgono fin qui e l'anteprima legge sempre lo stato reale del modulo.
  const readDraft = (event: { currentTarget: HTMLFormElement }) => {
    const data = new FormData(event.currentTarget);
    setChangedSinceResult(true);
    setDraft({
      rules: {
        taxCode: (data.get("taxCode") as RuleMode) ?? saved.rules.taxCode,
        pec: (data.get("pec") as RuleMode) ?? saved.rules.pec,
      },
      errorDisplay: (data.get("errorDisplay") ? "preventive" : "inline") as ErrorDisplay,
      address2: data.get("address2") !== null,
    });
  };

  useEffect(() => setChangedSinceResult(false), [result]);

  // Il confronto automatico del Save Bar non ha spento la barra quando il merchant tornava sui
  // suoi passi. Qui lo stato "da salvare" è calcolato sui valori che la pagina già conosce,
  // quindi tornare esattamente alla configurazione salvata la fa sparire per costruzione.
  const dirty =
    draft.rules.taxCode !== saved.rules.taxCode ||
    draft.rules.pec !== saved.rules.pec ||
    draft.errorDisplay !== saved.errorDisplay ||
    draft.address2 !== saved.address2Declared;

  useEffect(() => {
    // Se App Bridge non è ancora pronto la pagina resta usabile: un errore dell'app non deve
    // togliere al merchant la possibilità di salvare.
    if (typeof shopify === "undefined") return;
    void (dirty ? shopify.saveBar.show(SAVE_BAR) : shopify.saveBar.hide(SAVE_BAR));
  }, [dirty]);

  const save = () =>
    send(
      {
        configHash: saved.configHash ?? "",
        taxCode: draft.rules.taxCode,
        pec: draft.rules.pec,
        ...(draft.errorDisplay === "preventive" ? { errorDisplay: "preventive" } : {}),
        // La dichiarazione viaggia solo quando il blocco è sullo schermo (FR-058).
        ...(draft.rules.taxCode === "unmanaged"
          ? {}
          : { address2Shown: "1", ...(draft.address2 ? { address2: "declared" } : {}) }),
      },
      { method: "post" },
    );

  const discard = () => {
    form.current?.reset();
    setDraft({
      rules: saved.rules,
      errorDisplay: saved.errorDisplay,
      address2: saved.address2Declared,
    });
  };

  return (
    // Il form avvolge la pagina, così l'anteprima nell'aside resta parte dello stesso modulo.
    <form ref={form} onChange={readDraft}>
      <s-page heading={t.rules.heading}>
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

        {/* Le due decisioni sono la pagina: restano le uniche card operative. */}
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

        {/* FR-058: avviso e dichiarazione, mai un rilevamento. Compare solo quando il Codice
            Fiscale è gestito, perché è lì che i due campi si sovrappongono. */}
        {draft.rules.taxCode === "unmanaged" ? null : (
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
        )}

        {/* L'anteprima è ciò che si guarda mentre si decide, quindi sta accanto alle scelte e
            apre la colonna; le eccezioni la seguono come blocco a sé. */}
        <s-stack slot="aside" direction="block" gap="base">
          <s-section heading={t.rules.previewHeading}>
            <s-stack direction="block" gap="base">
              <s-checkbox
                label={t.rules.preventiveLabel}
                details={t.rules.preventiveHelp}
                name="errorDisplay"
                value="preventive"
                defaultChecked={saved.errorDisplay === "preventive"}
              />
              {/* D-068: anteprima testuale, nessuna simulazione grafica del checkout. */}
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
            </s-stack>
          </s-section>

          {/* D-067: le eccezioni sono sempre visibili e non modificabili. */}
          <s-section heading={t.rules.exceptionsHeading}>
            <s-unordered-list>
              {t.rules.exceptions.map((line) => (
                <s-list-item key={line}>{line}</s-list-item>
              ))}
            </s-unordered-list>
          </s-section>
        </s-stack>
      </s-page>
    </form>
  );
}
