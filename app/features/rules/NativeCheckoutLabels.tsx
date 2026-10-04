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
        pendingTotal={pendingContexts.length}
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
  pendingTotal,
  guidedConfirmations,
  onEnabledChange,
  submitIntent,
  refreshing,
}: NativeCheckoutLabelsProps & {
  automaticAvailable: boolean;
  displayedContexts: FiscalLabelContext[];
  pendingTotal: number;
}) {
  const copy = texts(locale).rules.labels;
  const confirmed = new Map(
    guidedConfirmations.map(({ slotId, confirmedAt }) => [slotId, confirmedAt]),
  );
  const pendingCount = displayedContexts.filter((context) =>
    context.guidedSlotIds.some((slotId) => !confirmed.has(slotId)),
  ).length;
  // R-B5: il riepilogo conta le etichette di tutte le lingue, non solo di quella selezionata.
  const automaticCount =
    state.mode === "off"
      ? 0
      : (snapshot?.slots.filter(
          (slot) =>
            slot.capability === "automatic" &&
            (slot.name === "taxCode" || slot.name === "pec") &&
            rules[slot.name] !== "unmanaged",
        ).length ?? 0);

  return (
    <s-stack direction="block" gap="base">
      <s-checkbox
        label={automaticAvailable ? copy.enable : copy.enableGuided}
        checked={enabled}
        disabled={busy}
        onChange={(event) => onEnabledChange(event.currentTarget.checked)}
      />
      {state.mode !== "off" && !enabled ? (
        <s-banner tone="warning">{copy.disableWarning}</s-banner>
      ) : null}
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
      {state.mode === "off" && snapshot ? (
        <KeepNativeLabelsChoice
          accepted={state.decision === "accepted"}
          busy={busy}
          copy={copy}
          onAccept={() => submitIntent(RULES_INTENTS.acceptCheckoutLabels)}
        />
      ) : null}
      <div className="checkout-labels-technical">
        <s-stack direction="block" gap="small-200">
          <s-stack direction="block" gap="small-100">
            <s-text color="subdued">
              {copy.mode}: {copy.modeValues[state.mode]}
            </s-text>
            <s-text color="subdued">
              {/* L'ultima lettura reale, anche se restano verifiche manuali (lastSyncAt resta
                  l'ultima sincronizzazione completa, usata per lo stato). */}
              {(state.lastReadAt ?? state.lastSyncAt)
                ? copy.lastSync(
                    formatDateTime((state.lastReadAt ?? state.lastSyncAt)!, locale, timeZone),
                  )
                : copy.neverSynced}
            </s-text>
            <s-text color="subdued">{copy.operationalSummary(automaticCount, pendingTotal)}</s-text>
          </s-stack>
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
        </s-stack>
      </div>
    </s-stack>
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
            <div className="checkout-labels-title">
              <s-text type="strong">{context.label}</s-text>
              {/* R-7: lo stato complessivo sta nel titolo del pannello; qui solo ciò che va
                  verificato. */}
              {pendingSlotIds.length > 0 ? (
                <s-badge tone="warning">{copy.statusManualRequired}</s-badge>
              ) : null}
            </div>
            <div className="checkout-label-context__rows">
              {context.entries.map(({ name, slot }) => {
                const proposed = proposedLabelForSlot(slot, rules);
                const observed = observedLabelForSlot(slot);
                return (
                  <div className="checkout-label-context__row" key={name}>
                    <s-text type="strong">
                      {name === "taxCode" ? translated.taxCodeLabel : translated.pecLabel}
                    </s-text>
                    {proposed && !checkoutLabelValuesMatch(proposed, observed) ? (
                      <s-stack direction="block" gap="small-300">
                        <s-text color="subdued">
                          {copy.current}:{" "}
                          {observed ? quoteLabel(observed, locale) : copy.notAvailable}
                        </s-text>
                        <s-text>
                          {copy.proposed}: {quoteLabel(proposed, locale)}
                        </s-text>
                      </s-stack>
                    ) : (
                      // Decisione del 4 ottobre: senza modifiche il confronto sta su una riga.
                      <s-stack direction="inline" gap="small-200" alignItems="baseline">
                        <s-text>
                          {observed ? quoteLabel(observed, locale) : copy.notAvailable}
                        </s-text>
                        <s-text color="subdued">{copy.noChange}</s-text>
                      </s-stack>
                    )}
                  </div>
                );
              })}
            </div>
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
              <Disclosure
                className="checkout-labels-disclosure checkout-label-instructions"
                summary={<s-text type="strong">{copy.manualHeading}</s-text>}
              >
                <s-stack direction="block" gap="small-200">
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
                  <s-link href={storefrontUrl} target="_blank">
                    {copy.openStorefront}
                  </s-link>
                  <s-link href={checkoutSettingsUrl} target="_blank">
                    {copy.openCheckoutContentEditor}
                  </s-link>
                  {!matchesProposed ? (
                    <s-banner tone="warning">{copy.manualMismatch}</s-banner>
                  ) : null}
                  <s-button
                    disabled={busy || !matchesProposed}
                    onClick={() => onConfirm(pendingSlotIds)}
                  >
                    {copy.confirmGuided}
                  </s-button>
                </s-stack>
              </Disclosure>
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
