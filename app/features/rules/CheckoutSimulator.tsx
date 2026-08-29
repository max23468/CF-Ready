import { useState } from "react";
import { isValidPec, isValidTaxCode } from "../../checkout-field-validation";
import type { ErrorDisplay, Messages, Rules } from "../../config";
import { texts } from "../../i18n";
import type { Locale } from "../../i18n";
import "./CheckoutSimulator.css";
import { simulatorErrorMessage, simulatorFieldError, simulatorOutcome } from "./checkout-simulator";
import type { SimulatorOutcome } from "./checkout-simulator";

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

  const applies = deliveryCountry === "IT" && billingCountry === "IT";
  const revealErrors = applies && (errorDisplay === "preventive" || submitted);
  const taxCodeProblem =
    applies && rules.taxCode !== "unmanaged"
      ? simulatorFieldError(rules.taxCode, taxCode, isValidTaxCode)
      : null;
  const pecProblem =
    applies && rules.pec !== "unmanaged" ? simulatorFieldError(rules.pec, pec, isValidPec) : null;
  const hasManagedFields = rules.taxCode !== "unmanaged" || rules.pec !== "unmanaged";
  const outcome = simulatorOutcome({
    rules,
    deliveryCountry,
    billingCountry,
    taxCode,
    pec,
    revealErrors,
  });

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
                  <s-text color="subdued">{copy.eyebrow}</s-text>
                  <s-heading>{copy.heading}</s-heading>
                  <s-text color="subdued">{copy.privatePreview}</s-text>
                </s-stack>
              </s-grid>
              <s-badge tone={outcomeTone[outcome]} icon={outcomeIcon[outcome]} size="large">
                {copy.outcomes[outcome]}
              </s-badge>
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
                    <s-select
                      label={copy.deliveryCountry}
                      value={deliveryCountry}
                      onChange={(event) => setDeliveryCountry(event.currentTarget.value)}
                    >
                      <s-option value="IT">{copy.countries.IT}</s-option>
                      <s-option value="FR">{copy.countries.FR}</s-option>
                      <s-option value="DE">{copy.countries.DE}</s-option>
                    </s-select>
                    <s-select
                      label={copy.billingCountry}
                      value={billingCountry}
                      onChange={(event) => setBillingCountry(event.currentTarget.value)}
                    >
                      <s-option value="IT">{copy.countries.IT}</s-option>
                      <s-option value="FR">{copy.countries.FR}</s-option>
                      <s-option value="DE">{copy.countries.DE}</s-option>
                    </s-select>
                  </s-grid>
                </s-stack>
              </s-box>

              <s-stack direction="block" gap="small-200">
                <s-stack direction="inline" gap="small-100" alignItems="center">
                  <s-icon type="identity-card" color="subdued" />
                  <s-text type="strong">{copy.customerData}</s-text>
                </s-stack>
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
                          revealErrors,
                        )}
                        onInput={(event) => setTaxCode(event.currentTarget.value)}
                      />
                    )}
                    {rules.pec === "unmanaged" ? null : (
                      <s-text-field
                        label={t.rules.pecLabel}
                        value={pec}
                        required={rules.pec === "required_validated"}
                        error={simulatorErrorMessage(messages, "pec", pecProblem, revealErrors)}
                        onInput={(event) => setPec(event.currentTarget.value)}
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
                <button
                  type="button"
                  className="checkout-simulator__button checkout-simulator__button--valid"
                  onClick={() => {
                    setTaxCode("RSSMRA85T10A562S");
                    setPec("mario.rossi@example.com");
                  }}
                >
                  {copy.validExamples}
                </button>
                <button
                  type="button"
                  className="checkout-simulator__button checkout-simulator__button--clear"
                  onClick={() => {
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
