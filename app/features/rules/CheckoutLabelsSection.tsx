import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { localizedError } from "../../app-error";
import type { Rules } from "../../config";
import type {
  CheckoutLabelFamily,
  CheckoutLabelsSnapshot,
  CheckoutLabelState,
} from "../../checkout-labels/domain";
import { texts, type Locale } from "../../i18n";
import { showToast } from "../../save-bar";
import { useCheckoutLabelScopeRequest } from "../use-checkout-label-scopes";
import { Address2CheckoutLabels } from "./Address2CheckoutLabels";
import { KeepNativeLabelsChoice, NativeCheckoutLabels } from "./NativeCheckoutLabels";
import { fiscalLabelContexts, pendingFiscalLabels } from "./checkout-labels-presentation";
import { RULES_INTENTS, type SubmitCheckoutLabelsIntent } from "./rules-intents";

type LabelsAction =
  | {
      ok: true;
      refreshed?: {
        snapshot: CheckoutLabelsSnapshot;
        state: CheckoutLabelState;
        guidedConfirmations: Array<{ slotId: string; confirmedAt: string }>;
      };
    }
  | { ok: false; errorCode: string }
  | undefined;

type CheckoutLabelsSectionProps = {
  locale: Locale;
  timeZone: string | null;
  rules: Rules;
  scopeGranted: boolean | null;
  snapshot: CheckoutLabelsSnapshot | null;
  state: CheckoutLabelState;
  loadErrorCode: string | null;
  guidedConfirmations: Array<{ slotId: string; confirmedAt: string }>;
  enabled: boolean;
  busy: boolean;
  checkoutSettingsUrl: string;
  storefrontUrl: string;
  onEnabledChange: (value: boolean) => void;
  onScopeGranted: () => void;
};

export function CheckoutLabelsSection({
  locale,
  timeZone,
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
  onScopeGranted,
}: CheckoutLabelsSectionProps) {
  const copy = texts(locale).rules.labels;
  const [selectedFamily, setSelectedFamily] = useState<CheckoutLabelFamily | null>(null);
  const controls = useCheckoutLabelsControls(snapshot, state, guidedConfirmations, onScopeGranted);
  // Finché il merchant non sceglie, "Lingua" mostra la prima lingua con una verifica in sospeso.
  const pendingFamilies = controls.visibleSnapshot
    ? pendingFiscalLabels(
        fiscalLabelContexts(controls.visibleSnapshot, rules, locale),
        controls.visibleGuidedConfirmations,
      ).families
    : [];
  const activeFamily =
    selectedFamily ??
    (pendingFamilies.length === 0 || pendingFamilies.includes(locale)
      ? locale
      : pendingFamilies[0]);
  const controlsBusy =
    busy || controls.actionBusy || controls.scopeRequestBusy || controls.revalidationBusy;
  const refreshedText = copy.refreshComplete;
  useEffect(() => {
    if (controls.refreshed) showToast(refreshedText);
  }, [controls.refreshed, refreshedText]);
  const address2SavedText = copy.addressModeSaved;
  useEffect(() => {
    if (controls.address2ModeSaved) showToast(address2SavedText);
  }, [controls.address2ModeSaved, address2SavedText]);

  if (scopeGranted === null) {
    return (
      <s-section heading={copy.heading}>
        <s-paragraph color="subdued">{copy.loading}</s-paragraph>
      </s-section>
    );
  }

  return (
    <s-section heading={copy.heading}>
      <s-stack direction="block" gap="base">
        <s-select
          label={copy.language}
          value={activeFamily}
          onChange={(event) => setSelectedFamily(event.currentTarget.value as CheckoutLabelFamily)}
        >
          <s-option value="it" selected={activeFamily === "it"}>
            {copy.italian}
          </s-option>
          <s-option value="en" selected={activeFamily === "en"}>
            {copy.english}
          </s-option>
        </s-select>

        {!scopeGranted ? (
          <NativeLabelsPermissionPrompt
            locale={locale}
            state={state}
            busy={controlsBusy}
            requestPermissions={controls.requestPermissions}
            onKeep={() => controls.submitIntent(RULES_INTENTS.acceptCheckoutLabels)}
          />
        ) : null}

        <CheckoutLabelsFeedback
          locale={locale}
          actionError={controls.actionError}
          scopeRequestError={controls.scopeRequestError}
          loadErrorCode={loadErrorCode}
          refreshed={Boolean(controls.refreshed)}
        />

        <Address2CheckoutLabels
          locale={locale}
          rules={rules}
          scopeGranted={scopeGranted}
          snapshot={controls.visibleSnapshot}
          state={controls.visibleState}
          activeFamily={activeFamily}
          busy={controlsBusy}
          checkoutSettingsUrl={checkoutSettingsUrl}
          submitIntent={controls.submitIntent}
        />

        {scopeGranted ? (
          <NativeCheckoutLabels
            locale={locale}
            timeZone={timeZone}
            rules={rules}
            snapshot={controls.visibleSnapshot}
            state={controls.visibleState}
            activeFamily={activeFamily}
            storefrontUrl={storefrontUrl}
            checkoutSettingsUrl={checkoutSettingsUrl}
            enabled={enabled}
            busy={controlsBusy}
            onEnabledChange={onEnabledChange}
            guidedConfirmations={controls.visibleGuidedConfirmations}
            submitIntent={controls.submitIntent}
            refreshing={controls.refreshing}
          />
        ) : null}
      </s-stack>
    </s-section>
  );
}

function useCheckoutLabelsControls(
  snapshot: CheckoutLabelsSnapshot | null,
  state: CheckoutLabelState,
  guidedConfirmations: Array<{ slotId: string; confirmedAt: string }>,
  onScopeGranted: () => void,
) {
  const fetcher = useFetcher<LabelsAction>();
  const submittedIntent = useRef<string | null>(null);
  const { requestPermissions, revalidationBusy, scopeRequestBusy, scopeRequestError } =
    useCheckoutLabelScopeRequest(onScopeGranted);
  const actionBusy = fetcher.state !== "idle";
  const actionError = fetcher.data?.ok === false ? fetcher.data.errorCode : null;
  const refreshed = fetcher.data?.ok ? fetcher.data.refreshed : undefined;
  const visibleSnapshot = refreshed?.snapshot ?? snapshot;
  const visibleState = refreshed?.state ?? state;
  const visibleGuidedConfirmations = refreshed?.guidedConfirmations ?? guidedConfirmations;
  // R-H7: il salvataggio immediato del campo Interno si conferma con un toast.
  const address2ModeSaved =
    !actionBusy &&
    fetcher.data?.ok === true &&
    submittedIntent.current === RULES_INTENTS.saveAddress2FormMode
      ? fetcher.data
      : null;
  const refreshing =
    actionBusy && fetcher.formData?.get("intent") === RULES_INTENTS.refreshCheckoutLabels;
  const submitIntent: SubmitCheckoutLabelsIntent = (intent, slotIds = [], values = {}) => {
    const form = new FormData();
    submittedIntent.current = intent;
    form.set("intent", intent);
    form.set("labelsRevision", visibleSnapshot?.revision ?? "");
    for (const slotId of slotIds) form.append("slotId", slotId);
    for (const [name, value] of Object.entries(values)) form.set(name, value);
    fetcher.submit(form, { method: "post" });
  };
  return {
    actionBusy,
    actionError,
    address2ModeSaved,
    refreshed,
    refreshing,
    revalidationBusy,
    scopeRequestBusy,
    scopeRequestError,
    visibleGuidedConfirmations,
    visibleSnapshot,
    visibleState,
    requestPermissions,
    submitIntent,
  };
}

function CheckoutLabelsFeedback({
  locale,
  actionError,
  scopeRequestError,
  loadErrorCode,
  refreshed,
}: {
  locale: Locale;
  actionError: string | null;
  scopeRequestError: string | null;
  loadErrorCode: string | null;
  refreshed: boolean;
}) {
  const t = texts(locale);
  const error = actionError ?? scopeRequestError;
  return (
    <>
      {error ? <s-banner tone="critical">{localizedError(t.errors, error)}</s-banner> : null}
      {loadErrorCode && !refreshed ? (
        <s-banner tone="warning">{localizedError(t.errors, loadErrorCode)}</s-banner>
      ) : null}
    </>
  );
}

function NativeLabelsPermissionPrompt({
  locale,
  state,
  busy,
  requestPermissions,
  onKeep,
}: {
  locale: Locale;
  state: CheckoutLabelState;
  busy: boolean;
  requestPermissions: () => Promise<void>;
  onKeep: () => void;
}) {
  const copy = texts(locale).rules.labels;
  return (
    <s-box background="subdued" borderRadius="base" padding="base">
      <s-stack direction="block" gap="small-200">
        <s-text type="strong">{copy.permissionsHeading}</s-text>
        <s-paragraph>{copy.permissionsBody}</s-paragraph>
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
