import { useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { localizedError } from "../../app-error";
import type { Rules } from "../../config";
import {
  CHECKOUT_LABEL_OPTIONAL_SCOPES,
  checkoutLabelCopy,
  checkoutLabelSlotId,
  observedLabelForSlot,
  proposedLabelForSlot,
  type CheckoutLabelSlot,
  type CheckoutLabelsSnapshot,
  type CheckoutLabelState,
} from "../../checkout-labels/domain";
import { texts, type Locale } from "../../i18n";

type LabelsAction = { ok: true } | { ok: false; errorCode: string } | undefined;
type FiscalLabelContext = {
  key: string;
  label: string;
  note: string | null;
  entries: { name: "taxCode" | "pec"; slot: CheckoutLabelSlot }[];
  guidedSlotIds: string[];
};
type CheckoutLabelsSectionProps = {
  locale: Locale;
  rules: Rules;
  scopeGranted: boolean;
  snapshot: CheckoutLabelsSnapshot | null;
  state: CheckoutLabelState;
  loadErrorCode: string | null;
  confirmedGuidedSlotIds: string[];
  enabled: boolean;
  busy: boolean;
  checkoutSettingsUrl: string;
  onEnabledChange: (value: boolean) => void;
};

export function CheckoutLabelsSection({
  locale,
  rules,
  scopeGranted,
  snapshot,
  state,
  loadErrorCode,
  confirmedGuidedSlotIds,
  enabled,
  busy,
  checkoutSettingsUrl,
  onEnabledChange,
}: CheckoutLabelsSectionProps) {
  const t = texts(locale);
  const copy = t.rules.labels;
  const fetcher = useFetcher<LabelsAction>();
  const revalidator = useRevalidator();
  const [scopeRequestBusy, setScopeRequestBusy] = useState(false);
  const [scopeRequestError, setScopeRequestError] = useState<string | null>(null);
  const actionBusy = fetcher.state !== "idle";
  const actionError = fetcher.data?.ok === false ? fetcher.data.errorCode : null;
  const submitIntent = (intent: string, slotIds: string[] = []) => {
    const form = new FormData();
    form.set("intent", intent);
    form.set("labelsRevision", snapshot?.revision ?? "");
    for (const slotId of slotIds) form.append("slotId", slotId);
    fetcher.submit(form, { method: "post" });
  };
  const requestPermissions = async () => {
    setScopeRequestBusy(true);
    setScopeRequestError(null);
    try {
      const response = await shopify.scopes.request([...CHECKOUT_LABEL_OPTIONAL_SCOPES]);
      if (response.result === "granted-all") revalidator.revalidate();
    } catch {
      setScopeRequestError("generic");
    } finally {
      setScopeRequestBusy(false);
    }
  };

  return (
    <s-section heading={copy.heading}>
      <s-stack direction="block" gap="base">
        <s-paragraph>{copy.intro}</s-paragraph>
        {actionError || scopeRequestError ? (
          <s-banner tone="critical">
            {localizedError(t.errors, actionError ?? scopeRequestError)}
          </s-banner>
        ) : null}
        {loadErrorCode ? (
          <s-banner tone="warning">{localizedError(t.errors, loadErrorCode)}</s-banner>
        ) : null}

        <NativeCheckoutLabels
          key={`native:${snapshot?.revision ?? "none"}`}
          locale={locale}
          rules={rules}
          scopeGranted={scopeGranted}
          snapshot={snapshot}
          state={state}
          enabled={enabled}
          busy={busy || actionBusy || scopeRequestBusy}
          onEnabledChange={onEnabledChange}
          confirmedGuidedSlotIds={confirmedGuidedSlotIds}
          submitIntent={submitIntent}
          requestPermissions={requestPermissions}
        />
        <Address2CheckoutLabels
          key={`address2:${snapshot?.revision ?? "none"}`}
          locale={locale}
          rules={rules}
          scopeGranted={scopeGranted}
          snapshot={snapshot}
          busy={busy || actionBusy}
          checkoutSettingsUrl={checkoutSettingsUrl}
          submitIntent={submitIntent}
        />
      </s-stack>
    </s-section>
  );
}

function NativeCheckoutLabels({
  locale,
  rules,
  scopeGranted,
  snapshot,
  state,
  enabled,
  busy,
  onEnabledChange,
  confirmedGuidedSlotIds,
  submitIntent,
  requestPermissions,
}: Pick<
  CheckoutLabelsSectionProps,
  | "locale"
  | "rules"
  | "scopeGranted"
  | "snapshot"
  | "state"
  | "enabled"
  | "busy"
  | "onEnabledChange"
  | "confirmedGuidedSlotIds"
> & {
  submitIntent: (intent: string, slotIds?: string[]) => void;
  requestPermissions: () => Promise<void>;
}) {
  const copy = texts(locale).rules.labels;
  const [selectedContexts, setSelectedContexts] = useState<string[]>([]);
  const automaticAvailable = Boolean(
    snapshot?.slots.some(
      (slot) => slot.capability === "automatic" && (slot.name === "taxCode" || slot.name === "pec"),
    ),
  );
  const contexts = snapshot ? fiscalLabelContexts(snapshot, rules, locale) : [];
  const confirmedSlots = new Set(confirmedGuidedSlotIds);
  const pendingContexts = contexts.filter((context) =>
    context.guidedSlotIds.some((slotId) => !confirmedSlots.has(slotId)),
  );
  const keptByMerchant = state.mode === "off" && state.decision === "accepted";
  const needsAttention =
    (!scopeGranted && !keptByMerchant) ||
    pendingContexts.length > 0 ||
    Boolean(state.lastErrorCode) ||
    (state.mode === "off" && state.decision === "pending");
  const selectedSlotIds = selectedGuidedSlotIds(
    pendingContexts,
    new Set(selectedContexts),
    confirmedSlots,
  );
  const presentation = nativeLabelsPresentation({
    copy,
    state,
    scopeGranted,
    keptByMerchant,
    needsAttention,
    pendingCount: pendingContexts.length,
  });

  return (
    <details className="checkout-labels-disclosure" open={needsAttention || undefined}>
      <summary className="checkout-labels-disclosure__summary">
        <s-stack direction="inline" alignItems="center" gap="small-200">
          <s-heading>{copy.nativeHeading}</s-heading>
          <s-badge tone={needsAttention ? "warning" : "success"}>{presentation.status}</s-badge>
        </s-stack>
        <s-paragraph color="subdued">{presentation.summary}</s-paragraph>
      </summary>
      <div className="checkout-labels-disclosure__body">
        {!scopeGranted ? (
          <NativeLabelsPermissionPrompt
            locale={locale}
            rules={rules}
            state={state}
            busy={busy}
            requestPermissions={requestPermissions}
            onKeep={() => submitIntent("accept_checkout_labels")}
          />
        ) : (
          <NativeLabelsGrantedContent
            locale={locale}
            rules={rules}
            snapshot={snapshot}
            state={state}
            enabled={enabled}
            busy={busy}
            automaticAvailable={automaticAvailable}
            pendingContexts={pendingContexts}
            selectedContexts={selectedContexts}
            selectedSlotIds={selectedSlotIds}
            confirmedGuidedSlotIds={confirmedGuidedSlotIds}
            onEnabledChange={onEnabledChange}
            onContextSelectionChange={(contextKey, selected) =>
              setSelectedContexts((current) => toggleSelection(current, contextKey, selected))
            }
            submitIntent={submitIntent}
          />
        )}
      </div>
    </details>
  );
}

function NativeLabelsPermissionPrompt({
  locale,
  rules,
  state,
  busy,
  requestPermissions,
  onKeep,
}: Pick<CheckoutLabelsSectionProps, "locale" | "rules" | "state" | "busy"> & {
  requestPermissions: () => Promise<void>;
  onKeep: () => void;
}) {
  const copy = texts(locale).rules.labels;
  return (
    <s-box background="subdued" borderRadius="base" padding="base">
      <s-stack direction="block" gap="small-200">
        <s-text type="strong">{copy.permissionsHeading}</s-text>
        <s-paragraph>{copy.permissionsBody}</s-paragraph>
        <ProposedLabels rules={rules} locale={locale} />
        <s-button variant="primary" disabled={busy} onClick={requestPermissions}>
          {copy.requestPermissions}
        </s-button>
        <KeepNativeLabelsChoice
          accepted={state.decision === "accepted"}
          busy={busy}
          copy={copy}
          onAccept={onKeep}
        />
      </s-stack>
    </s-box>
  );
}

function NativeLabelsGrantedContent({
  locale,
  rules,
  snapshot,
  state,
  enabled,
  busy,
  automaticAvailable,
  pendingContexts,
  selectedContexts,
  selectedSlotIds,
  confirmedGuidedSlotIds,
  onEnabledChange,
  onContextSelectionChange,
  submitIntent,
}: Pick<
  CheckoutLabelsSectionProps,
  | "locale"
  | "rules"
  | "snapshot"
  | "state"
  | "enabled"
  | "busy"
  | "confirmedGuidedSlotIds"
  | "onEnabledChange"
> & {
  automaticAvailable: boolean;
  pendingContexts: FiscalLabelContext[];
  selectedContexts: string[];
  selectedSlotIds: string[];
  onContextSelectionChange: (contextKey: string, selected: boolean) => void;
  submitIntent: (intent: string, slotIds?: string[]) => void;
}) {
  const copy = texts(locale).rules.labels;
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
            ? copy.lastSync(formatTimestamp(state.lastSyncAt, locale))
            : copy.neverSynced}
        </s-text>
      </s-stack>
      {snapshot ? (
        <>
          <MarketResolutionWarning snapshot={snapshot} message={copy.marketAmbiguous} />
          <LabelComparison
            snapshot={snapshot}
            rules={rules}
            locale={locale}
            confirmedGuidedSlotIds={confirmedGuidedSlotIds}
            selectedContextKeys={selectedContexts}
            onContextSelectionChange={onContextSelectionChange}
          />
        </>
      ) : (
        <s-paragraph color="subdued">{copy.noSnapshot}</s-paragraph>
      )}
      {pendingContexts.length > 0 ? (
        <s-paragraph color="subdued">{copy.realCheckout}</s-paragraph>
      ) : null}
      {selectedSlotIds.length > 0 ? (
        <s-button
          disabled={busy}
          onClick={() => submitIntent("confirm_guided_labels", selectedSlotIds)}
        >
          {copy.confirmGuided}
        </s-button>
      ) : null}
      <KeepNativeLabelsDecision
        state={state}
        snapshot={snapshot}
        busy={busy}
        copy={copy}
        onAccept={() => submitIntent("accept_checkout_labels")}
      />
      <s-button disabled={busy} href="">
        {copy.refresh}
      </s-button>
    </s-stack>
  );
}

function MarketResolutionWarning({
  snapshot,
  message,
}: {
  snapshot: CheckoutLabelsSnapshot;
  message: string;
}) {
  return snapshot.markets.some(({ resolution }) => resolution === "ambiguous") ? (
    <s-banner tone="warning">{message}</s-banner>
  ) : null;
}

function nativeLabelsPresentation({
  copy,
  state,
  scopeGranted,
  keptByMerchant,
  needsAttention,
  pendingCount,
}: {
  copy: ReturnType<typeof texts>["rules"]["labels"];
  state: CheckoutLabelState;
  scopeGranted: boolean;
  keptByMerchant: boolean;
  needsAttention: boolean;
  pendingCount: number;
}) {
  if (state.lastErrorCode) {
    return { status: copy.statusNeedsReview, summary: copy.nativeSummaryError };
  }
  if (pendingCount > 0) {
    return {
      status: copy.statusNeedsReview,
      summary: copy.nativeSummaryNeedsReview(pendingCount),
    };
  }
  if (keptByMerchant) {
    return { status: copy.statusKept, summary: copy.nativeSummaryKept };
  }
  if (!scopeGranted) {
    return { status: copy.statusNeedsAccess, summary: copy.nativeSummaryNeedsAccess };
  }
  if (state.mode === "off" && state.decision === "pending") {
    return { status: copy.statusNeedsReview, summary: copy.nativeSummaryNeedsChoice };
  }
  return {
    status: needsAttention ? copy.statusNeedsReview : copy.statusReady,
    summary: copy.nativeSummaryReady,
  };
}

function KeepNativeLabelsChoice({
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

function KeepNativeLabelsDecision({
  state,
  snapshot,
  busy,
  copy,
  onAccept,
}: {
  state: CheckoutLabelState;
  snapshot: CheckoutLabelsSnapshot | null;
  busy: boolean;
  copy: ReturnType<typeof texts>["rules"]["labels"];
  onAccept: () => void;
}) {
  if (state.mode !== "off" || !snapshot) return null;
  return (
    <KeepNativeLabelsChoice
      accepted={state.decision === "accepted"}
      busy={busy}
      copy={copy}
      onAccept={onAccept}
    />
  );
}

function Address2CheckoutLabels({
  locale,
  rules,
  scopeGranted,
  snapshot,
  busy,
  checkoutSettingsUrl,
  submitIntent,
}: Pick<
  CheckoutLabelsSectionProps,
  "locale" | "rules" | "scopeGranted" | "snapshot" | "busy" | "checkoutSettingsUrl"
> & { submitIntent: (intent: string, slotIds?: string[]) => void }) {
  const copy = texts(locale).rules.labels;
  const classification = snapshot?.address2.classification ?? "unknown";
  const restorableSlots = snapshot ? restorableAddressSlots(snapshot, rules) : [];
  const sourceRequiresManualRestore = snapshot?.slots.some(
    (slot) =>
      (slot.name === "address2" || slot.name === "optionalAddress2") &&
      slot.kind === "source" &&
      slot.currentValue !== proposedLabelForSlot(slot, rules),
  );
  const needsAttention = scopeGranted && classification !== "expected";

  return (
    <details className="checkout-labels-disclosure" open={needsAttention || undefined}>
      <summary className="checkout-labels-disclosure__summary">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-heading>{copy.addressHeading}</s-heading>
          <s-badge tone={addressTone(classification)}>{copy.addressStatus[classification]}</s-badge>
        </s-stack>
        <s-paragraph color="subdued">{copy.addressSummary[classification]}</s-paragraph>
      </summary>
      <div className="checkout-labels-disclosure__body">
        <s-stack direction="block" gap="base">
          {scopeGranted ? (
            <s-paragraph color="subdued">{copy.addressLimit}</s-paragraph>
          ) : (
            <s-paragraph color="subdued">{copy.noSnapshot}</s-paragraph>
          )}
          {snapshot ? <Address2Comparison snapshot={snapshot} locale={locale} /> : null}
          {sourceRequiresManualRestore ? (
            <s-banner tone="warning">{copy.sourceManual}</s-banner>
          ) : null}
          <s-stack direction="inline" gap="small-200">
            {scopeGranted && snapshot && restorableSlots.length > 0 ? (
              <s-button
                disabled={busy}
                onClick={() => {
                  if (window.confirm(copy.restoreAddressConfirm)) {
                    submitIntent(
                      "restore_address2_labels",
                      restorableSlots.map((slot) => checkoutLabelSlotId(slot)),
                    );
                  }
                }}
              >
                {copy.restoreAddress}
              </s-button>
            ) : null}
            {scopeGranted &&
            (classification === "fiscal_conflict" || classification === "nonstandard") ? (
              <s-button disabled={busy} onClick={() => submitIntent("accept_address2_labels")}>
                {copy.keepAddress}
              </s-button>
            ) : null}
            <s-link href={checkoutSettingsUrl} target="_top">
              {copy.openCheckout}
            </s-link>
          </s-stack>
        </s-stack>
      </div>
    </details>
  );
}

function LabelComparison({
  snapshot,
  rules,
  locale,
  confirmedGuidedSlotIds,
  selectedContextKeys,
  onContextSelectionChange,
}: {
  snapshot: CheckoutLabelsSnapshot;
  rules: Rules;
  locale: Locale;
  confirmedGuidedSlotIds: string[];
  selectedContextKeys: string[];
  onContextSelectionChange: (contextKey: string, selected: boolean) => void;
}) {
  const copy = texts(locale).rules.labels;
  const translated = texts(locale).rules;
  const contexts = fiscalLabelContexts(snapshot, rules, locale);
  const confirmedGuidedSlots = new Set(confirmedGuidedSlotIds);
  const selectedContexts = new Set(selectedContextKeys);

  return (
    <div className="checkout-label-contexts">
      {contexts.map((context) => {
        const pendingSlotIds = context.guidedSlotIds.filter(
          (slotId) => !confirmedGuidedSlots.has(slotId),
        );
        return (
          <div className="checkout-label-context" key={context.key}>
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text type="strong">{context.label}</s-text>
              {context.guidedSlotIds.length > 0 && pendingSlotIds.length === 0 ? (
                <s-badge tone="success">{copy.guidedConfirmed}</s-badge>
              ) : null}
            </s-stack>
            {context.note ? <s-text color="subdued">{context.note}</s-text> : null}
            <div className="checkout-label-context__rows">
              {context.entries.map(({ name, slot }) => (
                <div className="checkout-label-context__row" key={name}>
                  <s-text type="strong">
                    {name === "taxCode" ? translated.taxCodeLabel : translated.pecLabel}
                  </s-text>
                  <s-stack direction="block" gap="small-100">
                    <s-text color="subdued">
                      {copy.current}: {observedLabelForSlot(slot) ?? copy.notAvailable}
                    </s-text>
                    <s-text>
                      {copy.proposed}: {proposedLabelForSlot(slot, rules) ?? copy.unchanged}
                    </s-text>
                  </s-stack>
                </div>
              ))}
            </div>
            {pendingSlotIds.length > 0 ? (
              <s-checkbox
                label={copy.confirmContext}
                checked={selectedContexts.has(context.key)}
                onChange={(event) =>
                  onContextSelectionChange(context.key, event.currentTarget.checked)
                }
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Address2Comparison({
  snapshot,
  locale,
}: {
  snapshot: CheckoutLabelsSnapshot;
  locale: Locale;
}) {
  const copy = texts(locale).rules.labels;
  const contexts = addressLabelContexts(snapshot);

  return (
    <div className="checkout-label-contexts">
      {contexts.map(({ shopLocale, slots }) => (
        <div className="checkout-label-context" key={shopLocale.locale}>
          <s-text type="strong">{shopLocale.name}</s-text>
          <div className="checkout-label-context__rows">
            {slots.map((slot) => {
              const expected = proposedLabelForSlot(slot, {
                taxCode: "unmanaged",
                pec: "unmanaged",
              });
              const current = observedLabelForSlot(slot);
              return (
                <div
                  className="checkout-label-context__row"
                  key={`${slot.name}:${slot.marketId ?? "global"}`}
                >
                  <s-stack direction="block" gap="small-100">
                    <s-text type="strong">
                      {slot.name === "address2" ? copy.addressRegular : copy.addressOptional}
                    </s-text>
                    {slot.marketName ? <s-text color="subdued">{slot.marketName}</s-text> : null}
                  </s-stack>
                  <s-stack direction="block" gap="small-100">
                    <s-text>{current ?? copy.notAvailable}</s-text>
                    {current !== expected ? (
                      <s-text color="subdued">
                        {copy.standardLabel}: {expected}
                      </s-text>
                    ) : null}
                  </s-stack>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function displaySlots(slots: CheckoutLabelSlot[], name: CheckoutLabelSlot["name"], locale: string) {
  const matching = slots.filter((slot) => slot.name === name && slot.locale === locale);
  const base =
    matching.find((slot) => slot.kind === "source") ??
    matching.find((slot) => slot.kind === "global_translation");
  return [base, ...matching.filter((slot) => slot.kind === "market_translation")].filter(
    (slot): slot is CheckoutLabelSlot => Boolean(slot),
  );
}

function fiscalLabelContexts(snapshot: CheckoutLabelsSnapshot, rules: Rules, locale: Locale) {
  const copy = texts(locale).rules.labels;
  return snapshot.locales.flatMap((shopLocale) => {
    const contexts = new Map<
      string,
      {
        key: string;
        label: string;
        note: string | null;
        entries: { name: "taxCode" | "pec"; slot: CheckoutLabelSlot }[];
        guidedSlotIds: string[];
      }
    >();

    for (const name of ["taxCode", "pec"] as const) {
      for (const slot of displaySlots(snapshot.slots, name, shopLocale.locale)) {
        const key = `${shopLocale.locale}:${slot.marketId ?? "global"}`;
        const resolution = snapshot.markets.find(({ id }) => id === slot.marketId)?.resolution;
        const note = [
          shopLocale.primary ? copy.primary : null,
          !shopLocale.published ? copy.unpublished : null,
          resolution === "ambiguous" ? copy.checkoutCheckRequired : null,
        ]
          .filter(Boolean)
          .join(" · ");
        const context = contexts.get(key) ?? {
          key,
          label: [shopLocale.name, slot.marketName].filter(Boolean).join(" · "),
          note: note || null,
          entries: [],
          guidedSlotIds: [],
        };
        context.entries.push({ name, slot });
        if (
          slot.capability !== "automatic" &&
          ((name === "taxCode" && rules.taxCode !== "unmanaged") ||
            (name === "pec" && rules.pec !== "unmanaged"))
        ) {
          context.guidedSlotIds.push(checkoutLabelSlotId(slot));
        }
        contexts.set(key, context);
      }
    }

    return [...contexts.values()];
  });
}

function compactAddressSlots(
  slots: CheckoutLabelSlot[],
  name: "address2" | "optionalAddress2",
  locale: string,
) {
  const displayed = displaySlots(slots, name, locale);
  const base = displayed.find((slot) => slot.marketId === null) ?? displayed[0];
  if (!base) return [];
  const baseValue = observedLabelForSlot(base);
  return [
    base,
    ...displayed.filter(
      (slot) => slot.marketId !== null && observedLabelForSlot(slot) !== baseValue,
    ),
  ];
}

function addressLabelContexts(snapshot: CheckoutLabelsSnapshot) {
  const contexts: {
    shopLocale: CheckoutLabelsSnapshot["locales"][number];
    slots: CheckoutLabelSlot[];
  }[] = [];
  for (const shopLocale of snapshot.locales) {
    const slots: CheckoutLabelSlot[] = [];
    for (const name of ["address2", "optionalAddress2"] as const) {
      slots.push(...compactAddressSlots(snapshot.slots, name, shopLocale.locale));
    }
    if (slots.length > 0) contexts.push({ shopLocale, slots });
  }
  return contexts;
}

function selectedGuidedSlotIds(
  contexts: FiscalLabelContext[],
  selectedContexts: Set<string>,
  confirmedSlots: Set<string>,
) {
  const selectedSlotIds: string[] = [];
  for (const context of contexts) {
    if (!selectedContexts.has(context.key)) continue;
    for (const slotId of context.guidedSlotIds) {
      if (!confirmedSlots.has(slotId)) selectedSlotIds.push(slotId);
    }
  }
  return selectedSlotIds;
}

function restorableAddressSlots(snapshot: CheckoutLabelsSnapshot, rules: Rules) {
  return snapshot.slots.filter((slot) => {
    return (
      (slot.name === "address2" || slot.name === "optionalAddress2") &&
      slot.kind !== "source" &&
      slot.currentValue !== null &&
      observedLabelForSlot(slot) !== proposedLabelForSlot(slot, rules)
    );
  });
}

function ProposedLabels({ rules, locale }: { rules: Rules; locale: Locale }) {
  const copy = texts(locale).rules.labels;
  const rulesCopy = texts(locale).rules;
  return (
    <div className="checkout-label-contexts">
      {(["it", "en"] as const).map((family) => (
        <div className="checkout-label-context" key={family}>
          <s-text type="strong">{family === "it" ? copy.italian : copy.english}</s-text>
          <div className="checkout-label-context__rows">
            <div className="checkout-label-context__row">
              <s-text>{rulesCopy.taxCodeLabel}</s-text>
              <s-text>
                {checkoutLabelCopy("taxCode", family, rules.taxCode) ?? copy.unchanged}
              </s-text>
            </div>
            <div className="checkout-label-context__row">
              <s-text>{rulesCopy.pecLabel}</s-text>
              <s-text>{checkoutLabelCopy("pec", family, rules.pec) ?? copy.unchanged}</s-text>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function addressTone(classification: CheckoutLabelState["address2Classification"]) {
  if (classification === "fiscal_conflict") return "critical" as const;
  if (classification === "nonstandard") return "warning" as const;
  if (classification === "expected") return "success" as const;
  return "neutral" as const;
}

function formatTimestamp(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "it" ? "it-IT" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toggleSelection(current: string[], slotId: string, selected: boolean) {
  return selected
    ? current.includes(slotId)
      ? current
      : [...current, slotId]
    : current.filter((candidate) => candidate !== slotId);
}
