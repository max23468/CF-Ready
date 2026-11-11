import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { CheckoutLabelsSnapshot, CheckoutLabelState } from "../../checkout-labels/domain";
import {
  RULES_INTENTS,
  type CheckoutLabelsLoadAction,
  type CheckoutLabelsRefreshAction,
} from "./rules-intents";

type Loaded = CheckoutLabelsLoadAction["loaded"];
type Refreshed = CheckoutLabelsRefreshAction["refreshed"];

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

export function useDeferredCheckoutLabels(saved: SavedLabels, reloadAfter: object | null = null) {
  const fetcher = useFetcher<CheckoutLabelsLoadAction>();
  const [baseline, setBaseline] = useState({ saved, data: fetcher.data });
  if (baseline.saved !== saved) setBaseline({ saved, data: fetcher.data });
  // "Rileggi da Shopify" risponde alla sezione etichette: il risultato entra qui, così stato,
  // tabella e revisione inviata al salvataggio hanno una sola fonte. Vale finché non arriva una
  // lettura più recente dal loader o dal caricamento differito.
  const [refreshed, setRefreshed] = useState<{
    saved: SavedLabels;
    data: typeof fetcher.data;
    value: Refreshed;
  } | null>(null);
  const reread =
    refreshed && refreshed.saved === saved && refreshed.data === fetcher.data
      ? refreshed.value
      : null;
  const applyRefreshed = (value: Refreshed) =>
    setRefreshed((previous) =>
      previous?.value === value ? previous : { saved, data: fetcher.data, value },
    );
  const loadedFor = useRef<SavedLabels | null>(null);
  const reloadedAfter = useRef<object | null>(null);

  const load = (rules: SavedLabels["rules"]) =>
    fetcher.submit(loadRequest(rules), { method: "post" });

  // Le etichette Shopify non bloccano il primo render: si rileggono dopo ogni caricamento del
  // loader, così revisione e stato restano allineati anche dopo un salvataggio. `reloadAfter`
  // forza una nuova lettura, per esempio dopo un conflitto di revisione al salvataggio.
  useEffect(() => {
    if (saved.duplicateError || saved.labelScopesGranted !== null) return;
    if (loadedFor.current === saved && (!reloadAfter || reloadedAfter.current === reloadAfter)) {
      return;
    }
    loadedFor.current = saved;
    reloadedAfter.current = reloadAfter;
    fetcher.submit(loadRequest(saved.rules), { method: "post" });
  }, [fetcher, saved, reloadAfter]);

  const loading = fetcher.state !== "idle";
  const useSnapshot =
    saved.labelScopesGranted !== null &&
    (baseline.saved !== saved || baseline.data === fetcher.data);
  const loaded: Partial<Loaded> = useSnapshot
    ? {
        scopeGranted: saved.labelScopesGranted ?? undefined,
        snapshot: saved.labelSnapshot,
        state: saved.labelState,
        guidedConfirmations: saved.guidedConfirmations,
        errorCode: saved.labelLoadError,
      }
    : (fetcher.data?.ok && fetcher.data.loaded) || {};
  return {
    loading,
    load,
    applyRefreshed,
    scopeGranted: loaded.scopeGranted ?? saved.labelScopesGranted,
    state: reread?.state ?? loaded.state ?? saved.labelState,
    snapshot: reread?.snapshot ?? loaded.snapshot ?? saved.labelSnapshot,
    guidedConfirmations:
      reread?.guidedConfirmations ?? loaded.guidedConfirmations ?? saved.guidedConfirmations,
    loadError: loaded.errorCode ?? saved.labelLoadError,
  };
}
