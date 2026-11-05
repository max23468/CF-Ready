import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { hasManagedField, type Rules } from "../../config";
import { texts, type Locale } from "../../i18n";
import { ORDER_NORMALIZATION_SCOPES } from "../../order-normalization/domain";
import { normalizesOrders } from "./rules-form";
import { RULES_INTENTS } from "./rules-intents";

async function orderScopesGranted() {
  const { granted } = await shopify.scopes.query();
  return ORDER_NORMALIZATION_SCOPES.every((scope) => granted.includes(scope));
}

async function requestOrderScopes() {
  const { result } = await shopify.scopes.request([...ORDER_NORMALIZATION_SCOPES]);
  return result === "granted-all";
}

// D-206: una sola spunta per Codice Fiscale e PEC. Gli scope ordini restano opzionali e si
// chiedono solo all'attivazione; senza campi gestiti la sezione non serve.
export function OrderFormattingSection({
  locale,
  rules,
  savedEnabled,
  busy,
  onChange,
}: {
  locale: Locale;
  rules: Rules;
  savedEnabled: boolean;
  busy: boolean;
  onChange: (checked: boolean) => void;
}) {
  const copy = texts(locale).rules.orderFormatting;
  const [scopeMissing, setScopeMissing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const resume = useFetcher();

  useEffect(() => {
    if (!savedEnabled) return;
    let active = true;
    orderScopesGranted()
      .then((granted) => {
        if (active) setScopeMissing(!granted);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [savedEnabled]);

  if (!hasManagedField(rules)) return null;

  const grant = async () => {
    setRequesting(true);
    try {
      const granted = (await orderScopesGranted()) || (await requestOrderScopes());
      setScopeMissing(!granted);
      return granted;
    } catch {
      return false;
    } finally {
      setRequesting(false);
    }
  };

  const change = async (checked: boolean) => {
    if (!checked) {
      onChange(false);
      return;
    }
    if (await grant()) onChange(true);
  };

  return (
    <div className="rules-layout__orders">
      <s-section heading={copy.heading}>
        <s-stack direction="block" gap="base">
          {savedEnabled && scopeMissing ? (
            <s-banner tone="warning">
              {copy.scopeMissing}
              <s-button
                slot="secondary-actions"
                disabled={requesting}
                onClick={async () => {
                  // Gli ordini arrivati senza permesso si correggono appena torna disponibile.
                  if (await grant()) {
                    await resume.submit(
                      { intent: RULES_INTENTS.resumeOrderNormalization },
                      { method: "post" },
                    );
                  }
                }}
              >
                {copy.grant}
              </s-button>
            </s-banner>
          ) : null}
          <s-checkbox
            label={copy.label}
            details={copy.details}
            checked={normalizesOrders(rules)}
            disabled={busy || requesting}
            onChange={(event) => void change(event.currentTarget.checked)}
          />
        </s-stack>
      </s-section>
    </div>
  );
}
