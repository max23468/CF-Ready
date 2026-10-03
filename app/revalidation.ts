import type { ShouldRevalidateFunction } from "react-router";
import { useState } from "react";

// Il redirect all'approvazione Shopify e un salvataggio con readback già verificato non
// richiedono una seconda lettura immediata. Errori e conflitti mantengono la rivalidazione.
export const skipRevalidationWhenLeaving: ShouldRevalidateFunction = ({
  actionResult,
  defaultShouldRevalidate,
}) =>
  actionResult &&
  ("confirmationUrl" in actionResult || (actionResult.ok === true && actionResult.saved))
    ? false
    : defaultShouldRevalidate;

// Un successo contiene il readback verificato. Un nuovo loader resta autorevole, anche se
// React Router conserva la risposta dell'azione precedente durante una rivalidazione manuale.
export function useSavedData<T extends object>(loaded: T, saved: Partial<T> | undefined) {
  const [observed, setObserved] = useState({ loaded, saved, data: { ...loaded, ...saved } });
  if (observed.loaded !== loaded) {
    setObserved({ loaded, saved, data: loaded });
    return loaded;
  }
  if (observed.saved !== saved) {
    const data = saved ? { ...observed.data, ...saved } : observed.data;
    setObserved({ loaded, saved, data });
    return data;
  }
  return observed.data;
}

export function openBillingApproval(
  confirmationUrl: string | undefined,
  opener: (url: string, target: string) => unknown = open,
) {
  if (confirmationUrl) opener(confirmationUrl, "_top");
}
