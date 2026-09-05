import { useState } from "react";
import { isValidPec, isValidTaxCode } from "../../checkout-field-validation";
import type { ErrorDisplay, Messages, Rules } from "../../config";
import { texts } from "../../i18n";
import type { Locale } from "../../i18n";
import "./CheckoutSimulator.css";
import {
  simulatorErrorMessage,
  simulatorFieldError,
  simulatorOutcome,
  simulatorScenarioValues,
} from "./checkout-simulator";
import type { SimulatorOutcome, SimulatorScenario } from "./checkout-simulator";

const outcomeTone: Record<SimulatorOutcome, "neutral" | "info" | "success" | "critical"> = {
  notApplied: "neutral",
  noChecks: "neutral",
  checkAtPayment: "info",
  blocked: "critical",
  ready: "success",
};

const outcomeIcon = {
  notApplied: "globe-europe",
  noChecks: "minus-circle",
  checkAtPayment: "clock",
  blocked: "alert-circle",
  ready: "check-circle",
} as const;

export function CheckoutSimulator({
  locale,
  rules,
  errorDisplay,
  messages,
}: {
  locale: Locale;
  rules: Rules;
  errorDisplay: ErrorDisplay;
  messages: Messages;
}) {
  const t = texts(locale);
  const copy = t.rules.simulator;
  const [deliveryCountry, setDeliveryCountry] = useState("IT");
  const [billingCountry, setBillingCountry] = useState("IT");
  const [taxCode, setTaxCode] = useState("");
  const [pec, setPec] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [scenario, setScenario] = useState<SimulatorScenario | "">("");

  const revealErrors = errorDisplay === "preventive" || submitted;
  const outcome = simulatorOutcome({
    rules,
    deliveryCountry,
    billingCountry,
    taxCode,
    pec,
    revealErrors,
  });

  const applies = outcome !== "notApplied";
  const taxCodeProblem =
    applies && rules.taxCode !== "unmanaged"
      ? simulatorFieldError(rules.taxCode, taxCode, isValidTaxCode)
      : null;
  const pecProblem =
    applies && rules.pec !== "unmanaged" ? simulatorFieldError(rules.pec, pec, isValidPec) : null;
  const hasManagedFields = Object.values(rules).some((mode) => mode !== "unmanaged");

  const inlineErrors = revealErrors && errorDisplay !== "preventive";
  const globalErrors =
    errorDisplay === "preventive"
      ? [
          {
            field: "taxCode",
            message: simulatorErrorMessage(messages, "taxCode", taxCodeProblem, revealErrors),
          },
          {
            field: "pec",
            message: simulatorErrorMessage(messages, "pec", pecProblem, revealErrors),
          },
        ].filter((error) => error.message)
      : [];

  const applyScenario = (nextScenario: SimulatorScenario) => {
    const values = simulatorScenarioValues[nextScenario];
    setScenario(nextScenario);
    setTaxCode(values.taxCode);
    setPec(values.pec);
    setSubmitted(true);
  };

  return (
    <s-query-container>
      <div
        style={{
          background: "#f1f5ef",
          borderRadius: "16px",
          padding: "6px",
        }}
      >
        <s-box background="transparent" border="base" borderRadius="large" overflow="hidden">
          <s-box padding="small-200">
            <s-grid
              gridTemplateColumns="@container (inline-size > 420px) 1fr auto, 1fr"
              alignItems="center"
              gap="small-200"
            >
              <s-grid gridTemplateColumns="auto 1fr" gap="small-200" alignItems="start">
                <s-avatar src="/favicon.svg" alt="CF Ready" size="large" />
                <s-stack direction="block" gap="small-100">
                  <span className="checkout-simulator__eyebrow">
                    <s-text color="subdued">{copy.eyebrow}</s-text>
                  </span>
                  <s-heading>{copy.heading}</s-heading>
                  <s-text color="subdued">{copy.privatePreview}</s-text>
                </s-stack>
              </s-grid>
              <span
                aria-atomic="true"
                aria-live="polite"
                className="checkout-simulator__outcome cf-motion-swap"
                key={outcome}
                role="status"
              >
                <s-badge tone={outcomeTone[outcome]} icon={outcomeIcon[outcome]}>
                  {copy.outcomes[outcome]}
                </s-badge>
              </span>
            </s-grid>
          </s-box>

          <s-divider />

          <s-box padding="small-200">
            <s-stack direction="block" gap="base">
              <s-box background="subdued" borderRadius="base" padding="small-200">
                <s-stack direction="block" gap="small-200">
                  <s-stack direction="inline" gap="small-100" alignItems="center">
                    <s-icon type="location" color="subdued" />
                    <s-text type="strong">{copy.orderContext}</s-text>
                  </s-stack>
                  <s-paragraph color="subdued">{t.rules.exceptions[0]}</s-paragraph>
                  <s-grid
                    gridTemplateColumns="@container (inline-size > 280px) 1fr 1fr, 1fr"
                    gap="small-200"
                  >
                    <SimulatorCountrySelect
                      label={copy.deliveryCountry}
                      value={deliveryCountry}
                      onChange={setDeliveryCountry}
                      copy={copy}
                    />
                    <SimulatorCountrySelect
                      label={copy.billingCountry}
                      value={billingCountry}
                      onChange={setBillingCountry}
                      copy={copy}
                    />
                  </s-grid>
                </s-stack>
              </s-box>

              <s-stack direction="block" gap="small-200">
                <s-stack direction="inline" gap="small-100" alignItems="center">
                  <s-icon type="identity-card" color="subdued" />
                  <s-text type="strong">{copy.customerData}</s-text>
                </s-stack>
                {globalErrors.length ? (
                  <s-banner tone="critical">
                    {globalErrors.map(({ field, message }) => (
                      <s-paragraph key={field}>{message}</s-paragraph>
                    ))}
                  </s-banner>
                ) : null}
                {hasManagedFields ? (
                  <>
                    {rules.taxCode === "unmanaged" ? null : (
                      <s-text-field
                        label={t.rules.taxCodeLabel}
                        value={taxCode}
                        required={rules.taxCode === "required_validated"}
                        error={simulatorErrorMessage(
                          messages,
                          "taxCode",
                          taxCodeProblem,
                          inlineErrors,
                        )}
                        onInput={(event) => {
                          setScenario("");
                          setTaxCode(event.currentTarget.value);
                        }}
                      />
                    )}
                    {rules.pec === "unmanaged" ? null : (
                      <s-text-field
                        label={t.rules.pecLabel}
                        value={pec}
                        required={rules.pec === "required_validated"}
                        error={simulatorErrorMessage(messages, "pec", pecProblem, inlineErrors)}
                        onInput={(event) => {
                          setScenario("");
                          setPec(event.currentTarget.value);
                        }}
                      />
                    )}
                  </>
                ) : (
                  <s-box background="subdued" borderRadius="base" padding="base">
                    <s-paragraph color="subdued">{t.checkout.nothing}</s-paragraph>
                  </s-box>
                )}
              </s-stack>
            </s-stack>
          </s-box>

          <s-divider />

          <s-box background="subdued" padding="small-200">
            <div className="checkout-simulator__actions">
              <div className="checkout-simulator__secondary-actions">
                <div className="checkout-simulator__scenario-copy">
                  <s-text type="strong">{copy.scenarioLabel}</s-text>
                  <s-text color="subdued">{copy.scenarioHelp}</s-text>
                </div>
                <div className="checkout-simulator__scenario">
                  <s-select
                    label={copy.scenarioLabel}
                    labelAccessibilityVisibility="exclusive"
                    placeholder={copy.scenarioPlaceholder}
                    value={scenario}
                    onChange={(event) =>
                      applyScenario(event.currentTarget.value as SimulatorScenario)
                    }
                  >
                    <s-option value="valid">{copy.scenarios.valid}</s-option>
                    {rules.taxCode === "unmanaged" ? null : (
                      <s-option value="invalidTaxCode">{copy.scenarios.invalidTaxCode}</s-option>
                    )}
                    {rules.pec === "unmanaged" ? null : (
                      <s-option value="invalidPec">{copy.scenarios.invalidPec}</s-option>
                    )}
                    <s-option value="empty">{copy.scenarios.empty}</s-option>
                  </s-select>
                </div>
                <button
                  type="button"
                  className="checkout-simulator__button checkout-simulator__button--clear"
                  onClick={() => {
                    setScenario("");
                    setTaxCode("");
                    setPec("");
                    setSubmitted(false);
                  }}
                >
                  {copy.clear}
                </button>
              </div>
              <button
                type="button"
                className="checkout-simulator__button checkout-simulator__button--primary"
                onClick={() => setSubmitted(true)}
              >
                {copy.continue}
              </button>
            </div>
          </s-box>
        </s-box>
      </div>
    </s-query-container>
  );
}

function SimulatorCountrySelect({
  label,
  value,
  onChange,
  copy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  copy: ReturnType<typeof texts>["rules"]["simulator"];
}) {
  return (
    <s-select
      label={label}
      value={value || "unknown"}
      onChange={(event) =>
        onChange(event.currentTarget.value === "unknown" ? "" : event.currentTarget.value)
      }
    >
      <s-option value="unknown">{copy.unknownCountry}</s-option>
      <s-option value="IT">{copy.countries.IT}</s-option>
      <s-option value="FR">{copy.countries.FR}</s-option>
      <s-option value="DE">{copy.countries.DE}</s-option>
    </s-select>
  );
}
