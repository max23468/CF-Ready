import { useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { localizedError } from "../../app-error";
import type { Rules } from "../../config";
import {
  CHECKOUT_LABEL_OPTIONAL_SCOPES,
  classifyAddress2,
  checkoutLabelCopy,
  checkoutLabelSlotId,
  observedLabelForSlot,
  proposedLabelForSlot,
  type Address2FormMode,
  type CheckoutLabelFamily,
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
  guidedConfirmations: Array<{ slotId: string; confirmedAt: string }>;
  enabled: boolean;
  busy: boolean;
  checkoutSettingsUrl: string;
  storefrontUrl: string;
  onEnabledChange: (value: boolean) => void;
};

export function CheckoutLabelsSection({
  locale,
  rules,
  scopeGranted,
  snapshot,
  state,
  loadErrorCode,
  guidedConfirmations,
  enabled,
  busy,
  checkoutSettingsUrl,
  storefrontUrl,
  onEnabledChange,
}: CheckoutLabelsSectionProps) {
  const t = texts(locale);
  const copy = t.rules.labels;
  const fetcher = useFetcher<LabelsAction>();
  const revalidator = useRevalidator();
  const [scopeRequestBusy, setScopeRequestBusy] = useState(false);
  const [scopeRequestError, setScopeRequestError] = useState<string | null>(null);
  const [selectedFamily, setSelectedFamily] = useState<CheckoutLabelFamily | null>(null);
  const activeFamily = selectedFamily ?? locale;
  const actionBusy = fetcher.state !== "idle";
  const actionError = fetcher.data?.ok === false ? fetcher.data.errorCode : null;
  const submitIntent = (
    intent: string,
    slotIds: string[] = [],
    values: Record<string, string> = {},
  ) => {
    const form = new FormData();
    form.set("intent", intent);
    form.set("labelsRevision", snapshot?.revision ?? "");
    for (const slotId of slotIds) form.append("slotId", slotId);
    for (const [name, value] of Object.entries(values)) form.set(name, value);
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
        <s-select
          label={copy.language}
          value={activeFamily}
          onChange={(event) => setSelectedFamily(event.currentTarget.value as CheckoutLabelFamily)}
        >
          <s-option value="it">{copy.italian}</s-option>
          <s-option value="en">{copy.english}</s-option>
        </s-select>
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
          activeFamily={activeFamily}
          storefrontUrl={storefrontUrl}
          enabled={enabled}
          busy={busy || actionBusy || scopeRequestBusy}
          onEnabledChange={onEnabledChange}
          guidedConfirmations={guidedConfirmations}
          submitIntent={submitIntent}
          requestPermissions={requestPermissions}
        />
        <Address2CheckoutLabels
          key={`address2:${snapshot?.revision ?? "none"}`}
          locale={locale}
          rules={rules}
          scopeGranted={scopeGranted}
          snapshot={snapshot}
          state={state}
          activeFamily={activeFamily}
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
  activeFamily,
  storefrontUrl,
  enabled,
  busy,
  onEnabledChange,
  guidedConfirmations,
  submitIntent,
  requestPermissions,
}: Pick<
  CheckoutLabelsSectionProps,
  | "locale"
  | "rules"
  | "scopeGranted"
  | "snapshot"
  | "state"
  | "storefrontUrl"
  | "enabled"
  | "busy"
  | "onEnabledChange"
  | "guidedConfirmations"
> & {
  activeFamily: CheckoutLabelFamily;
  submitIntent: (intent: string, slotIds?: string[]) => void;
  requestPermissions: () => Promise<void>;
}) {
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
    (!scopeGranted && !keptByMerchant) ||
    pendingContexts.length > 0 ||
    Boolean(state.lastErrorCode) ||
    (state.mode === "off" && state.decision === "pending");
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
            activeFamily={activeFamily}
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
            activeFamily={activeFamily}
            storefrontUrl={storefrontUrl}
            automaticAvailable={automaticAvailable}
            displayedContexts={displayedContexts}
            guidedConfirmations={guidedConfirmations}
            onEnabledChange={onEnabledChange}
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
  activeFamily,
  busy,
  requestPermissions,
  onKeep,
}: Pick<CheckoutLabelsSectionProps, "locale" | "rules" | "state" | "busy"> & {
  activeFamily: CheckoutLabelFamily;
  requestPermissions: () => Promise<void>;
  onKeep: () => void;
}) {
  const copy = texts(locale).rules.labels;
  return (
    <s-box background="subdued" borderRadius="base" padding="base">
      <s-stack direction="block" gap="small-200">
        <s-text type="strong">{copy.permissionsHeading}</s-text>
        <s-paragraph>{copy.permissionsBody}</s-paragraph>
        <ProposedLabels rules={rules} locale={locale} family={activeFamily} />
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
  activeFamily,
  storefrontUrl,
  automaticAvailable,
  displayedContexts,
  guidedConfirmations,
  onEnabledChange,
  submitIntent,
}: Pick<
  CheckoutLabelsSectionProps,
  | "locale"
  | "rules"
  | "snapshot"
  | "state"
  | "enabled"
  | "busy"
  | "storefrontUrl"
  | "guidedConfirmations"
  | "onEnabledChange"
> & {
  activeFamily: CheckoutLabelFamily;
  automaticAvailable: boolean;
  displayedContexts: FiscalLabelContext[];
  submitIntent: (intent: string, slotIds?: string[]) => void;
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
            ? copy.lastSync(formatTimestamp(state.lastSyncAt, locale))
            : copy.neverSynced}
        </s-text>
      </s-stack>
      <s-paragraph>{copy.operationalSummary(automaticCount, pendingCount)}</s-paragraph>
      {snapshot ? (
        <>
          <MarketResolutionWarning snapshot={snapshot} message={copy.marketAmbiguous} />
          <LabelComparison
            contexts={displayedContexts}
            rules={rules}
            locale={locale}
            confirmations={confirmed}
            busy={busy}
            storefrontUrl={storefrontUrl}
            onConfirm={(slotIds) => submitIntent("confirm_guided_labels", slotIds)}
          />
        </>
      ) : (
        <s-paragraph color="subdued">{copy.noSnapshot}</s-paragraph>
      )}
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
  if (!scopeGranted) {
    return { status: copy.statusManualRequired, summary: copy.nativeSummaryNeedsAccess };
  }
  if (state.mode === "off" && state.decision === "pending") {
    return { status: copy.statusManualRequired, summary: copy.nativeSummaryNeedsChoice };
  }
  return {
    status: copy.statusManagedByShopify,
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
  state,
  activeFamily,
  busy,
  checkoutSettingsUrl,
  submitIntent,
}: Pick<
  CheckoutLabelsSectionProps,
  "locale" | "rules" | "scopeGranted" | "snapshot" | "state" | "busy" | "checkoutSettingsUrl"
> & {
  activeFamily: CheckoutLabelFamily;
  submitIntent: (intent: string, slotIds?: string[], values?: Record<string, string>) => void;
}) {
  const copy = texts(locale).rules.labels;
  const presentation = address2Presentation(snapshot, rules, activeFamily, state.address2FormMode);
  const restoreModalId = `restore-address2-${activeFamily}`;

  return (
    <details
      className="checkout-labels-disclosure"
      open={
        state.address2FormMode === null ||
        (scopeGranted && presentation.classification !== "expected") ||
        undefined
      }
    >
      <summary className="checkout-labels-disclosure__summary">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-heading>{copy.addressHeading}</s-heading>
          <s-badge
            tone={state.address2FormMode ? addressTone(presentation.classification) : "warning"}
          >
            {state.address2FormMode
              ? copy.addressStatus[presentation.classification]
              : copy.statusManualRequired}
          </s-badge>
        </s-stack>
        <s-paragraph color="subdued">
          {state.address2FormMode
            ? copy.addressSummary[presentation.classification]
            : copy.addressModeSummary}
        </s-paragraph>
      </summary>
      <Address2Details
        locale={locale}
        scopeGranted={scopeGranted}
        snapshot={snapshot}
        formMode={state.address2FormMode}
        activeFamily={activeFamily}
        busy={busy}
        checkoutSettingsUrl={checkoutSettingsUrl}
        restoreModalId={restoreModalId}
        presentation={presentation}
        submitIntent={submitIntent}
      />
    </details>
  );
}

function Address2Details({
  locale,
  scopeGranted,
  snapshot,
  formMode,
  activeFamily,
  busy,
  checkoutSettingsUrl,
  restoreModalId,
  presentation,
  submitIntent,
}: Pick<
  CheckoutLabelsSectionProps,
  "locale" | "scopeGranted" | "snapshot" | "busy" | "checkoutSettingsUrl"
> & {
  formMode: Address2FormMode | null;
  activeFamily: CheckoutLabelFamily;
  restoreModalId: string;
  presentation: ReturnType<typeof address2Presentation>;
  submitIntent: (intent: string, slotIds?: string[], values?: Record<string, string>) => void;
}) {
  const copy = texts(locale).rules.labels;
  return (
    <>
      <div className="checkout-labels-disclosure__body">
        <s-stack direction="block" gap="base">
          <s-select
            label={copy.addressModeLabel}
            placeholder={copy.addressModePlaceholder}
            value={formMode ?? undefined}
            disabled={busy}
            onChange={(event) =>
              submitIntent("save_address2_form_mode", [], {
                address2FormMode: event.currentTarget.value,
              })
            }
          >
            <s-option value="required">{copy.addressRequired}</s-option>
            <s-option value="optional">{copy.addressOptional}</s-option>
          </s-select>
          <s-paragraph color="subdued">{copy.addressModeHelp}</s-paragraph>
          <s-paragraph color="subdued">
            {scopeGranted ? copy.addressLimit : copy.noSnapshot}
          </s-paragraph>
          {snapshot && formMode ? (
            <Address2Comparison
              snapshot={snapshot}
              locale={locale}
              family={activeFamily}
              formMode={formMode}
            />
          ) : null}
          {presentation.sourceRequiresManualRestore ? (
            <s-banner tone="warning">{copy.sourceManual}</s-banner>
          ) : null}
          <Address2Actions
            copy={copy}
            scopeGranted={scopeGranted}
            snapshotAvailable={Boolean(snapshot)}
            busy={busy}
            checkoutSettingsUrl={checkoutSettingsUrl}
            restoreModalId={restoreModalId}
            classification={presentation.classification}
            hasRestorableSlots={presentation.restorableSlots.length > 0}
            onKeep={() => submitIntent("accept_address2_labels")}
          />
        </s-stack>
      </div>
      <Address2RestoreModal
        locale={locale}
        restoreModalId={restoreModalId}
        restorableSlots={presentation.restorableSlots}
        submitIntent={submitIntent}
      />
    </>
  );
}

function Address2Actions({
  copy,
  scopeGranted,
  snapshotAvailable,
  busy,
  checkoutSettingsUrl,
  restoreModalId,
  classification,
  hasRestorableSlots,
  onKeep,
}: {
  copy: ReturnType<typeof texts>["rules"]["labels"];
  scopeGranted: boolean;
  snapshotAvailable: boolean;
  busy: boolean;
  checkoutSettingsUrl: string;
  restoreModalId: string;
  classification: ReturnType<typeof classifyAddress2>["classification"];
  hasRestorableSlots: boolean;
  onKeep: () => void;
}) {
  const canRestore = scopeGranted && snapshotAvailable && hasRestorableSlots;
  const canKeep =
    scopeGranted && (classification === "fiscal_conflict" || classification === "nonstandard");
  return (
    <s-stack direction="inline" gap="small-200">
      {canRestore ? (
        <s-button disabled={busy} commandFor={restoreModalId} command="--show">
          {copy.restoreAddress}
        </s-button>
      ) : null}
      {canKeep ? (
        <s-button disabled={busy} onClick={onKeep}>
          {copy.keepAddress}
        </s-button>
      ) : null}
      <s-link href={checkoutSettingsUrl} target="_top">
        {copy.openCheckout}
      </s-link>
    </s-stack>
  );
}

function Address2RestoreModal({
  locale,
  restoreModalId,
  restorableSlots,
  submitIntent,
}: {
  locale: Locale;
  restoreModalId: string;
  restorableSlots: CheckoutLabelSlot[];
  submitIntent: (intent: string, slotIds?: string[]) => void;
}) {
  const copy = texts(locale).rules.labels;
  return (
    <s-modal
      id={restoreModalId}
      heading={copy.restoreAddress}
      accessibilityLabel={copy.restoreAddressConfirm}
    >
      <s-paragraph>{copy.restoreAddressConfirm}</s-paragraph>
      <s-button slot="secondary-actions" commandFor={restoreModalId} command="--hide">
        {texts(locale).common.cancel}
      </s-button>
      <s-button
        slot="primary-action"
        variant="primary"
        commandFor={restoreModalId}
        command="--hide"
        onClick={() =>
          submitIntent(
            "restore_address2_labels",
            restorableSlots.map((slot) => checkoutLabelSlotId(slot)),
          )
        }
      >
        {copy.restoreAddress}
      </s-button>
    </s-modal>
  );
}

function address2Presentation(
  snapshot: CheckoutLabelsSnapshot | null,
  rules: Rules,
  activeFamily: CheckoutLabelFamily,
  formMode: Address2FormMode | null,
) {
  const activeName = formMode === "required" ? "address2" : "optionalAddress2";
  const activeSlots = snapshot?.slots.filter(
    (slot) => slot.family === activeFamily && slot.name === activeName,
  );
  const classification =
    formMode && activeSlots?.length ? classifyAddress2(activeSlots).classification : "unknown";
  const restorableSlots = snapshot
    ? restorableAddressSlots(snapshot, rules, activeFamily, formMode)
    : [];
  const sourceRequiresManualRestore = Boolean(
    formMode &&
    snapshot?.slots.some(
      (slot) =>
        slot.family === activeFamily &&
        slot.name === activeName &&
        slot.kind === "source" &&
        slot.currentValue !== proposedLabelForSlot(slot, rules),
    ),
  );
  return { classification, restorableSlots, sourceRequiresManualRestore };
}

function LabelComparison({
  contexts,
  rules,
  locale,
  confirmations,
  busy,
  storefrontUrl,
  onConfirm,
}: {
  contexts: FiscalLabelContext[];
  rules: Rules;
  locale: Locale;
  confirmations: Map<string, string>;
  busy: boolean;
  storefrontUrl: string;
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
          return proposed === null || proposed === observedLabelForSlot(slot);
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
              {context.entries.map(({ name, slot }) => (
                <div className="checkout-label-context__row" key={name}>
                  <s-text type="strong">
                    {name === "taxCode" ? translated.taxCodeLabel : translated.pecLabel}
                  </s-text>
                  <s-stack direction="block" gap="small-100">
                    <s-text color="subdued">
                      {copy.current}: {observedLabelForSlot(slot) ?? copy.notAvailable}
                    </s-text>
                    {proposedLabelForSlot(slot, rules) &&
                    proposedLabelForSlot(slot, rules) !== observedLabelForSlot(slot) ? (
                      <s-text>
                        {copy.proposed}: {proposedLabelForSlot(slot, rules)}
                      </s-text>
                    ) : (
                      <s-text color="subdued">{copy.noChange}</s-text>
                    )}
                  </s-stack>
                </div>
              ))}
            </div>
            {pendingSlotIds.length > 0 ? (
              <s-box background="subdued" borderRadius="base" padding="base">
                <s-stack direction="block" gap="small-200">
                  <s-text type="strong">{copy.manualHeading}</s-text>
                  <s-ordered-list>
                    {copy.manualSteps(context.label).map((step) => (
                      <s-list-item key={step}>{step}</s-list-item>
                    ))}
                  </s-ordered-list>
                  <s-link href={storefrontUrl} target="_blank">
                    {copy.openStorefront}
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
              </s-box>
            ) : confirmedAt ? (
              <s-text color="subdued">
                {copy.lastManualVerification(formatTimestamp(confirmedAt, locale))}
              </s-text>
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
  family,
  formMode,
}: {
  snapshot: CheckoutLabelsSnapshot;
  locale: Locale;
  family: CheckoutLabelFamily;
  formMode: Address2FormMode;
}) {
  const copy = texts(locale).rules.labels;
  const contexts = addressLabelContexts(snapshot, family, formMode);

  return (
    <div className="checkout-label-contexts">
      {contexts.map(({ shopLocale, slots }) => (
        <div className="checkout-label-context" key={shopLocale.locale}>
          <s-text type="strong">{copy.generalText}</s-text>
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
                      {formMode === "required" ? copy.addressRequired : copy.addressOptional}
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
    const base: FiscalLabelContext = {
      key: `${shopLocale.locale}:global`,
      label: copy.generalText,
      note: null,
      entries: [],
      guidedSlotIds: [],
    };
    const baseSlots = new Map<"taxCode" | "pec", CheckoutLabelSlot>();
    const marketSlots = new Map<
      string,
      {
        name: string;
        resolution: CheckoutLabelsSnapshot["markets"][number]["resolution"] | undefined;
        entries: Array<{ name: "taxCode" | "pec"; slot: CheckoutLabelSlot }>;
      }
    >();

    for (const name of ["taxCode", "pec"] as const) {
      const slots = displaySlots(snapshot.slots, name, shopLocale.locale);
      const baseSlot = slots.find((slot) => slot.marketId === null);
      if (!baseSlot) continue;
      baseSlots.set(name, baseSlot);

      for (const slot of slots.filter((candidate) => candidate.marketId !== null)) {
        const resolution = snapshot.markets.find(({ id }) => id === slot.marketId)?.resolution;
        const current = marketSlots.get(slot.marketId!) ?? {
          name: slot.marketName ?? copy.unknownMarket,
          resolution,
          entries: [],
        };
        current.entries.push({ name, slot });
        marketSlots.set(slot.marketId!, current);
      }
    }

    for (const [name, slot] of baseSlots) {
      base.entries.push({ name, slot });
      if (needsManualVerification(slot, rules)) {
        base.guidedSlotIds.push(checkoutLabelSlotId(slot));
      }
    }

    const marketContexts: FiscalLabelContext[] = [];
    for (const [marketId, market] of marketSlots) {
      const isException =
        market.resolution === "ambiguous" ||
        market.entries.some(({ name, slot }) => {
          const baseSlot = baseSlots.get(name);
          return baseSlot && observedLabelForSlot(slot) !== observedLabelForSlot(baseSlot);
        });
      if (!isException) {
        for (const { slot } of market.entries) {
          if (needsManualVerification(slot, rules)) {
            base.guidedSlotIds.push(checkoutLabelSlotId(slot));
          }
        }
        continue;
      }
      marketContexts.push({
        key: `${shopLocale.locale}:${marketId}`,
        label: copy.marketException(market.name),
        note: market.resolution === "ambiguous" ? copy.checkoutCheckRequired : null,
        entries: market.entries,
        guidedSlotIds: market.entries.flatMap(({ slot }) =>
          needsManualVerification(slot, rules) ? [checkoutLabelSlotId(slot)] : [],
        ),
      });
    }

    const baseNotes = [
      shopLocale.primary ? copy.primary : null,
      !shopLocale.published ? copy.unpublished : null,
      marketSlots.size > 0 && marketContexts.length === 0 ? copy.allMarketsSame : null,
    ].filter(Boolean);
    base.note = baseNotes.length > 0 ? baseNotes.join(" · ") : null;
    return base.entries.length > 0 ? [base, ...marketContexts] : [];
  });
}

function needsManualVerification(slot: CheckoutLabelSlot, rules: Rules) {
  return (
    slot.capability !== "automatic" &&
    ((slot.name === "taxCode" && rules.taxCode !== "unmanaged") ||
      (slot.name === "pec" && rules.pec !== "unmanaged"))
  );
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

function addressLabelContexts(
  snapshot: CheckoutLabelsSnapshot,
  family: CheckoutLabelFamily,
  formMode: Address2FormMode,
) {
  const contexts: {
    shopLocale: CheckoutLabelsSnapshot["locales"][number];
    slots: CheckoutLabelSlot[];
  }[] = [];
  const name = formMode === "required" ? "address2" : "optionalAddress2";
  for (const shopLocale of snapshot.locales.filter((candidate) => candidate.family === family)) {
    const slots = compactAddressSlots(snapshot.slots, name, shopLocale.locale);
    if (slots.length > 0) contexts.push({ shopLocale, slots });
  }
  return contexts;
}

function restorableAddressSlots(
  snapshot: CheckoutLabelsSnapshot,
  rules: Rules,
  family: CheckoutLabelFamily,
  formMode: Address2FormMode | null,
) {
  const name = formMode === "required" ? "address2" : "optionalAddress2";
  return snapshot.slots.filter((slot) => {
    return (
      formMode !== null &&
      slot.family === family &&
      slot.name === name &&
      slot.kind !== "source" &&
      slot.currentValue !== null &&
      observedLabelForSlot(slot) !== proposedLabelForSlot(slot, rules)
    );
  });
}

function ProposedLabels({
  rules,
  locale,
  family,
}: {
  rules: Rules;
  locale: Locale;
  family: CheckoutLabelFamily;
}) {
  const copy = texts(locale).rules.labels;
  const rulesCopy = texts(locale).rules;
  return (
    <div className="checkout-label-contexts">
      <div className="checkout-label-context">
        <s-text type="strong">{family === "it" ? copy.italian : copy.english}</s-text>
        <div className="checkout-label-context__rows">
          <div className="checkout-label-context__row">
            <s-text>{rulesCopy.taxCodeLabel}</s-text>
            <s-text>{checkoutLabelCopy("taxCode", family, rules.taxCode) ?? copy.unchanged}</s-text>
          </div>
          <div className="checkout-label-context__row">
            <s-text>{rulesCopy.pecLabel}</s-text>
            <s-text>{checkoutLabelCopy("pec", family, rules.pec) ?? copy.unchanged}</s-text>
          </div>
        </div>
      </div>
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

function latestConfirmation(slotIds: string[], confirmations: Map<string, string>) {
  return slotIds
    .flatMap((slotId) => confirmations.get(slotId) ?? [])
    .sort()
    .at(-1);
}
