import { useState, type ReactNode } from "react";
import { useFetcher } from "react-router";
import { localizedError } from "../../app-error";
import type { Rules } from "../../config";
import {
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
  ruleControls: ReactNode;
  addressDeclaration: ReactNode;
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
  ruleControls,
  addressDeclaration,
}: CheckoutLabelsSectionProps) {
  const t = texts(locale);
  const copy = t.rules.labels;
  const fetcher = useFetcher<LabelsAction>();
  const actionBusy = fetcher.state !== "idle";
  const actionError = fetcher.data?.ok === false ? fetcher.data.errorCode : null;
  const submitIntent = (intent: string, slotIds: string[] = []) => {
    const form = new FormData();
    form.set("intent", intent);
    form.set("labelsRevision", snapshot?.revision ?? "");
    for (const slotId of slotIds) form.append("slotId", slotId);
    fetcher.submit(form, { method: "post" });
  };

  return (
    <s-section heading={copy.heading}>
      <s-stack direction="block" gap="base">
        <s-paragraph>{copy.intro}</s-paragraph>
        {actionError ? (
          <s-banner tone="critical">{localizedError(t.errors, actionError)}</s-banner>
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
          busy={busy || actionBusy}
          onEnabledChange={onEnabledChange}
          ruleControls={ruleControls}
          confirmedGuidedSlotIds={confirmedGuidedSlotIds}
          submitIntent={submitIntent}
        />
        <Address2CheckoutLabels
          key={`address2:${snapshot?.revision ?? "none"}`}
          locale={locale}
          rules={rules}
          scopeGranted={scopeGranted}
          snapshot={snapshot}
          busy={busy || actionBusy}
          checkoutSettingsUrl={checkoutSettingsUrl}
          addressDeclaration={addressDeclaration}
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
  ruleControls,
  confirmedGuidedSlotIds,
  submitIntent,
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
  | "ruleControls"
  | "confirmedGuidedSlotIds"
> & { submitIntent: (intent: string, slotIds?: string[]) => void }) {
  const copy = texts(locale).rules.labels;
  const [selectedGuided, setSelectedGuided] = useState<string[]>([]);
  const automaticAvailable = Boolean(
    snapshot?.slots.some(
      (slot) => slot.capability === "automatic" && (slot.name === "taxCode" || slot.name === "pec"),
    ),
  );

  return (
    <s-box border="base" borderRadius="base" padding="base">
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" alignItems="center" gap="small-200">
          <s-heading>{copy.nativeHeading}</s-heading>
          <s-badge tone={scopeGranted ? "success" : "neutral"}>
            {scopeGranted ? copy.permissionsGranted : copy.modeValues.off}
          </s-badge>
        </s-stack>
        <s-paragraph color="subdued">{copy.nativeBody}</s-paragraph>
        {ruleControls}
        {!scopeGranted ? (
          <s-box background="subdued" borderRadius="base" padding="base">
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">{copy.permissionsHeading}</s-text>
              <s-paragraph>{copy.permissionsBody}</s-paragraph>
              <ProposedLabels rules={rules} locale={locale} />
              <s-button
                variant="primary"
                disabled={busy}
                onClick={() => submitIntent("request_label_scopes")}
              >
                {copy.requestPermissions}
              </s-button>
            </s-stack>
          </s-box>
        ) : (
          <>
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
              <LabelComparison
                snapshot={snapshot}
                rules={rules}
                locale={locale}
                confirmedGuidedSlotIds={confirmedGuidedSlotIds}
                selectedGuidedSlotIds={selectedGuided}
                onGuidedSelectionChange={(slotId, selected) =>
                  setSelectedGuided((current) => toggleSelection(current, slotId, selected))
                }
              />
            ) : (
              <s-paragraph color="subdued">{copy.noSnapshot}</s-paragraph>
            )}
            <s-paragraph color="subdued">{copy.realCheckout}</s-paragraph>
            {selectedGuided.length > 0 ? (
              <s-button
                disabled={busy}
                onClick={() => submitIntent("confirm_guided_labels", selectedGuided)}
              >
                {copy.confirmGuided}
              </s-button>
            ) : null}
            <s-button disabled={busy} onClick={() => window.location.reload()}>
              {copy.refresh}
            </s-button>
          </>
        )}
      </s-stack>
    </s-box>
  );
}

function Address2CheckoutLabels({
  locale,
  rules,
  scopeGranted,
  snapshot,
  busy,
  checkoutSettingsUrl,
  addressDeclaration,
  submitIntent,
}: Pick<
  CheckoutLabelsSectionProps,
  | "locale"
  | "rules"
  | "scopeGranted"
  | "snapshot"
  | "busy"
  | "checkoutSettingsUrl"
  | "addressDeclaration"
> & { submitIntent: (intent: string, slotIds?: string[]) => void }) {
  const copy = texts(locale).rules.labels;
  const [selectedAddressSlots, setSelectedAddressSlots] = useState<string[]>([]);
  const classification = snapshot?.address2.classification ?? "unknown";
  const sourceRequiresManualRestore = snapshot?.slots.some(
    (slot) =>
      (slot.name === "address2" || slot.name === "optionalAddress2") &&
      slot.kind === "source" &&
      slot.currentValue !== proposedLabelForSlot(slot, rules),
  );

  return (
    <s-box border="base" borderRadius="base" padding="base">
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-heading>{copy.addressHeading}</s-heading>
          <s-badge tone={addressTone(classification)}>{copy.addressStatus[classification]}</s-badge>
        </s-stack>
        <s-paragraph color="subdued">{copy.addressBody}</s-paragraph>
        {addressDeclaration}
        {snapshot ? (
          <Address2Comparison
            snapshot={snapshot}
            locale={locale}
            selectedSlotIds={selectedAddressSlots}
            onSelectionChange={(slotId, selected) =>
              setSelectedAddressSlots((current) => toggleSelection(current, slotId, selected))
            }
          />
        ) : null}
        {sourceRequiresManualRestore ? (
          <s-banner tone="warning">{copy.sourceManual}</s-banner>
        ) : null}
        <s-stack direction="inline" gap="small-200">
          {scopeGranted && snapshot && selectedAddressSlots.length > 0 ? (
            <s-button
              disabled={busy}
              onClick={() => {
                if (window.confirm(copy.restoreAddressConfirm)) {
                  submitIntent("restore_address2_labels", selectedAddressSlots);
                }
              }}
            >
              {copy.restoreAddress}
            </s-button>
          ) : null}
          {scopeGranted && classification !== "unknown" ? (
            <s-button disabled={busy} onClick={() => submitIntent("accept_address2_labels")}>
              {copy.keepAddress}
            </s-button>
          ) : null}
          <s-link href={checkoutSettingsUrl} target="_top">
            {copy.openCheckout}
          </s-link>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

function LabelComparison({
  snapshot,
  rules,
  locale,
  confirmedGuidedSlotIds,
  selectedGuidedSlotIds,
  onGuidedSelectionChange,
}: {
  snapshot: CheckoutLabelsSnapshot;
  rules: Rules;
  locale: Locale;
  confirmedGuidedSlotIds: string[];
  selectedGuidedSlotIds: string[];
  onGuidedSelectionChange: (slotId: string, selected: boolean) => void;
}) {
  const copy = texts(locale).rules.labels;
  const translated = texts(locale).rules;
  const rows = snapshot.locales.flatMap((shopLocale) =>
    (["taxCode", "pec"] as const).flatMap((name) => {
      return displaySlots(snapshot.slots, name, shopLocale.locale).map((slot) => ({
        shopLocale,
        slot,
      }));
    }),
  );
  const confirmedGuidedSlots = new Set(confirmedGuidedSlotIds);
  const selectedGuidedSlots = new Set(selectedGuidedSlotIds);

  return (
    <div className="checkout-labels-table">
      <div className="checkout-labels-table__header" aria-hidden="true">
        <s-text type="strong">{copy.language}</s-text>
        <s-text type="strong">{copy.current}</s-text>
        <s-text type="strong">{copy.proposed}</s-text>
      </div>
      {rows.map(({ shopLocale, slot }) => {
        const slotId = checkoutLabelSlotId(slot);
        const guided =
          slot.capability !== "automatic" &&
          ((slot.name === "taxCode" && rules.taxCode !== "unmanaged") ||
            (slot.name === "pec" && rules.pec !== "unmanaged"));
        const confirmed = confirmedGuidedSlots.has(slotId);
        return (
          <div
            className="checkout-labels-table__row"
            key={`${slot.key}:${slot.locale}:${slot.marketId ?? "global"}`}
          >
            <s-stack direction="block" gap="small-100">
              <s-text type="strong">
                {shopLocale.name} ·{" "}
                {slot.name === "taxCode" ? translated.taxCodeLabel : translated.pecLabel}
              </s-text>
              <s-text color="subdued">
                {[
                  shopLocale.primary ? copy.primary : null,
                  !shopLocale.published ? copy.unpublished : null,
                  slot.capability === "automatic" ? copy.automatic : copy.guided,
                  slot.marketName,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </s-text>
            </s-stack>
            <s-text>{observedLabelForSlot(slot)}</s-text>
            <s-stack direction="block" gap="small-100">
              <s-text>{proposedLabelForSlot(slot, rules) ?? observedLabelForSlot(slot)}</s-text>
              {guided ? (
                confirmed ? (
                  <s-badge tone="success">{copy.guidedConfirmed}</s-badge>
                ) : (
                  <s-checkbox
                    label={copy.confirmRendered}
                    checked={selectedGuidedSlots.has(slotId)}
                    onChange={(event) =>
                      onGuidedSelectionChange(slotId, event.currentTarget.checked)
                    }
                  />
                )
              ) : null}
            </s-stack>
          </div>
        );
      })}
      {snapshot.slots.some((slot) => slot.marketId !== null) ? (
        <s-badge tone="warning">{copy.marketOverride}</s-badge>
      ) : null}
    </div>
  );
}

function Address2Comparison({
  snapshot,
  locale,
  selectedSlotIds,
  onSelectionChange,
}: {
  snapshot: CheckoutLabelsSnapshot;
  locale: Locale;
  selectedSlotIds: string[];
  onSelectionChange: (slotId: string, selected: boolean) => void;
}) {
  const copy = texts(locale).rules.labels;
  const rows = snapshot.locales.flatMap((shopLocale) =>
    (["address2", "optionalAddress2"] as const).flatMap((name) => {
      return displaySlots(snapshot.slots, name, shopLocale.locale).map((slot) => ({
        shopLocale,
        slot,
      }));
    }),
  );
  const selectedSlots = new Set(selectedSlotIds);
  return (
    <div className="checkout-labels-table">
      <div className="checkout-labels-table__header" aria-hidden="true">
        <s-text type="strong">{copy.language}</s-text>
        <s-text type="strong">{copy.current}</s-text>
        <s-text type="strong">{copy.proposed}</s-text>
      </div>
      {rows.map(({ shopLocale, slot }) => {
        const slotId = checkoutLabelSlotId(slot);
        const restorable =
          slot.kind !== "source" &&
          slot.currentValue !== null &&
          observedLabelForSlot(slot) !==
            proposedLabelForSlot(slot, {
              taxCode: "unmanaged",
              pec: "unmanaged",
            });
        return (
          <div
            className="checkout-labels-table__row"
            key={`${slot.key}:${slot.locale}:${slot.marketId ?? "global"}`}
          >
            <s-stack direction="block" gap="small-100">
              <s-text type="strong">
                {shopLocale.name} ·{" "}
                {slot.name === "address2" ? copy.addressRegular : copy.addressOptional}
              </s-text>
              {slot.marketName ? <s-text color="subdued">{slot.marketName}</s-text> : null}
            </s-stack>
            <s-text>{observedLabelForSlot(slot)}</s-text>
            <s-stack direction="block" gap="small-100">
              <s-text>
                {proposedLabelForSlot(slot, { taxCode: "unmanaged", pec: "unmanaged" })}
              </s-text>
              {restorable ? (
                <s-checkbox
                  label={copy.selectRestore}
                  checked={selectedSlots.has(slotId)}
                  onChange={(event) => onSelectionChange(slotId, event.currentTarget.checked)}
                />
              ) : null}
            </s-stack>
          </div>
        );
      })}
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

function ProposedLabels({ rules, locale }: { rules: Rules; locale: Locale }) {
  const copy = texts(locale).rules.labels;
  const rulesCopy = texts(locale).rules;
  return (
    <div className="checkout-labels-table">
      <div className="checkout-labels-table__header" aria-hidden="true">
        <s-text type="strong">{copy.language}</s-text>
        <s-text type="strong">{rulesCopy.taxCodeLabel}</s-text>
        <s-text type="strong">{rulesCopy.pecLabel}</s-text>
      </div>
      {(["it", "en"] as const).map((family) => (
        <div className="checkout-labels-table__row" key={family}>
          <s-text type="strong">{family === "it" ? copy.italian : copy.english}</s-text>
          <s-text>{checkoutLabelCopy("taxCode", family, rules.taxCode) ?? copy.unchanged}</s-text>
          <s-text>{checkoutLabelCopy("pec", family, rules.pec) ?? copy.unchanged}</s-text>
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
