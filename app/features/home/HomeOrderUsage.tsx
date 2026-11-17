import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";
import { texts, type Locale } from "../../i18n";
import type { HomeOrderUsage as Usage } from "./home.server";

const ORDER_USAGE_SCOPES = ["read_orders"];
const NUMBER_FORMATS: Record<Locale, Intl.NumberFormat> = {
  it: new Intl.NumberFormat("it"),
  en: new Intl.NumberFormat("en"),
};

// D-231, BFS 4.2.3: dato non statico della Home. Lo scope della sessione decide la forma al
// primo paint e il conteggio in streaming riempie soltanto i valori, così la pagina non si
// sposta. Se lo scope salvato è in ritardo, vale la risposta di Shopify.
export function HomeOrderUsage({
  usage,
  scopeHint,
  locale,
}: {
  usage: Promise<Usage> | null;
  scopeHint: boolean;
  locale: Locale;
}) {
  const copy = texts(locale).home.orderUsage;
  const settled = useResolved(usage);
  const resolved: Usage | null = settled ?? (scopeHint ? null : { status: "no_scope" });
  const revalidator = useRevalidator();
  const [requesting, setRequesting] = useState(false);
  if (!usage) return null;

  const grant = async () => {
    setRequesting(true);
    try {
      const { result } = await shopify.scopes.request(ORDER_USAGE_SCOPES);
      if (result === "granted-all") await revalidator.revalidate();
    } catch {
      // Se App Bridge non risponde la card resta com'è e il merchant può riprovare.
    } finally {
      setRequesting(false);
    }
  };

  const number = NUMBER_FORMATS[locale];
  const value = (count: number) =>
    resolved?.status === "ok" && resolved.truncated
      ? copy.atLeast(number.format(count))
      : number.format(count);

  return (
    <s-section heading={copy.heading} data-layout-region="order-usage">
      {resolved?.status === "no_scope" ? (
        <s-stack direction="block" gap="small-200" alignItems="start">
          <s-paragraph>{copy.noScope}</s-paragraph>
          <s-button loading={requesting} disabled={requesting} onClick={() => void grant()}>
            {copy.grant}
          </s-button>
        </s-stack>
      ) : resolved?.status === "unavailable" ? (
        <s-paragraph color="subdued">{copy.unavailable}</s-paragraph>
      ) : (
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          {(
            [
              ["taxCode", copy.taxCode],
              ["pec", copy.pec],
            ] as const
          ).map(([key, label]) => (
            <s-stack key={key} direction="block" gap="small-100">
              <s-text color="subdued">{label}</s-text>
              <s-heading>{resolved?.status === "ok" ? value(resolved[key]) : "–"}</s-heading>
            </s-stack>
          ))}
        </s-grid>
      )}
    </s-section>
  );
}

function useResolved(usage: Promise<Usage> | null) {
  const [settled, setSettled] = useState<{ source: Promise<Usage>; value: Usage } | null>(null);
  useEffect(() => {
    if (!usage) return;
    let current = true;
    usage.then(
      (value) => current && setSettled({ source: usage, value }),
      () => current && setSettled({ source: usage, value: { status: "unavailable" } }),
    );
    return () => {
      current = false;
    };
  }, [usage]);
  return settled?.source === usage ? settled.value : null;
}
