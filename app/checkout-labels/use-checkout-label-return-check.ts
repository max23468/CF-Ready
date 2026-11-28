import { useEffect } from "react";
import { useRevalidator } from "react-router";

export function useCheckoutLabelReturnCheck(enabled: boolean) {
  const { state, revalidate } = useRevalidator();

  useEffect(() => {
    if (!enabled || state !== "idle") return;

    // Al ritorno Shopify può ridare il focus al frame senza cambiare la visibilità del documento.
    let requested = false;
    const check = () => {
      if (requested || document.visibilityState !== "visible") return;
      requested = true;
      void revalidate();
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [enabled, revalidate, state]);
}
