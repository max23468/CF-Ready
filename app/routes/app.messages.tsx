import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useSubmit } from "react-router";
import {
  DEFAULT_CONFIG,
  MESSAGE_KEYS,
  MESSAGE_MAX_LENGTH,
  messageAppears,
  readConfig,
} from "../config";
import { validateMessages } from "../config";
import type { CheckoutConfig } from "../config";
import { resolveLocale, texts } from "../i18n";
import type { Locale } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { authenticate } from "../shopify.server";
import {
  findValidation,
  observedConfigHash,
  queryContext,
  writeValidation,
} from "../validation.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
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

  // FR-051: si salvano i messaggi e si conserva tutto il resto, stato della Validation compreso.
  let current;
  try {
    current = readConfig(
      findValidation((await queryContext(admin)).validations.nodes)?.metafield?.jsonValue,
    );
  } catch {
    return { ok: false as const, errorCode: "validation_write_failed" };
  }
  const result = await writeValidation(
    admin,
    context.cloudflare.env.DB,
    session.shop,
    { rules: current.rules, errorDisplay: current.errorDisplay, messages: validated.messages },
    null,
    (form.configHash as string) || null,
  );

  return result.ok ? { ok: true as const } : { ok: false as const, errorCode: result.errorCode };
};

const SAVE_BAR = "cf-ready-messages";

// Polaris non ha un campo che si ridimensiona da solo: `rows` fissa le righe visibili e il
// resto finisce in uno scroll interno. Le righe si calcolano quindi dal testo, così il campo
// cresce e nulla resta nascosto — nemmeno oltre i 200 caratteri, che è proprio il momento in
// cui il merchant deve vedere tutto per decidere cosa tagliare.
// ponytail: stima a 45 caratteri per riga, prudente per le colonne strette. Se Polaris
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
  const [draft, setDraft] = useState<CheckoutConfig["messages"]>(saved.messages);
  // I campi non sono controllati: React che riscrive `value` a ogni tasto farebbe saltare il
  // cursore dentro un testo lungo. Il ripristino li rimonta cambiando chiave, così ripartono
  // dal nuovo valore predefinito senza che React possieda il contenuto.
  const [mounted, setMounted] = useState({ it: 0, en: 0 });

  // Il server trimma i testi: senza riallineare la bozza dopo un salvataggio riuscito, uno
  // spazio finale lascerebbe la Save Bar accesa per sempre.
  useEffect(() => {
    if (!result?.ok) return;
    setDraft(saved.messages);
    setMounted((current) => ({ it: current.it + 1, en: current.en + 1 }));
  }, [result, saved.messages]);

  const dirty = (["it", "en"] as const).some((locale) =>
    MESSAGE_KEYS.some((key) => draft[locale][key] !== saved.messages[locale][key]),
  );

  useEffect(() => {
    if (typeof shopify === "undefined") return;
    void (dirty ? shopify.saveBar.show(SAVE_BAR) : shopify.saveBar.hide(SAVE_BAR));
  }, [dirty]);

  // Un solo ascoltatore per la pagina: gli eventi dei componenti Polaris risalgono fino al
  // modulo, come già in Regole checkout.
  const readDraft = (event: { target: EventTarget | null }) => {
    const field = event.target as { name?: string; value?: string } | null;
    const [locale, key] = (field?.name ?? "").split(".");
    if (locale !== "it" && locale !== "en") return;
    if (!(MESSAGE_KEYS as readonly string[]).includes(key)) return;
    setDraft((current) => ({
      ...current,
      [locale]: { ...current[locale], [key]: field?.value ?? "" },
    }));
  };

  const discard = () => {
    setDraft(saved.messages);
    setMounted((current) => ({ it: current.it + 1, en: current.en + 1 }));
  };

  const save = () =>
    send(
      {
        configHash: saved.configHash ?? "",
        ...Object.fromEntries(
          (["it", "en"] as const).flatMap((locale) =>
            MESSAGE_KEYS.map((key) => [`${locale}.${key}`, draft[locale][key]] as const),
          ),
        ),
      },
      { method: "post" },
    );

  // FR-063: il ripristino agisce su una lingua sola e lo dichiara nella conferma. Non salva da
  // sé: rimette i testi predefiniti nei campi e il salvataggio resta un gesto esplicito.
  const restore = (locale: Locale) => {
    setDraft((current) => ({ ...current, [locale]: { ...DEFAULT_CONFIG.messages[locale] } }));
    setMounted((current) => ({ ...current, [locale]: current[locale] + 1 }));
  };

  return (
    <form onInput={readDraft} onChange={readDraft}>
      <s-page heading={t.messages.heading}>
        {result?.ok ? <s-banner tone="success">{t.common.saved}</s-banner> : null}
        {result && !result.ok && "errorCode" in result ? (
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

        {/* L'introduzione non è una sezione, quindi non riceve la spaziatura che `s-page` dà
            alle card: la distanza dal primo box va dichiarata qui. */}
        <s-box paddingBlockEnd="base">
          <s-paragraph>{t.messages.intro}</s-paragraph>
        </s-box>

        {/* D-069 prevedeva due tab, ma Polaris non ha un componente tab e costruirlo a mano
              significherebbe reimplementarne l'accessibilità (§8.1). Le due lingue restano quindi
              entrambe visibili, il che soddisfa anche §8.9: nessun errore può nascondersi dietro
              una scheda chiusa. */}
        {(["it", "en"] as const).map((locale) => (
          <s-section
            key={locale}
            heading={locale === "it" ? t.messages.italian : t.messages.english}
          >
            <s-stack direction="block" gap="base">
              {MESSAGE_KEYS.map((key) => {
                const value = draft[locale][key];
                const problem =
                  result && !result.ok && "problem" in result ? result.problem : undefined;
                // §8.7: il contatore non è punitivo prima del limite. Il campo vuoto viene
                // segnalato solo dopo un salvataggio rifiutato, non mentre si cancella per
                // riscrivere.
                const invalid =
                  value.length > MESSAGE_MAX_LENGTH
                    ? t.messages.tooLong
                    : problem?.locale === locale && problem.key === key
                      ? t.messages.empty
                      : undefined;

                return (
                  <s-text-area
                    key={`${key}-${mounted[locale]}`}
                    label={t.messages[key]}
                    name={`${locale}.${key}`}
                    rows={rowsFor(value)}
                    defaultValue={value}
                    details={t.messages.counter(value.length)}
                    error={invalid}
                  />
                );
              })}
              <s-button commandFor={`restore-${locale}`} command="--show">
                {t.messages.reset}
              </s-button>
            </s-stack>
          </s-section>
        ))}

        {/* §15.5 chiede un esempio testuale, non un mockup. Ripetere qui le stesse frasi che
            stanno nei campi a sinistra non aggiungeva nulla: questo riquadro dice invece quali
            messaggi il cliente può davvero incontrare con le regole attive, che da questa pagina
            non si potrebbe sapere. */}
        <s-section slot="aside" heading={t.messages.appearHeading}>
          <s-stack direction="block" gap="small-100">
            <s-paragraph>{t.messages.appearIntro}</s-paragraph>
            {MESSAGE_KEYS.map((key) => (
              <s-stack key={key} direction="inline" gap="small-100" alignItems="center">
                <s-text>{t.messages[key]}</s-text>
                <s-badge>
                  {messageAppears(saved.rules, key) ? t.messages.appears : t.messages.appearsNot}
                </s-badge>
              </s-stack>
            ))}
            <s-link href="/app/rules">{t.nav.rules}</s-link>
          </s-stack>
        </s-section>

        {(["it", "en"] as const).map((locale) => (
          <s-modal key={locale} id={`restore-${locale}`} heading={t.messages.reset}>
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
