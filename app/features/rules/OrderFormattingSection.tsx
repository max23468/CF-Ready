import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { hasManagedField, type Rules } from "../../config";
import { texts, type Locale } from "../../i18n";
import { ORDER_NORMALIZATION_SCOPES } from "../../order-normalization/domain";
import { hasGrantedScopes } from "../../primitives";
import { normalizesOrders } from "./rules-form";
import { RULES_INTENTS } from "./rules-intents";

async function orderScopesGranted() {
  const { granted } = await shopify.scopes.query();
  return hasGrantedScopes(ORDER_NORMALIZATION_SCOPES, granted);
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
  available,
  busy,
  onChange,
}: {
  locale: Locale;
  rules: Rules;
  savedEnabled: boolean;
  available: boolean;
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
    // Serve solo all'avviso: se App Bridge non risponde resta nascosto.
    orderScopesGranted()
      .then((granted) => {
        if (active) setScopeMissing(!granted);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [savedEnabled]);

  // D-213: dove l'opzione non è ancora disponibile resta visibile solo per chi l'ha attiva,
  // così può spegnerla.
  if (!hasManagedField(rules) || (!available && !savedEnabled)) return null;

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
