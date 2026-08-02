import type { ShouldRevalidateFunction } from "react-router";

// Quando l'azione restituisce un URL di conferma, la pagina sta per essere sostituita
// dall'approvazione Shopify: ogni rivalidazione parte solo per essere interrotta a metà, e
// la fetch abortita fa comparire un errore che dura il tempo del redirect.
export const skipRevalidationWhenLeaving: ShouldRevalidateFunction = ({
  actionResult,
  defaultShouldRevalidate,
}) => (actionResult && "confirmationUrl" in actionResult ? false : defaultShouldRevalidate);

export function openBillingApproval(
  confirmationUrl: string | undefined,
  opener: (url: string, target: string) => unknown = open,
) {
  if (confirmationUrl) opener(confirmationUrl, "_top");
}
