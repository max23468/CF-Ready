import { useEffect, useRef } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunction,
} from "react-router";
import { data, useActionData, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { localizedError } from "../app-error";
import { checkoutLabelCopy, observedLabelForSlot } from "../checkout-labels/domain";
import type { CheckoutLabelsSnapshot } from "../checkout-labels/domain";
import { authenticateAdminTimed } from "../admin-auth.server";
import { MESSAGE_KEYS, MESSAGE_MAX_LENGTH, messageAppears, readConfig } from "../config";
import { validateMessages } from "../config";
import type { CheckoutConfig } from "../config";
import { databaseContext } from "../context.server";
import { ConfigConflict } from "../features/ConfigConflict";
import {
  CheckoutErrorPreview,
  CustomerMessagesPreview,
} from "../features/messages/CustomerMessagesPreview";
import { UncontrolledMessageTextArea } from "../features/messages/UncontrolledMessageTextArea";
import { RULES_INTENTS, type CheckoutLabelsLoadAction } from "../features/rules/rules-intents";
import { resolveLocale, texts } from "../i18n";
import type { Locale } from "../i18n";
import { skipRevalidationWhenLeaving, useSavedData } from "../revalidation";
import { MESSAGES_SAVE_BAR, useMessagesDraft } from "../features/messages/use-messages-draft";
import { RevealBanner } from "../ui/ui-feedback";
import { PageWithAside } from "../ui/ui-page";
import { createServerTiming } from "../server-timing.server";
import {
  findValidation,
  observedConfigHash,
  queryContext,
  writeValidation,
} from "../validation.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const timing = createServerTiming();
  const { admin } = await authenticateAdminTimed(request, context, timing);
  const validation = findValidation(
    (await timing.measure("shopify_context", () => queryContext(admin))).validations.nodes,
  );
  const config = readConfig(validation?.metafield?.jsonValue);

  return data(
    {
      locale: resolveLocale(request),
      configHash: await observedConfigHash(validation),
      messages: config.messages,
      rules: config.rules,
      labelSnapshot: null,
    },
    { headers: { "Server-Timing": timing.header() } },
  );
};

export const headers: HeadersFunction = (args) => boundary.headers(args);

export const shouldRevalidate: ShouldRevalidateFunction = (args) => {
  if (args.actionResult && typeof args.actionResult === "object" && "loaded" in args.actionResult) {
    return false;
  }
  return skipRevalidationWhenLeaving(args);
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const timing = createServerTiming();
  const { admin, session } = await authenticateAdminTimed(request, context, timing);
  const form = Object.fromEntries(await request.formData());
  const validated = validateMessages(form);
  if ("problem" in validated)
    return data(
      { ok: false as const, problem: validated.problem },
      { headers: { "Server-Timing": timing.header() } },
    );

  // FR-051: si salvano i messaggi e il percorso condiviso conserva il resto della
  // configurazione osservata sotto la stessa lease usata per la scrittura.
  const result = await writeValidation(
    admin,
    context.get(databaseContext),
    session.shop,
    { messages: validated.messages },
    null,
    (form.configHash as string) || null,
    undefined,
    timing,
  );

  return data(
    result.ok
      ? { ok: true as const, saved: result.saved }
      : { ok: false as const, errorCode: result.errorCode },
    {
      headers: { "Server-Timing": timing.header() },
    },
  );
};

type MessageKey = (typeof MESSAGE_KEYS)[number];
const MESSAGE_GROUPS = [
  ["taxCode", ["taxCodeRequired", "taxCodeInvalid"]],
  ["pec", ["pecRequired", "pecInvalid"]],
] as const satisfies readonly (readonly ["taxCode" | "pec", readonly MessageKey[]])[];

// Altezza iniziale, compresi ritorni a capo e righe vuote. Il componente la adatta poi
// all'andata a capo reale del textarea e alla larghezza disponibile.
function rowsFor(text: string) {
  return Math.max(
    2,
    text
      .split(/\r\n|\r|\n/)
      .reduce((rows, line) => rows + Math.max(1, Math.ceil((line.length + 1) / 45)), 0),
  );
}

export default function CustomerMessages() {
  const loaded = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const saved = useSavedData(loaded, result?.ok ? result.saved : undefined);
  const labelsFetcher = useFetcher<CheckoutLabelsLoadAction>();
  const labelLoadStarted = useRef(false);
  const {
    draft,
    busy,
    conflict,
    errorCode,
    problem,
    activeLocale,
    setActiveLocale,
    selectedKey,
    setSelectedKey,
    mounted,
    readDraft,
    save,
    discard,
    reapply,
    restore,
  } = useMessagesDraft(saved, result);
  const t = texts(saved.locale);

  useEffect(() => {
    if (saved.labelSnapshot || labelLoadStarted.current) return;
    labelLoadStarted.current = true;
    labelsFetcher.submit(
      {
        intent: RULES_INTENTS.loadCheckoutLabels,
        taxCode: saved.rules.taxCode,
        pec: saved.rules.pec,
      },
      { method: "post", action: "/app/rules" },
    );
  }, [labelsFetcher, saved.labelSnapshot, saved.rules]);

  const labelSnapshot =
    (labelsFetcher.data?.ok ? labelsFetcher.data.loaded.snapshot : null) ?? saved.labelSnapshot;
  // NP-4: senza lettura salvata, finché Shopify non risponde l'etichetta è solo provvisoria.
  const labelsPending = !saved.labelSnapshot && !labelsFetcher.data;
  // N-1: l'etichetta è la label del campo d'esempio, come nel checkout, quindi senza virgolette.
  const fieldLabelFor = (key: MessageKey) => ({
    ...messageFieldLabel(t, saved.rules, activeLocale, key, labelSnapshot),
    pending: labelsPending,
  });

  return (
    <form className="customer-messages-page" onInput={readDraft}>
      <PageWithAside
        heading={t.messages.heading}
        // L'anteprima dell'editor mostra il testo selezionato; questo riquadro aggiunge invece
        // l'informazione che manca all'editor: quali messaggi sono pertinenti alle regole
        // correnti e possono quindi comparire quando il controllo è attivo.
        aside={<MessageVisibilityAside t={t} rules={saved.rules} />}
      >
        {conflict ? (
          <ConfigConflict
            locale={saved.locale}
            busy={busy}
            onReapply={reapply}
            onDiscard={discard}
            rows={(["it", "en"] as const).flatMap((locale) =>
              MESSAGE_KEYS.map((key) => ({
                label: `${t.messages[key]} (${t.rules.labels.languageNames[locale]})`,
                current: saved.messages[locale][key],
                draft: draft[locale][key],
              })),
            )}
          />
        ) : null}
        {errorCode && (errorCode !== "config_conflict" || conflict) ? (
          <RevealBanner tone="critical">{localizedError(t.errors, errorCode)}</RevealBanner>
        ) : null}

        <ui-save-bar id={MESSAGES_SAVE_BAR}>
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

        <MessagesEditor
          t={t}
          activeLocale={activeLocale}
          setActiveLocale={setActiveLocale}
          fieldLabelFor={fieldLabelFor}
          draft={draft}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          rules={saved.rules}
          mounted={mounted}
          problem={problem}
        />

        <RestoreMessageModals t={t} restore={restore} />
      </PageWithAside>
    </form>
  );
}

type MessagesCopy = ReturnType<typeof texts>;
type MessagesData = ReturnType<typeof useLoaderData<typeof loader>>;

function MessagesEditor({
  t,
  activeLocale,
  setActiveLocale,
  fieldLabelFor,
  draft,
  selectedKey,
  setSelectedKey,
  rules,
  mounted,
  problem,
}: {
  t: MessagesCopy;
  activeLocale: Locale;
  setActiveLocale: (locale: Locale) => void;
  fieldLabelFor: (key: MessageKey) => { label: string; observed: boolean; pending: boolean };
  draft: CheckoutConfig["messages"];
  selectedKey: MessageKey;
  setSelectedKey: (key: MessageKey) => void;
  rules: CheckoutConfig["rules"];
  mounted: Record<string, number>;
  problem: { locale: Locale; key: MessageKey } | undefined;
}) {
  const previewField = fieldLabelFor(selectedKey);
  return (
    <div className="customer-messages-editor">
      <s-section heading={t.messages.editorHeading}>
        <s-stack direction="block" gap="base">
          <s-link href="/app/rules">{t.messages.manageLabels}</s-link>
          <s-select
            label={t.messages.languageSelector}
            value={activeLocale}
            onChange={(event) => setActiveLocale(event.currentTarget.value as Locale)}
          >
            <s-option value="it">{t.messages.italian}</s-option>
            <s-option value="en">{t.messages.english}</s-option>
          </s-select>
          <s-paragraph color="subdued">{t.messages.previewHint}</s-paragraph>
          <CustomerMessagesPreview
            activeLocale={activeLocale}
            fieldLabel={previewField.label}
            fieldLabelHeading={
              previewField.pending
                ? undefined
                : previewField.observed
                  ? t.messages.previewCurrentFieldLabel
                  : t.messages.previewProposedFieldLabel
            }
            heading={t.messages.previewHeading}
            message={draft[activeLocale][selectedKey]}
            selectedLabel={t.messages[selectedKey]}
          />
          {/* M2: su desktop i quattro campi stanno in due colonne, Codice Fiscale e PEC, così
            restano vicini all'anteprima. Il contatore è sempre presente: al focus nulla si sposta (M4). */}
          <div className="customer-messages-fields">
            <s-query-container>
              <s-grid
                gridTemplateColumns="@container (inline-size > 560px) 1fr 1fr, 1fr"
                gap="base"
                alignItems="start"
              >
                {MESSAGE_GROUPS.map(([field, keys]) => (
                  <s-stack key={field} direction="block" gap="base">
                    {keys.map((key) => {
                      const value = draft[activeLocale][key];
                      const invalid =
                        value.length > MESSAGE_MAX_LENGTH
                          ? t.messages.tooLong
                          : problem?.locale === activeLocale && problem.key === key
                            ? t.messages.empty
                            : undefined;
                      return (
                        <s-stack key={key} direction="block" gap="small-100">
                          <UncontrolledMessageTextArea
                            key={`${activeLocale}-${mounted[`${activeLocale}.${key}`] ?? 0}`}
                            initialValue={value}
                            label={t.messages[key]}
                            name={`${activeLocale}.${key}`}
                            rows={rowsFor(value)}
                            details={t.messages.counter(value.length)}
                            error={invalid}
                            onFocus={() => setSelectedKey(key)}
                          />
                          {!messageAppears(rules, key) ? (
                            <div className="customer-messages-unavailable">
                              <s-text color="subdued">{t.messages.notExpected}</s-text>
                            </div>
                          ) : null}
                          <div className="customer-messages-preview__local">
                            <s-box background="subdued" borderRadius="base" padding="base">
                              <s-stack direction="block" gap="small-100">
                                {!fieldLabelFor(key).pending ? (
                                  <s-text color="subdued">
                                    {fieldLabelFor(key).observed
                                      ? t.messages.previewCurrentFieldLabel
                                      : t.messages.previewProposedFieldLabel}
                                  </s-text>
                                ) : null}
                                <CheckoutErrorPreview
                                  locale={activeLocale}
                                  label={fieldLabelFor(key).label}
                                  message={value}
                                />
                              </s-stack>
                            </s-box>
                          </div>
                        </s-stack>
                      );
                    })}
                  </s-stack>
                ))}
              </s-grid>
            </s-query-container>
          </div>
          <s-button commandFor={`restore-${activeLocale}`} command="--show">
            {t.messages.reset}
          </s-button>
        </s-stack>
      </s-section>
    </div>
  );
}

function MessageVisibilityAside({ t, rules }: { t: MessagesCopy; rules: MessagesData["rules"] }) {
  return (
    <s-section heading={t.messages.appearHeading}>
      <s-stack direction="block" gap="base">
        <s-paragraph>{t.messages.appearIntro}</s-paragraph>
        {[true, false].map((appears) => {
          const keys = MESSAGE_KEYS.filter((key) => messageAppears(rules, key) === appears);
          return keys.length > 0 ? (
            <s-stack key={String(appears)} direction="block" gap="small-100">
              <s-heading>{appears ? t.messages.appears : t.messages.appearsNot}</s-heading>
              <s-unordered-list>
                {keys.map((key) => (
                  <s-list-item key={key}>{t.messages[key]}</s-list-item>
                ))}
              </s-unordered-list>
            </s-stack>
          ) : null;
        })}
        <s-link href="/app/rules">{t.nav.rules}</s-link>
      </s-stack>
    </s-section>
  );
}

function RestoreMessageModals({
  t,
  restore,
}: {
  t: MessagesCopy;
  restore: (locale: Locale) => void;
}) {
  return (["it", "en"] as const).map((locale) => {
    // M8: dentro la frase la lingua è un nome comune ("in inglese"), non la voce della select.
    const language = t.rules.labels.languageNames[locale];
    return (
      <s-modal
        key={locale}
        id={`restore-${locale}`}
        heading={t.messages.reset}
        accessibilityLabel={t.messages.resetConfirm(language)}
      >
        <s-paragraph>{t.messages.resetConfirm(language)}</s-paragraph>
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
    );
  });
}

function messageFieldLabel(
  t: ReturnType<typeof texts>,
  rules: CheckoutConfig["rules"],
  locale: Locale,
  key: MessageKey,
  snapshot: CheckoutLabelsSnapshot | null,
) {
  const field = key.startsWith("taxCode") ? "taxCode" : "pec";
  const matching = snapshot?.slots.filter(
    (slot) => slot.name === field && slot.family === locale && slot.marketId === null,
  );
  const observed =
    matching?.find((slot) => slot.kind === "source") ??
    matching?.find((slot) => slot.kind === "global_translation");
  return observed
    ? { label: observedLabelForSlot(observed), observed: true }
    : {
        label: checkoutLabelCopy(field, locale, rules[field]) ?? t.rules[`${field}Label`],
        observed: false,
      };
}
