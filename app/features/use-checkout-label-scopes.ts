import { useState } from "react";
import { useRevalidator } from "react-router";
import type { AppErrorCode } from "../app-error";
import { CHECKOUT_LABEL_OPTIONAL_SCOPES } from "../checkout-labels/domain";

export function useCheckoutLabelScopeRequest() {
  const revalidator = useRevalidator();
  const [scopeRequestBusy, setScopeRequestBusy] = useState(false);
  const [scopeRequestError, setScopeRequestError] = useState<AppErrorCode | null>(null);

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

  return {
    requestPermissions,
    revalidationBusy: revalidator.state !== "idle",
    scopeRequestBusy,
    scopeRequestError,
  };
}
