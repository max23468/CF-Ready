import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useSubmit } from "react-router";
import { authenticateAdmin } from "../admin-auth.server";
import {
  DEFAULT_CONFIG,
  MESSAGE_KEYS,
  MESSAGE_MAX_LENGTH,
  messageAppears,
  showSavedBanner,
  readConfig,
} from "../config";
import { validateMessages } from "../config";
import type { CheckoutConfig } from "../config";
import { databaseContext } from "../context.server";
import { CustomerMessagesPreview } from "../features/messages/CustomerMessagesPreview";
import { UncontrolledMessageTextArea } from "../features/messages/UncontrolledMessageTextArea";
import { resolveLocale, texts } from "../i18n";
import type { Locale } from "../i18n";
import { messageSubmission, shouldShowMessageCounter, updateMessageDraft } from "../messages-draft";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { setSaveBarVisibility } from "../save-bar";
import { authenticate } from "../shopify.server";
import {
  findValidation,
  observedConfigHash,
  queryContext,
  writeValidation,
} from "../validation.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { admin } = await authenticateAdmin(request, context);
  const validation = findValidation((await queryContext(admin)).validations.nodes);
  const config = readConfig(validation?.metafield?.jsonValue);

  return {
    locale: resolveLocale(request),
    configHash: await observedConfigHash(validation),
    messages: config.messages,
    rules: config.rules,
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = Object.fromEntries(await request.formData());
  const validated = validateMessages(form);
  if ("problem" in validated) return { ok: false as const, problem: validated.problem };

  // FR-051: si salvano i messaggi e il percorso condiviso conserva il resto della
  // configurazione osservata sotto la stessa lease usata per la scrittura.
  const result = await writeValidation(
    admin,
    context.get(databaseContext),
    session.shop,
    { messages: validated.messages },
    null,
    (form.configHash as string) || null,
  );

  return result.ok ? { ok: true as const } : { ok: false as const, errorCode: result.errorCode };
};

const SAVE_BAR = "cf-ready-messages";
type MessageKey = (typeof MESSAGE_KEYS)[number];

// Polaris non ha un campo che si ridimensiona da solo: `rows` fissa le righe visibili e il
// resto finisce in uno scroll interno. Le righe si calcolano quindi dal testo, così il campo
// cresce e nulla resta nascosto — nemmeno oltre i 200 caratteri, che è proprio il momento in
// cui il merchant deve vedere tutto per decidere cosa tagliare.
// Stima a 45 caratteri per riga, prudente per le colonne strette. Se Polaris
// introduce l'auto-ridimensionamento, questa funzione sparisce.
function rowsFor(text: string) {
  return Math.max(2, Math.ceil((text.length + 1) / 45));
}

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function CustomerMessages() {
  const saved = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const send = useSubmit();
  const t = texts(saved.locale);
  const [changedSinceResult, setChangedSinceResult] = useState(false);
  const [draft, setDraft] = useState<CheckoutConfig["messages"]>(saved.messages);
  const draftRef = useRef(draft);
  const [, startDraftTransition] = useTransition();
  const [activeLocale, setActiveLocale] = useState<Locale>(saved.locale);
  const [selectedKey, setSelectedKey] = useState<MessageKey>("taxCodeRequired");
  const [focusedMessage, setFocusedMessage] = useState<
    { locale: Locale; key: MessageKey } | undefined
  >();
  // I campi non sono controllati: React che riscrive `value` a ogni tasto farebbe saltare il
  // cursore dentro un testo lungo. Il ripristino li rimonta cambiando chiave, così ripartono
  // dal nuovo valore predefinito senza che React possieda il contenuto.
  const [mounted, setMounted] = useState({ it: 0, en: 0 });

  // Il server trimma i testi: senza riallineare la bozza dopo un salvataggio riuscito, uno
  // spazio finale lascerebbe la Save Bar accesa per sempre.
  useEffect(() => {
    if (!result?.ok) return;
    setChangedSinceResult(false);
    draftRef.current = saved.messages;
    setDraft(saved.messages);
    setMounted((current) => ({ it: current.it + 1, en: current.en + 1 }));
  }, [result, saved.messages]);

  useEffect(() => {
    if (!result || result.ok || !("problem" in result) || !result.problem) return;
    setActiveLocale(result.problem.locale);
    setSelectedKey(result.problem.key);
  }, [result]);

  const dirty = (["it", "en"] as const).some((locale) =>
    MESSAGE_KEYS.some((key) => draft[locale][key] !== saved.messages[locale][key]),
  );

  useEffect(() => setSaveBarVisibility(SAVE_BAR, dirty), [dirty]);

  // `input` copre ogni battuta; ascoltare anche `change` ripeteva lo stesso lavoro al commit.
  // Il campo è uncontrolled: la ref conserva subito la sorgente usata da Salva, mentre
  // contatore, altezza e Save Bar possono aggiornarsi in background senza ritardare l'eco
  // visiva della digitazione.
  const readDraft = (event: { target: EventTarget | null }) => {
    const field = event.target as { name?: string; value?: string } | null;
    const [locale, key] = (field?.name ?? "").split(".");
    if (locale !== "it" && locale !== "en") return;
    if (!(MESSAGE_KEYS as readonly string[]).includes(key)) return;
    const value = field?.value ?? "";
    setSelectedKey(key as MessageKey);
    draftRef.current = updateMessageDraft(
      draftRef.current,
      locale,
      key as (typeof MESSAGE_KEYS)[number],
      value,
    );
    setChangedSinceResult(true);
    startDraftTransition(() => {
      // Leggere la ref nell'updater impedisce a una transition già accodata di ripristinare
      // una battuta precedente dopo Salva o Annulla.
      setDraft(() => draftRef.current);
    });
  };

  const discard = () => {
    draftRef.current = saved.messages;
    setDraft(saved.messages);
    setMounted((current) => ({ it: current.it + 1, en: current.en + 1 }));
  };

  const save = () =>
    send(messageSubmission(saved.configHash ?? "", draftRef.current), { method: "post" });

  // FR-063: il ripristino agisce su una lingua sola e lo dichiara nella conferma. Non salva da
  // sé: rimette i testi predefiniti nei campi e il salvataggio resta un gesto esplicito.
  const restore = (locale: Locale) => {
    draftRef.current = {
      ...draftRef.current,
      [locale]: { ...DEFAULT_CONFIG.messages[locale] },
    };
    setChangedSinceResult(true);
    setDraft(draftRef.current);
    setMounted((current) => ({ ...current, [locale]: current[locale] + 1 }));
  };

  return (
    <form onInput={readDraft}>
      <s-page heading={t.messages.heading}>
        {showSavedBanner(result, dirty, changedSinceResult) ? (
          <div className="cf-motion-reveal">
            <s-banner tone="success">{t.messages.saved}</s-banner>
          </div>
        ) : null}
        {result && !result.ok && "errorCode" in result ? (
          <div className="cf-motion-reveal">
            <s-banner tone="critical">
              {t.errors[result.errorCode as keyof typeof t.errors] ?? t.errors.generic}
            </s-banner>
          </div>
        ) : null}

        <ui-save-bar id={SAVE_BAR}>
          <button type="button" variant="primary" onClick={save}>
            {t.common.save}
          </button>
          <button type="button" onClick={discard}>
            {t.common.cancel}
          </button>
        </ui-save-bar>

        <s-section>
          <s-stack direction="block" gap="base">
            <CustomerMessagesPreview
              activeLocale={activeLocale}
              context={t.messages.previewContext}
              errorHeading={t.messages.previewErrorHeading}
              heading={t.messages.previewHeading}
              languageLabel={t.messages.languageSelector}
              languages={{ it: t.messages.italian, en: t.messages.english }}
              message={draft[activeLocale][selectedKey]}
              onLocaleChange={setActiveLocale}
              selectedHeading={t.messages.previewSelected}
              selectedLabel={t.messages[selectedKey]}
            />

            <s-stack direction="block" gap="base">
              {MESSAGE_KEYS.map((key) => {
                const value = draft[activeLocale][key];
                const problem =
                  result && !result.ok && "problem" in result ? result.problem : undefined;
                // Il contatore compare mentre si lavora sul campo o quando il limite si avvicina.
                // Il campo vuoto viene segnalato solo dopo un salvataggio rifiutato, non mentre
                // il merchant cancella il testo per riscriverlo.
                const invalid =
                  value.length > MESSAGE_MAX_LENGTH
                    ? t.messages.tooLong
                    : problem?.locale === activeLocale && problem.key === key
                      ? t.messages.empty
                      : undefined;
                const focused =
                  focusedMessage?.locale === activeLocale && focusedMessage.key === key;

                return (
                  <UncontrolledMessageTextArea
                    key={`${activeLocale}-${key}-${mounted[activeLocale]}`}
                    initialValue={value}
                    label={t.messages[key]}
                    name={`${activeLocale}.${key}`}
                    rows={rowsFor(value)}
                    details={
                      shouldShowMessageCounter(value.length, focused)
                        ? t.messages.counter(value.length)
                        : undefined
                    }
                    error={invalid}
                    onFocus={() => {
                      setSelectedKey(key);
                      setFocusedMessage({ locale: activeLocale, key });
                    }}
                    onBlur={() => setFocusedMessage(undefined)}
                  />
                );
              })}
            </s-stack>
            <s-button commandFor={`restore-${activeLocale}`} command="--show">
              {t.messages.reset}
            </s-button>
          </s-stack>
        </s-section>

        {/* L'anteprima sopra mostra il testo selezionato; questo riquadro aggiunge invece
            l'informazione che manca all'editor: quali messaggi sono pertinenti alle regole
            correnti e possono quindi comparire quando il controllo è attivo. */}
        <s-section slot="aside" heading={t.messages.appearHeading}>
          <s-stack direction="block" gap="small-100">
            <s-paragraph>{t.messages.appearIntro}</s-paragraph>
            <div className="cf-data-list">
              {MESSAGE_KEYS.map((key) => (
                <div className="cf-data-row" key={key}>
                  <s-text>{t.messages[key]}</s-text>
                  <s-badge>
                    {messageAppears(saved.rules, key) ? t.messages.appears : t.messages.appearsNot}
                  </s-badge>
                </div>
              ))}
            </div>
            <s-link href="/app/rules">{t.nav.rules}</s-link>
          </s-stack>
        </s-section>

        {(["it", "en"] as const).map((locale) => (
          <s-modal
            key={locale}
            id={`restore-${locale}`}
            heading={t.messages.reset}
            accessibilityLabel={t.messages.resetConfirm(
              locale === "it" ? t.messages.italian : t.messages.english,
            )}
          >
            <s-paragraph>
              {t.messages.resetConfirm(locale === "it" ? t.messages.italian : t.messages.english)}
            </s-paragraph>
            <s-button slot="secondary-actions" commandFor={`restore-${locale}`} command="--hide">
              {t.common.cancel}
            </s-button>
            <s-button
              slot="primary-action"
              variant="primary"
              commandFor={`restore-${locale}`}
              command="--hide"
              onClick={() => restore(locale)}
            >
              {t.messages.reset}
            </s-button>
          </s-modal>
        ))}
      </s-page>
    </form>
  );
}
