import { hasRequiredField, type Rules } from "../../config";
import { texts, type Locale } from "../../i18n";
import { b2bFieldsOptional } from "./rules-form";

// D-226: la spunta conta solo con almeno un campo obbligatorio, quindi solo allora compare.
export function B2bFieldsOptionalSection({
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
  const copy = texts(locale).rules.b2bFieldsOptional;
  return (
    <s-section heading={copy.heading}>
      <s-checkbox
        label={copy.label}
        details={copy.details}
        checked={b2bFieldsOptional(rules)}
        disabled={busy}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </s-section>
  );
}
