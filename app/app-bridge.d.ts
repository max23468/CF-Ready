// `@shopify/polaris-types` copre i componenti Polaris ma non quelli App Bridge. Uno shim evita
// una dipendenza in più per navigazione, Save Bar e finestra embedded
// (§20.1). Da rimuovere se i tipi App Bridge entrano nel pacchetto già installato.
import type { HTMLAttributes } from "react";

declare module "react" {
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
  type ShopifyWebVitalsMetric = {
    country?: string;
    id: string;
    name: string;
    value: number;
  };

  type ShopifyWebVitalsReport = {
    metrics: ShopifyWebVitalsMetric[];
  };

  const shopify: {
    loading(isLoading: boolean): void;
    webVitals: {
      onReport(
        callback: ((report: ShopifyWebVitalsReport) => void | Promise<void>) | null,
      ): Promise<void>;
    };
    reviews: { request(): Promise<{ success: boolean; code: string; message: string }> };
    saveBar: {
      show(id: string): Promise<void>;
      hide(id: string): Promise<void>;
    };
  };
}
