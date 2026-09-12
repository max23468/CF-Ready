import { useReducer, useState } from "react";
import { isValidPec, isValidTaxCode } from "../../checkout-field-validation";
import type { Messages, Rules } from "../../config";
import { texts } from "../../i18n";
import type { Locale } from "../../i18n";
import { checkoutLabelCopy } from "../../checkout-labels/domain";
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
  messages: Messages | Record<Locale, Messages>;
}) {
  const [selectedPreviewLocale, setSelectedPreviewLocale] = useState<Locale | null>(null);
  const previewLocale = selectedPreviewLocale ?? locale;
  const t = texts(previewLocale);
  const copy = t.rules.simulator;
  const [state, updateState] = useReducer(updateSimulatorState, initialSimulatorState);
  const { deliveryCountry, billingCountry, company, taxCode, pec, submitted, scenario } = state;
  const previewMessages = messagesForLocale(messages, previewLocale);

  const outcome = simulatorOutcome({
    rules,
    deliveryCountry,
    billingCountry,
    company,
    taxCode,
    pec,
    submitted,
  });

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
            <s-stack direction="block" gap="small-200">
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
              <s-select
                label={copy.previewLanguage}
                value={previewLocale}
                onChange={(event) => setSelectedPreviewLocale(event.currentTarget.value as Locale)}
              >
                <s-option value="it">{copy.italian}</s-option>
                <s-option value="en">{copy.english}</s-option>
              </s-select>
            </s-stack>
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

              <SimulatorCustomerFields
                locale={previewLocale}
                rules={rules}
                messages={previewMessages}
                outcome={outcome}
                submitted={submitted}
                company={company}
                taxCode={taxCode}
                pec={pec}
                onCompanyChange={(value) => updateState({ scenario: "", company: value })}
                onTaxCodeChange={(value) => {
                  updateState({ scenario: "", taxCode: value });
                }}
                onPecChange={(value) => {
                  updateState({ scenario: "", pec: value });
                }}
              />
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

function messagesForLocale(messages: Messages | Record<Locale, Messages>, locale: Locale) {
  return "it" in messages ? messages[locale] : messages;
}

function SimulatorCustomerFields({
  locale,
  rules,
  messages,
  outcome,
  submitted,
  company,
  taxCode,
  pec,
  onCompanyChange,
  onTaxCodeChange,
  onPecChange,
}: {
  locale: Locale;
  rules: Rules;
  messages: Messages;
  outcome: SimulatorOutcome;
  submitted: boolean;
  company: string;
  taxCode: string;
  pec: string;
  onCompanyChange: (value: string) => void;
  onTaxCodeChange: (value: string) => void;
  onPecChange: (value: string) => void;
}) {
  const t = texts(locale);
  const copy = t.rules.simulator;
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

  return (
    <s-stack direction="block" gap="small-200">
      <s-stack direction="inline" gap="small-100" alignItems="center">
        <s-icon type="identity-card" color="subdued" />
        <s-text type="strong">{copy.customerData}</s-text>
      </s-stack>
      <s-text color="subdued">{copy.labelsAfterSave}</s-text>
      {hasManagedFields ? (
        <>
          <SimulatorCompanyField
            mode={rules.pec}
            label={copy.company}
            value={company}
            onInput={onCompanyChange}
          />
          {rules.taxCode === "unmanaged" ? null : (
            <s-text-field
              label={checkoutLabelCopy("taxCode", locale, rules.taxCode)!}
              value={taxCode}
              required={rules.taxCode === "required_validated"}
              error={simulatorErrorMessage(
                messages,
                "taxCode",
                taxCodeProblem,
                taxCodeProblem === "invalid" || submitted,
              )}
              onInput={(event) => onTaxCodeChange(event.currentTarget.value)}
            />
          )}
          {rules.pec === "unmanaged" ? null : (
            <s-text-field
              label={checkoutLabelCopy("pec", locale, rules.pec)!}
              value={pec}
              required={pecIsRequired(rules.pec, company)}
              error={simulatorErrorMessage(
                messages,
                "pec",
                pecProblem,
                pecProblem === "invalid" || submitted,
              )}
              onInput={(event) => onPecChange(event.currentTarget.value)}
            />
          )}
        </>
      ) : (
        <s-box background="subdued" borderRadius="base" padding="base">
          <s-paragraph color="subdued">{t.checkout.nothing}</s-paragraph>
        </s-box>
      )}
    </s-stack>
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
