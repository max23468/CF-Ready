import type { Rules } from "../../config";
import {
  checkoutLabelValuesMatch,
  observedLabelForSlot,
  proposedLabelForSlot,
  type CheckoutLabelFamily,
  type CheckoutLabelsSnapshot,
  type CheckoutLabelState,
} from "../../checkout-labels/domain";
import { formatDateTime, texts, type Locale } from "../../i18n";
import {
  fiscalLabelContexts,
  latestConfirmation,
  type FiscalLabelContext,
} from "./checkout-labels-presentation";
import { RULES_INTENTS, type SubmitCheckoutLabelsIntent } from "./rules-intents";

type NativeCheckoutLabelsProps = {
  locale: Locale;
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
  const confirmedSlots = new Set(guidedConfirmations.map(({ slotId }) => slotId));
  const pendingContexts = contexts.filter((context) =>
    context.guidedSlotIds.some((slotId) => !confirmedSlots.has(slotId)),
  );
  const keptByMerchant = state.mode === "off" && state.decision === "accepted";
  const needsAttention =
    pendingContexts.length > 0 ||
    Boolean(state.lastErrorCode) ||
    (state.mode === "off" && state.decision === "pending");
  const presentation = nativeLabelsPresentation({
    copy,
    state,
    keptByMerchant,
    pendingCount: pendingContexts.length,
  });

  return (
    <details className="checkout-labels-disclosure">
      <summary className="checkout-labels-disclosure__summary">
        <s-stack direction="inline" alignItems="center" gap="small-200">
          <s-heading>{copy.nativeHeading}</s-heading>
          <s-badge tone={needsAttention ? "warning" : "success"}>{presentation.status}</s-badge>
        </s-stack>
        <s-paragraph color="subdued">{presentation.summary}</s-paragraph>
      </summary>
      <div className="checkout-labels-disclosure__body">
        <NativeLabelsContent
          locale={locale}
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
      </div>
    </details>
  );
}

function NativeLabelsContent({
  locale,
  rules,
  snapshot,
  state,
  enabled,
  busy,
  activeFamily,
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
  const automaticCount = new Set(
    snapshot?.slots.flatMap((slot) =>
      slot.family === activeFamily &&
      slot.capability === "automatic" &&
      (slot.name === "taxCode" || slot.name === "pec") &&
      rules[slot.name] !== "unmanaged"
        ? [slot.name]
        : [],
    ) ?? [],
  ).size;

  return (
    <s-stack direction="block" gap="base">
      <s-checkbox
        label={automaticAvailable ? copy.enable : copy.enableGuided}
        checked={enabled}
        disabled={busy}
        onChange={(event) => onEnabledChange(event.currentTarget.checked)}
      />
      <s-stack direction="inline" gap="small-100" alignItems="center">
        <s-text type="strong">{copy.mode}:</s-text>
        <s-badge tone={state.mode === "off" ? "neutral" : "info"}>
          {copy.modeValues[state.mode]}
        </s-badge>
        <s-text color="subdued">
          {state.lastSyncAt
            ? copy.lastSync(formatDateTime(state.lastSyncAt, locale))
            : copy.neverSynced}
        </s-text>
      </s-stack>
      <s-paragraph>{copy.operationalSummary(automaticCount, pendingCount)}</s-paragraph>
      {snapshot ? (
        <>
          {pendingCount > 0 &&
          snapshot.markets.some(({ resolution }) => resolution === "ambiguous") ? (
            <s-banner tone="warning">{copy.marketAmbiguous}</s-banner>
          ) : null}
          <LabelComparison
            contexts={displayedContexts}
            rules={rules}
            locale={locale}
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
  );
}

function nativeLabelsPresentation({
  copy,
  state,
  keptByMerchant,
  pendingCount,
}: {
  copy: ReturnType<typeof texts>["rules"]["labels"];
  state: CheckoutLabelState;
  keptByMerchant: boolean;
  pendingCount: number;
}) {
  if (state.lastErrorCode) {
    return { status: copy.statusManualRequired, summary: copy.nativeSummaryError };
  }
  if (pendingCount > 0) {
    return {
      status: copy.statusManualRequired,
      summary: copy.nativeSummaryNeedsReview(pendingCount),
    };
  }
  if (keptByMerchant) {
    return { status: copy.statusManagedByShopify, summary: copy.nativeSummaryKept };
  }
  if (state.mode === "off" && state.decision === "pending") {
    return { status: copy.statusManualRequired, summary: copy.nativeSummaryNeedsChoice };
  }
  return { status: copy.statusManagedByShopify, summary: copy.nativeSummaryReady };
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
    <s-badge tone="success">{copy.keepNativeAccepted}</s-badge>
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
  confirmations,
  busy,
  storefrontUrl,
  checkoutSettingsUrl,
  onConfirm,
}: {
  contexts: FiscalLabelContext[];
  rules: Rules;
  locale: Locale;
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
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text type="strong">{context.label}</s-text>
              {pendingSlotIds.length > 0 ? (
                <s-badge tone="warning">{copy.statusManualRequired}</s-badge>
              ) : context.guidedSlotIds.length === 0 ? (
                <s-badge tone="success">{copy.statusManagedByShopify}</s-badge>
              ) : null}
            </s-stack>
            {context.note ? <s-text color="subdued">{context.note}</s-text> : null}
            <div className="checkout-label-context__rows">
              {context.entries.map(({ name, slot }) => {
                const proposed = proposedLabelForSlot(slot, rules);
                const observed = observedLabelForSlot(slot);
                return (
                  <div className="checkout-label-context__row" key={name}>
                    <s-text type="strong">
                      {name === "taxCode" ? translated.taxCodeLabel : translated.pecLabel}
                    </s-text>
                    <s-stack direction="block" gap="small-100">
                      <s-text color="subdued">
                        {copy.current}: {observed ?? copy.notAvailable}
                      </s-text>
                      {proposed && !checkoutLabelValuesMatch(proposed, observed) ? (
                        <s-text>
                          {copy.proposed}: {proposed}
                        </s-text>
                      ) : (
                        <s-text color="subdued">{copy.noChange}</s-text>
                      )}
                    </s-stack>
                  </div>
                );
              })}
            </div>
            {pendingSlotIds.length > 0 ? (
              <details className="checkout-labels-disclosure checkout-label-instructions">
                <summary className="checkout-labels-disclosure__summary">
                  <s-text type="strong">{copy.manualHeading}</s-text>
                </summary>
                <div className="checkout-labels-disclosure__body">
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
                </div>
              </details>
            ) : confirmedAt ? (
              <s-text color="subdued">
                {copy.lastManualVerification(formatDateTime(confirmedAt, locale))}
              </s-text>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
