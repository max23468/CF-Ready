// `@shopify/polaris-types` copre i componenti Polaris ma non quelli App Bridge: navigazione e
// Save Bar non hanno quindi un tipo. Uno shim evita una dipendenza in più per tre elementi
// (§20.1). Da rimuovere se i tipi App Bridge entrano nel pacchetto già installato.
import type { HTMLAttributes } from "react";

declare module "react" {
  // I bottoni dentro `ui-save-bar` sono `<button>` nativi che App Bridge stila con `variant`.
  interface ButtonHTMLAttributes<T> {
    variant?: "primary";
  }

  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": HTMLAttributes<HTMLElement>;
      "ui-save-bar": HTMLAttributes<HTMLElement> & { id: string };
      "s-app-window": HTMLAttributes<HTMLElement> & { id: string; src: string };
    }
  }
}

declare global {
  const shopify: {
    loading(isLoading: boolean): void;
    reviews: { request(): Promise<{ success: boolean; code: string; message: string }> };
    saveBar: {
      show(id: string): Promise<void>;
      hide(id: string): Promise<void>;
    };
  };
}
