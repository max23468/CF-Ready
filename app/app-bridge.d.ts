// `@shopify/polaris-types` copre i componenti Polaris ma non quelli App Bridge: la navigazione
// dell'app non ha quindi un tipo. Uno shim di tipi evita una dipendenza in più per due elementi
// (§20.1). Da rimuovere se i tipi App Bridge diventano parte del pacchetto già installato.
import type { HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": HTMLAttributes<HTMLElement>;
    }
  }
}
