import { hasRequiredField, type Rules } from "../../config";
import { texts, type Locale } from "../../i18n";
import { blocksAbsentWithoutDelivery } from "./rules-form";

// D-192: la spunta conta solo se almeno un campo è obbligatorio, quindi senza resta nascosta.
export function AbsentWithoutDeliverySection({
  locale,
  rules,
  busy,
  onChange,
}: {
  locale: Locale;
  rules: Rules;
  busy: boolean;
  onChange: (checked: boolean) => void;
}) {
  if (!hasRequiredField(rules)) return null;
  const copy = texts(locale).rules.absentWithoutDelivery;
  return (
    <div className="rules-layout__absent">
      <s-section heading={copy.heading}>
        <s-checkbox
          label={copy.label}
          details={copy.details}
          checked={blocksAbsentWithoutDelivery(rules)}
          disabled={busy}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      </s-section>
    </div>
  );
}
