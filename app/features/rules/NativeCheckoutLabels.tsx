import type { Rules } from "../../config";
import {
  checkoutLabelValuesMatch,
  observedLabelForSlot,
  proposedLabelForSlot,
  type CheckoutLabelFamily,
  type CheckoutLabelsSnapshot,
  type CheckoutLabelState,
} from "../../checkout-labels/domain";
import { localizedError } from "../../app-error";
import { formatDateTime, quoteLabel, texts, type Locale } from "../../i18n";
import {
  fiscalLabelContexts,
  latestConfirmation,
  pendingFiscalLabels,
  type FiscalLabelContext,
} from "./checkout-labels-presentation";
import { RULES_INTENTS, type SubmitCheckoutLabelsIntent } from "./rules-intents";
import { Disclosure } from "../../ui-disclosure";
import { StatusList } from "../../ui-status-list";

export const NATIVE_LABELS_ID = "checkout-native-labels";

type NativeCheckoutLabelsProps = {
  locale: Locale;
  timeZone: string | null;
  rules: Rules;
  snapshot: CheckoutLabelsSnapshot | null;
  state: CheckoutLabelState;
  activeFamily: CheckoutLabelFamily;
  storefrontUrl: string;
  checkoutSettingsUrl: string;
  enabled: boolean;
  busy: boolean;
  onEnabledChange: (value: boolean) => void;
  guidedConfirmations: Array<{ slotId: string; confirmedAt: string }>;
  submitIntent: SubmitCheckoutLabelsIntent;
  refreshing: boolean;
};

export function NativeCheckoutLabels({
  locale,
  timeZone,
  rules,
  snapshot,
  state,
  activeFamily,
  storefrontUrl,
  checkoutSettingsUrl,
  enabled,
  busy,
  onEnabledChange,
  guidedConfirmations,
  submitIntent,
  refreshing,
}: NativeCheckoutLabelsProps) {
  const copy = texts(locale).rules.labels;
  const automaticAvailable = Boolean(
    snapshot?.slots.some(
      (slot) => slot.capability === "automatic" && (slot.name === "taxCode" || slot.name === "pec"),
    ),
  );
  const contexts = snapshot ? fiscalLabelContexts(snapshot, rules, locale) : [];
  const displayedContexts = contexts.filter((context) =>
    context.entries.some(({ slot }) => slot.family === activeFamily),
  );
  const pending = pendingFiscalLabels(contexts, guidedConfirmations);
  const pendingContexts = pending.contexts;
  const keptByMerchant = state.mode === "off" && state.decision === "accepted";
  const needsAttention =
    pendingContexts.length > 0 ||
    Boolean(state.lastErrorCode) ||
    (state.mode === "off" && state.decision === "pending");
  const presentation = nativeLabelsPresentation({
    copy,
    errors: texts(locale).errors,
    state,
    keptByMerchant,
    pendingCount: pendingContexts.length,
    pendingLanguages: pending.families.map((family) => copy.languageNames[family]),
  });

  return (
    <Disclosure
      panel
      className="checkout-labels-disclosure"
      id={NATIVE_LABELS_ID}
      summary={
        <>
          <div className="checkout-labels-title">
            <s-heading>{copy.nativeHeading}</s-heading>
            {/* Una scelta del merchant è neutra, non un successo (come R-B7). */}
            <s-badge tone={needsAttention ? "warning" : keptByMerchant ? "neutral" : "success"}>
              {presentation.status}
            </s-badge>
          </div>
          <s-paragraph color="subdued">{presentation.summary}</s-paragraph>
        </>
      }
    >
      <NativeLabelsContent
        locale={locale}
        timeZone={timeZone}
        rules={rules}
        snapshot={snapshot}
        state={state}
        enabled={enabled}
        busy={busy}
        activeFamily={activeFamily}
        storefrontUrl={storefrontUrl}
        checkoutSettingsUrl={checkoutSettingsUrl}
        automaticAvailable={automaticAvailable}
        displayedContexts={displayedContexts}
        guidedConfirmations={guidedConfirmations}
        onEnabledChange={onEnabledChange}
        submitIntent={submitIntent}
        refreshing={refreshing}
      />
    </Disclosure>
  );
}

function NativeLabelsContent({
  locale,
  timeZone,
  rules,
  snapshot,
  state,
  enabled,
  busy,
  storefrontUrl,
  checkoutSettingsUrl,
  automaticAvailable,
  displayedContexts,
  guidedConfirmations,
  onEnabledChange,
  submitIntent,
  refreshing,
}: NativeCheckoutLabelsProps & {
  automaticAvailable: boolean;
  displayedContexts: FiscalLabelContext[];
}) {
  const copy = texts(locale).rules.labels;
  const confirmed = new Map(
    guidedConfirmations.map(({ slotId, confirmedAt }) => [slotId, confirmedAt]),
  );
  const pendingCount = displayedContexts.filter((context) =>
    context.guidedSlotIds.some((slotId) => !confirmed.has(slotId)),
  ).length;
  return (
    <s-stack direction="block" gap="base">
      {/* R-13: la conseguenza di togliere la gestione sta sotto la casella, senza un banner
          annidato nel pannello che sposta il contenuto. */}
      <s-checkbox
        label={automaticAvailable ? copy.enable : copy.enableGuided}
        details={state.mode !== "off" && !enabled ? copy.disableWarning : undefined}
        checked={enabled}
        disabled={busy}
        onChange={(event) => onEnabledChange(event.currentTarget.checked)}
      />
      {snapshot ? (
        <>
          {pendingCount > 0 &&
          snapshot.markets.some(({ resolution }) => resolution === "ambiguous") ? (
            <s-text color="subdued">{copy.marketAmbiguous}</s-text>
          ) : null}
          <LabelComparison
            contexts={displayedContexts}
            rules={rules}
            locale={locale}
            timeZone={timeZone}
            confirmations={confirmed}
            busy={busy}
            storefrontUrl={storefrontUrl}
            checkoutSettingsUrl={checkoutSettingsUrl}
            onConfirm={(slotIds) => submitIntent(RULES_INTENTS.confirmGuidedLabels, slotIds)}
          />
        </>
      ) : (
        <s-paragraph color="subdued">{copy.noSnapshot}</s-paragraph>
      )}
      <s-divider />
      <NativeLabelsTechnical
        locale={locale}
        timeZone={timeZone}
        rules={rules}
        snapshot={snapshot}
        state={state}
        busy={busy}
        refreshing={refreshing}
        submitIntent={submitIntent}
      />
    </s-stack>
  );
}

function NativeLabelsTechnical({
  locale,
  timeZone,
  rules,
  snapshot,
  state,
  busy,
  refreshing,
  submitIntent,
}: Pick<
  NativeCheckoutLabelsProps,
  "locale" | "timeZone" | "rules" | "snapshot" | "state" | "busy" | "refreshing" | "submitIntent"
>) {
  const copy = texts(locale).rules.labels;
  const lastReadAt = state.lastReadAt ?? state.lastSyncAt;
  // R-B5: conta tutte le lingue, non solo quella selezionata.
  const automaticCount =
    snapshot?.slots.filter(
      (slot) =>
        slot.capability === "automatic" &&
        (slot.name === "taxCode" || slot.name === "pec") &&
        rules[slot.name] !== "unmanaged",
    ).length ?? 0;

  return (
    <>
      {/* R-8: modalità e ultima lettura sono righe etichetta-valore, come nella Home; le azioni
          stanno affiancate a 16 px. Il conteggio delle verifiche manuali è già nel riepilogo. */}
      <div className="checkout-labels-technical">
        <s-stack direction="block" gap="base">
          <StatusList
            rows={[
              {
                key: "mode",
                label: <s-text color="subdued">{copy.mode}</s-text>,
                value: <s-text>{copy.modeValues[state.mode]}</s-text>,
              },
              {
                key: "lastRead",
                label: <s-text color="subdued">{copy.lastReadLabel}</s-text>,
                // L'ultima lettura reale, anche se restano verifiche manuali (lastSyncAt resta
                // l'ultima sincronizzazione completa, usata per lo stato).
                value: (
                  <s-text>
                    {lastReadAt ? formatDateTime(lastReadAt, locale, timeZone) : copy.neverSynced}
                  </s-text>
                ),
              },
              ...(state.mode === "automatic" || state.mode === "partial"
                ? [
                    {
                      key: "automatic",
                      label: <s-text color="subdued">{copy.automaticCountLabel}</s-text>,
                      value: <s-text>{automaticCount}</s-text>,
                    },
                  ]
                : []),
            ]}
          />
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-button
              disabled={busy}
              loading={refreshing}
              onClick={() =>
                submitIntent(RULES_INTENTS.refreshCheckoutLabels, [], {
                  taxCode: rules.taxCode,
                  pec: rules.pec,
                })
              }
            >
              {copy.refresh}
            </s-button>
            {state.mode === "off" && state.decision !== "accepted" && snapshot ? (
              <KeepNativeLabelsChoice
                accepted={false}
                busy={busy}
                copy={copy}
                onAccept={() => submitIntent(RULES_INTENTS.acceptCheckoutLabels)}
              />
            ) : null}
          </s-stack>
        </s-stack>
      </div>
    </>
  );
}

function nativeLabelsPresentation({
  copy,
  errors,
  state,
  keptByMerchant,
  pendingCount,
  pendingLanguages,
}: {
  copy: ReturnType<typeof texts>["rules"]["labels"];
  errors: ReturnType<typeof texts>["errors"];
  state: CheckoutLabelState;
  keptByMerchant: boolean;
  pendingCount: number;
  pendingLanguages: string[];
}) {
  // Un errore salvato non è una verifica manuale: lo si nomina e si dice cosa fare (come R-H4).
  if (state.lastErrorCode && state.lastErrorCode !== "checkout_labels_confirmation_pending") {
    return {
      status: copy.statusError,
      summary: `${copy.nativeSummaryError} ${localizedError(errors, state.lastErrorCode)}`,
    };
  }
  if (pendingCount > 0) {
    return {
      status: copy.statusManualRequired,
      summary: copy.nativeSummaryNeedsReview(pendingCount, pendingLanguages),
    };
  }
  if (keptByMerchant) {
    return { status: copy.statusKept, summary: copy.nativeSummaryKept };
  }
  if (state.mode === "off" && state.decision === "pending") {
    return { status: copy.statusChoiceRequired, summary: copy.nativeSummaryNeedsChoice };
  }
  return { status: copy.statusUpToDate, summary: copy.nativeSummaryReady };
}

export function KeepNativeLabelsChoice({
  accepted,
  busy,
  copy,
  onAccept,
}: {
  accepted: boolean;
  busy: boolean;
  copy: ReturnType<typeof texts>["rules"]["labels"];
  onAccept: () => void;
}) {
  return accepted ? (
    <s-badge tone="neutral">{copy.keepNativeAccepted}</s-badge>
  ) : (
    <s-button disabled={busy} onClick={onAccept}>
      {copy.keepNative}
    </s-button>
  );
}

function LabelComparison({
  contexts,
  rules,
  locale,
  timeZone,
  confirmations,
  busy,
  storefrontUrl,
  checkoutSettingsUrl,
  onConfirm,
}: {
  contexts: FiscalLabelContext[];
  rules: Rules;
  locale: Locale;
  timeZone: string | null;
  confirmations: Map<string, string>;
  busy: boolean;
  storefrontUrl: string;
  checkoutSettingsUrl: string;
  onConfirm: (slotIds: string[]) => void;
}) {
  const copy = texts(locale).rules.labels;
  const translated = texts(locale).rules;

  return (
    <div className="checkout-label-contexts">
      {contexts.map((context) => {
        const pendingSlotIds = context.guidedSlotIds.filter((slotId) => !confirmations.has(slotId));
        const confirmedAt = latestConfirmation(context.guidedSlotIds, confirmations);
        const matchesProposed = context.entries.every(({ slot }) => {
          const proposed = proposedLabelForSlot(slot, rules);
          return (
            proposed === null || checkoutLabelValuesMatch(proposed, observedLabelForSlot(slot))
          );
        });
        return (
          <div className="checkout-label-context" key={context.key}>
            {/* R-7: un solo badge di stato per pannello, nel titolo (Master Plan §15.1). */}
            <s-text type="strong">{context.label}</s-text>
            {/* N-2: tabella nativa, una riga per campo; su mobile diventa un elenco. */}
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">{copy.fieldColumn}</s-table-header>
                <s-table-header>{copy.current}</s-table-header>
                <s-table-header>{copy.proposed}</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {context.entries.map(({ name, slot }) => {
                  const proposed = proposedLabelForSlot(slot, rules);
                  const observed = observedLabelForSlot(slot);
                  return (
                    <s-table-row key={name}>
                      <s-table-cell>
                        {name === "taxCode" ? translated.taxCodeLabel : translated.pecLabel}
                      </s-table-cell>
                      <s-table-cell>
                        {observed ? quoteLabel(observed, locale) : copy.notAvailable}
                      </s-table-cell>
                      <s-table-cell>
                        {proposed && !checkoutLabelValuesMatch(proposed, observed) ? (
                          quoteLabel(proposed, locale)
                        ) : (
                          <s-text color="subdued">{copy.noChange}</s-text>
                        )}
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>
            {context.notes.length > 0 ? (
              <s-stack direction="block" gap="small-100">
                {context.notes.map((note) => (
                  <s-text key={note} color="subdued">
                    {note}
                  </s-text>
                ))}
              </s-stack>
            ) : null}
            {pendingSlotIds.length > 0 ? (
              // R-9: la procedura sta in una modale nativa, non in un disclosure annidato nel
              // pannello; nel pannello restano le due azioni e, se serve, perché la conferma è
              // disattivata.
              <s-stack direction="block" gap="small-200">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-button commandFor={manualModalId(context.key)} command="--show">
                    {copy.manualHeading}
                  </s-button>
                  <s-button
                    disabled={busy || !matchesProposed}
                    onClick={() => onConfirm(pendingSlotIds)}
                  >
                    {copy.confirmGuided}
                  </s-button>
                </s-stack>
                {!matchesProposed ? <s-text color="subdued">{copy.manualMismatch}</s-text> : null}
                <s-modal
                  id={manualModalId(context.key)}
                  heading={copy.manualHeading}
                  accessibilityLabel={copy.manualHeading}
                >
                  <s-stack direction="block" gap="base">
                    <s-ordered-list>
                      {copy
                        .manualSteps(
                          context.language,
                          context.marketName,
                          context.primary,
                          context.verificationMarkets,
                        )
                        .map((step) => (
                          <s-list-item key={step}>{step}</s-list-item>
                        ))}
                    </s-ordered-list>
                    <s-stack direction="inline" gap="base">
                      <s-link href={storefrontUrl} target="_blank">
                        {copy.openStorefront}
                      </s-link>
                      <s-link href={checkoutSettingsUrl} target="_blank">
                        {copy.openCheckoutContentEditor}
                      </s-link>
                    </s-stack>
                  </s-stack>
                  <s-button
                    slot="secondary-actions"
                    commandFor={manualModalId(context.key)}
                    command="--hide"
                  >
                    {copy.close}
                  </s-button>
                </s-modal>
              </s-stack>
            ) : confirmedAt ? (
              <s-text color="subdued">
                {copy.lastManualVerification(formatDateTime(confirmedAt, locale, timeZone))}
              </s-text>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// Le chiavi dei contesti contengono «:» e ID di mercato: l'ID della modale resta un token semplice.
function manualModalId(contextKey: string) {
  return `manual-labels-${contextKey.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}
