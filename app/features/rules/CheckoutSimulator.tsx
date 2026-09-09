import { useReducer } from "react";
import { isValidPec, isValidTaxCode } from "../../checkout-field-validation";
import type { Messages, Rules } from "../../config";
import { texts } from "../../i18n";
import type { Locale } from "../../i18n";
import "./CheckoutSimulator.css";
import {
  simulatorErrorMessage,
  simulatorFieldError,
  simulatorOutcome,
  simulatorScenarioValues,
  pecIsRequired,
} from "./checkout-simulator";
import type { SimulatorOutcome, SimulatorScenario } from "./checkout-simulator";

const outcomeTone: Record<SimulatorOutcome, "neutral" | "info" | "success" | "critical"> = {
  notApplied: "neutral",
  noChecks: "neutral",
  editing: "info",
  blocked: "critical",
  ready: "success",
};

const outcomeIcon = {
  notApplied: "globe-europe",
  noChecks: "minus-circle",
  editing: "clock",
  blocked: "alert-circle",
  ready: "check-circle",
} as const;

type SimulatorState = {
  deliveryCountry: string;
  billingCountry: string;
  company: string;
  taxCode: string;
  pec: string;
  submitted: boolean;
  scenario: SimulatorScenario | "";
};

const initialSimulatorState: SimulatorState = {
  deliveryCountry: "IT",
  billingCountry: "IT",
  company: "",
  taxCode: "",
  pec: "",
  submitted: false,
  scenario: "",
};

function updateSimulatorState(current: SimulatorState, patch: Partial<SimulatorState>) {
  return { ...current, ...patch };
}

export function CheckoutSimulator({
  locale,
  rules,
  messages,
}: {
  locale: Locale;
  rules: Rules;
  messages: Messages;
}) {
  const t = texts(locale);
  const copy = t.rules.simulator;
  const [state, updateState] = useReducer(updateSimulatorState, initialSimulatorState);
  const { deliveryCountry, billingCountry, company, taxCode, pec, submitted, scenario } = state;

  const outcome = simulatorOutcome({
    rules,
    deliveryCountry,
    billingCountry,
    company,
    taxCode,
    pec,
    submitted,
  });

  const applies = outcome !== "notApplied";
  const taxCodeProblem =
    applies && rules.taxCode !== "unmanaged"
      ? simulatorFieldError(rules.taxCode, taxCode, isValidTaxCode)
      : null;
  const pecProblem =
    applies && rules.pec !== "unmanaged"
      ? simulatorFieldError(rules.pec, pec, isValidPec, pecIsRequired(rules.pec, company))
      : null;
  const hasManagedFields = Object.values(rules).some((mode) => mode !== "unmanaged");

  const showTaxCodeError = taxCodeProblem === "invalid" || submitted;
  const showPecError = pecProblem === "invalid" || submitted;

  const applyScenario = (nextScenario: SimulatorScenario) => {
    const values = simulatorScenarioValues[nextScenario];
    updateState({ ...values, scenario: nextScenario, submitted: true });
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
                      onChange={(value) => updateState({ deliveryCountry: value })}
                      copy={copy}
                    />
                    <SimulatorCountrySelect
                      label={copy.billingCountry}
                      value={billingCountry}
                      onChange={(value) => updateState({ billingCountry: value })}
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
                {hasManagedFields ? (
                  <>
                    <SimulatorCompanyField
                      mode={rules.pec}
                      label={copy.company}
                      value={company}
                      onInput={(value) => updateState({ scenario: "", company: value })}
                    />
                    {rules.taxCode === "unmanaged" ? null : (
                      <s-text-field
                        label={t.rules.taxCodeLabel}
                        value={taxCode}
                        required={rules.taxCode === "required_validated"}
                        error={simulatorErrorMessage(
                          messages,
                          "taxCode",
                          taxCodeProblem,
                          showTaxCodeError,
                        )}
                        onInput={(event) => {
                          updateState({ scenario: "", taxCode: event.currentTarget.value });
                        }}
                      />
                    )}
                    {rules.pec === "unmanaged" ? null : (
                      <s-text-field
                        label={t.rules.pecLabel}
                        value={pec}
                        required={pecIsRequired(rules.pec, company)}
                        error={simulatorErrorMessage(messages, "pec", pecProblem, showPecError)}
                        onInput={(event) => {
                          updateState({ scenario: "", pec: event.currentTarget.value });
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
                    <SimulatorScenarioOptions rules={rules} copy={copy} />
                  </s-select>
                </div>
                <button
                  type="button"
                  className="checkout-simulator__button checkout-simulator__button--clear"
                  onClick={() =>
                    updateState({
                      company: "",
                      taxCode: "",
                      pec: "",
                      submitted: false,
                      scenario: "",
                    })
                  }
                >
                  {copy.clear}
                </button>
              </div>
              <button
                type="button"
                className="checkout-simulator__button checkout-simulator__button--primary"
                onClick={() => updateState({ submitted: true })}
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

function SimulatorCompanyField({
  mode,
  label,
  value,
  onInput,
}: {
  mode: Rules["pec"];
  label: string;
  value: string;
  onInput: (value: string) => void;
}) {
  if (mode !== "required_when_company") return null;
  return (
    <s-text-field
      label={label}
      value={value}
      onInput={(event) => onInput(event.currentTarget.value)}
    />
  );
}

function SimulatorScenarioOptions({
  rules,
  copy,
}: {
  rules: Rules;
  copy: ReturnType<typeof texts>["rules"]["simulator"];
}) {
  return (
    <>
      <s-option value="valid">{copy.scenarios.valid}</s-option>
      {rules.taxCode === "unmanaged" ? null : (
        <s-option value="invalidTaxCode">{copy.scenarios.invalidTaxCode}</s-option>
      )}
      {rules.pec === "unmanaged" ? null : (
        <s-option value="invalidPec">{copy.scenarios.invalidPec}</s-option>
      )}
      {rules.pec === "required_when_company" ? (
        <s-option value="companyWithoutPec">{copy.scenarios.companyWithoutPec}</s-option>
      ) : null}
      <s-option value="empty">{copy.scenarios.empty}</s-option>
    </>
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
