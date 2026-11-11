import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { CheckoutLabelsSnapshot, CheckoutLabelState } from "../../checkout-labels/domain";
import {
  CHECKOUT_LABELS_ACTION_FETCHER,
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

// "Rileggi da Shopify" parte dalla sezione etichette con il fetcher condiviso
// `CHECKOUT_LABELS_ACTION_FETCHER`: il risultato si legge qui, così stato, tabella e revisione
// inviata al salvataggio hanno una sola fonte. Vale finché non arriva una lettura più recente
// dal loader o dal caricamento differito.
function useRereadLabels(saved: SavedLabels, loadedData: unknown) {
  const actions = useFetcher<{ ok: boolean; refreshed?: Refreshed }>({
    key: CHECKOUT_LABELS_ACTION_FETCHER,
  });
  const value = actions.data?.ok ? actions.data.refreshed : undefined;
  const [reread, setReread] = useState({ value, saved, loadedData });
  if (reread.value !== value) setReread({ value, saved, loadedData });
  return reread.value && reread.saved === saved && reread.loadedData === loadedData
    ? reread.value
    : null;
}

export function useDeferredCheckoutLabels(saved: SavedLabels, reloadAfter: object | null = null) {
  const fetcher = useFetcher<CheckoutLabelsLoadAction>();
  const [baseline, setBaseline] = useState({ saved, data: fetcher.data });
  if (baseline.saved !== saved) setBaseline({ saved, data: fetcher.data });
  const reread = useRereadLabels(saved, fetcher.data);
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
  const loaded: Partial<Loaded> = {
    ...(useSnapshot
      ? {
          scopeGranted: saved.labelScopesGranted ?? undefined,
          snapshot: saved.labelSnapshot,
          state: saved.labelState,
          guidedConfirmations: saved.guidedConfirmations,
          errorCode: saved.labelLoadError,
        }
      : (fetcher.data?.ok && fetcher.data.loaded) || {}),
    ...reread,
  };
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
