import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import type { CheckoutLabelsSnapshot, CheckoutLabelState } from "../../checkout-labels/domain";
import { RULES_INTENTS, type CheckoutLabelsLoadAction } from "./rules-intents";

type Loaded = CheckoutLabelsLoadAction["loaded"];

type SavedLabels = {
  duplicateError: string | null;
  labelScopesGranted: boolean | null;
  labelState: CheckoutLabelState;
  labelSnapshot: CheckoutLabelsSnapshot | null;
  guidedConfirmations: Loaded["guidedConfirmations"];
  labelLoadError: string | null;
  rules: { taxCode: string; pec: string };
};

const loadRequest = (rules: SavedLabels["rules"]) => ({
  intent: RULES_INTENTS.loadCheckoutLabels,
  taxCode: rules.taxCode,
  pec: rules.pec,
});

export function useDeferredCheckoutLabels(saved: SavedLabels) {
  const fetcher = useFetcher<CheckoutLabelsLoadAction>();
  const loadedFor = useRef<SavedLabels | null>(null);

  const load = (rules: SavedLabels["rules"]) =>
    fetcher.submit(loadRequest(rules), { method: "post" });

  // Le etichette Shopify non bloccano il primo render: si rileggono dopo ogni caricamento del
  // loader, così revisione e stato restano allineati anche dopo un salvataggio.
  useEffect(() => {
    if (saved.duplicateError || saved.labelScopesGranted !== null) return;
    if (loadedFor.current === saved) return;
    loadedFor.current = saved;
    fetcher.submit(loadRequest(saved.rules), { method: "post" });
  }, [fetcher, saved]);

  const loading = fetcher.state !== "idle";
  const loaded: Partial<Loaded> = (!loading && fetcher.data?.ok && fetcher.data.loaded) || {};
  return {
    loading,
    load,
    scopeGranted: loaded.scopeGranted ?? saved.labelScopesGranted,
    state: loaded.state ?? saved.labelState,
    snapshot: loaded.snapshot ?? saved.labelSnapshot,
    guidedConfirmations: loaded.guidedConfirmations ?? saved.guidedConfirmations,
    loadError: loaded.errorCode ?? saved.labelLoadError,
  };
}
