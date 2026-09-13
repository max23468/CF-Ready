import type { Rules } from "../../config";
import {
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
import {
  address2Presentation,
  addressLabelContexts,
  addressTone,
} from "./checkout-labels-presentation";
import { RULES_INTENTS, type SubmitCheckoutLabelsIntent } from "./rules-intents";

type Address2CheckoutLabelsProps = {
  locale: Locale;
  rules: Rules;
  scopeGranted: boolean;
  snapshot: CheckoutLabelsSnapshot | null;
  state: CheckoutLabelState;
  activeFamily: CheckoutLabelFamily;
  busy: boolean;
  checkoutSettingsUrl: string;
  submitIntent: SubmitCheckoutLabelsIntent;
};

export function Address2CheckoutLabels({
  locale,
  rules,
  scopeGranted,
  snapshot,
  state,
  activeFamily,
  busy,
  checkoutSettingsUrl,
  submitIntent,
}: Address2CheckoutLabelsProps) {
  const copy = texts(locale).rules.labels;
  const presentation = address2Presentation(snapshot, rules, activeFamily, state.address2FormMode);
  const restoreModalId = `restore-address2-${activeFamily}`;
  const hidden = state.address2FormMode === "hidden";

  return (
    <details className="checkout-labels-disclosure">
      <Address2Summary
        copy={copy}
        formMode={state.address2FormMode}
        classification={presentation.classification}
      />
      <Address2Content
        {...{
          locale,
          scopeGranted,
          snapshot,
          state,
          activeFamily,
          busy,
          checkoutSettingsUrl,
          submitIntent,
          copy,
          presentation,
          restoreModalId,
          hidden,
        }}
      />
      <Address2RestoreModal
        locale={locale}
        restoreModalId={restoreModalId}
        restorableSlots={presentation.restorableSlots}
        submitIntent={submitIntent}
      />
    </details>
  );
}

function Address2Summary({
  copy,
  formMode,
  classification,
}: {
  copy: ReturnType<typeof texts>["rules"]["labels"];
  formMode: Address2FormMode | null;
  classification: CheckoutLabelState["address2Classification"];
}) {
  const hidden = formMode === "hidden";
  return (
    <summary className="checkout-labels-disclosure__summary">
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-heading>{copy.addressHeading}</s-heading>
        <s-badge tone={hidden ? "neutral" : formMode ? addressTone(classification) : "warning"}>
          {hidden
            ? copy.addressHidden
            : formMode
              ? copy.addressStatus[classification]
              : copy.statusManualRequired}
        </s-badge>
      </s-stack>
      <s-paragraph color="subdued">
        {hidden
          ? copy.addressHiddenSummary
          : formMode
            ? copy.addressSummary[classification]
            : copy.addressModeSummary}
      </s-paragraph>
    </summary>
  );
}

function Address2Content({
  locale,
  scopeGranted,
  snapshot,
  state,
  activeFamily,
  busy,
  checkoutSettingsUrl,
  submitIntent,
  copy,
  presentation,
  restoreModalId,
  hidden,
}: Omit<Address2CheckoutLabelsProps, "rules"> & {
  copy: ReturnType<typeof texts>["rules"]["labels"];
  presentation: ReturnType<typeof address2Presentation>;
  restoreModalId: string;
  hidden: boolean;
}) {
  return (
    <div className="checkout-labels-disclosure__body">
      <s-stack direction="block" gap="base">
        <s-select
          label={copy.addressModeLabel}
          placeholder={copy.addressModePlaceholder}
          value={state.address2FormMode ?? undefined}
          disabled={busy}
          onChange={(event) =>
            submitIntent(RULES_INTENTS.saveAddress2FormMode, [], {
              address2FormMode: event.currentTarget.value,
            })
          }
        >
          <s-option value="required">{copy.addressRequired}</s-option>
          <s-option value="optional">{copy.addressOptional}</s-option>
          <s-option value="hidden">{copy.addressHidden}</s-option>
        </s-select>
        <s-paragraph color="subdued">{copy.addressModeHelp}</s-paragraph>
        <s-paragraph color="subdued">
          {hidden ? copy.addressHiddenHelp : scopeGranted ? copy.addressLimit : copy.noSnapshot}
        </s-paragraph>
        {snapshot && state.address2FormMode && !hidden ? (
          <Address2Comparison
            snapshot={snapshot}
            locale={locale}
            family={activeFamily}
            formMode={state.address2FormMode}
          />
        ) : null}
        {presentation.sourceRequiresManualRestore ? (
          <s-banner tone="warning">{copy.sourceManual}</s-banner>
        ) : null}
        {hidden ? (
          <s-link href={checkoutSettingsUrl} target="_top">
            {copy.openCheckout}
          </s-link>
        ) : (
          <Address2Actions
            copy={copy}
            scopeGranted={scopeGranted}
            snapshotAvailable={Boolean(snapshot)}
            busy={busy}
            checkoutSettingsUrl={checkoutSettingsUrl}
            restoreModalId={restoreModalId}
            classification={presentation.classification}
            hasRestorableSlots={presentation.restorableSlots.length > 0}
            onKeep={() => submitIntent(RULES_INTENTS.acceptAddress2Labels)}
          />
        )}
      </s-stack>
    </div>
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
  classification: CheckoutLabelState["address2Classification"];
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
  submitIntent: SubmitCheckoutLabelsIntent;
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
            RULES_INTENTS.restoreAddress2Labels,
            restorableSlots.map((slot) => checkoutLabelSlotId(slot)),
          )
        }
      >
        {copy.restoreAddress}
      </s-button>
    </s-modal>
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
