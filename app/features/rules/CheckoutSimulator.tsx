import { useEffect, useReducer, useRef, useState } from "react";
import {
  diagnosePec,
  isValidPec,
  isValidTaxCode,
  requiredFieldsAreDue,
} from "../../checkout-field-validation";
import type { Messages, Rules } from "../../config";
import { texts } from "../../i18n";
import type { Locale } from "../../i18n";
import { checkoutLabelCopy } from "../../checkout-labels/domain";
import { BrandMark } from "../../ui-brand";
import { Disclosure } from "../../ui-disclosure";
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
  step: "CHECKOUT_INTERACTION" | "CHECKOUT_COMPLETION";
  shippingSelected: boolean;
  mixedDelivery: boolean;
  taxCodePresent: boolean;
  pecPresent: boolean;
  scenario: SimulatorScenario | "";
};

const initialSimulatorState: SimulatorState = {
  deliveryCountry: "IT",
  billingCountry: "IT",
  company: "",
  taxCode: "",
  pec: "",
  step: "CHECKOUT_INTERACTION",
  shippingSelected: false,
  mixedDelivery: false,
  taxCodePresent: true,
  pecPresent: true,
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
  const [continueCount, setContinueCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    deliveryCountry,
    billingCountry,
    company,
    taxCode,
    pec,
    step,
    shippingSelected,
    mixedDelivery,
    taxCodePresent,
    pecPresent,
    scenario,
  } = state;
  const previewMessages = messagesForLocale(messages, previewLocale);
  const deliveryGroups = deliveryCountry
    ? [
        { countryCode: deliveryCountry, selectedDeliveryOption: shippingSelected },
        ...(mixedDelivery ? [{ countryCode: "FR", selectedDeliveryOption: shippingSelected }] : []),
      ]
    : [];

  const outcome = simulatorOutcome({
    rules,
    billingCountry,
    company,
    taxCode,
    pec,
    step,
    deliveryGroups,
    taxCodePresent,
    pecPresent,
  });

  // R-S2: come nel checkout reale, "Continua" porta al primo campo da correggere. Gli errori
  // allungano il blocco sopra il bottone: senza questo il clic successivo cade sulla select.
  useEffect(() => {
    if (continueCount === 0) return;
    const field =
      rootRef.current?.querySelector<HTMLElement>(".checkout-simulator__missing-fields") ??
      [
        ...(rootRef.current?.querySelectorAll<HTMLElement & { error?: string }>("s-text-field") ??
          []),
      ].find((element) => element.error);
    if (!field) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // L'host Polaris è `display: contents`: si fa scorrere il primo box reale del campo.
    const box = field.shadowRoot?.firstElementChild ?? field;
    box.scrollIntoView?.({ block: "center", behavior: reduced ? "auto" : "smooth" });
    field.focus({ preventScroll: true });
  }, [continueCount]);

  const applyScenario = (nextScenario: SimulatorScenario) => {
    const values = simulatorScenarioValues[nextScenario];
    updateState({
      ...values,
      scenario: nextScenario,
      shippingSelected: true,
      taxCodePresent: true,
      pecPresent: true,
    });
  };

  return (
    <s-query-container>
      <div
        ref={rootRef}
        lang={previewLocale}
        style={{
          background: "#f1f5ef",
          borderRadius: "16px",
          padding: "0",
        }}
      >
        <s-box background="transparent" border="base" borderRadius="large" overflow="hidden">
          <s-box padding="@container (inline-size > 420px) small-200, small-100">
            <s-stack direction="block" gap="small-200">
              <s-grid gridTemplateColumns="auto 1fr" gap="small-200" alignItems="center">
                <BrandMark />
                <s-heading>{copy.heading}</s-heading>
              </s-grid>
            </s-stack>
          </s-box>

          <s-divider />

          <s-box padding="@container (inline-size > 420px) small-200, small-100">
            <s-stack direction="block" gap="base">
              <s-box background="transparent" borderRadius="base" padding="none">
                <s-stack direction="block" gap="small-200">
                  <s-stack direction="inline" gap="small-100" alignItems="center">
                    <s-icon type="location" color="subdued" />
                    <s-text type="strong">{copy.orderContext}</s-text>
                  </s-stack>
                  <Disclosure summary={t.rules.exceptionsHeading}>
                    <s-box paddingBlockStart="small-100">
                      <s-paragraph color="subdued">{t.rules.exceptions[0]}</s-paragraph>
                    </s-box>
                  </Disclosure>
                  <s-grid
                    gridTemplateColumns="@container (inline-size > 280px) 1fr 1fr, 1fr"
                    alignItems="end"
                    gap="small-200"
                  >
                    <SimulatorCountrySelect
                      key={`delivery-${previewLocale}`}
                      label={copy.deliveryCountry}
                      value={deliveryCountry}
                      onChange={(value) => updateState({ deliveryCountry: value })}
                      copy={copy}
                    />
                    <SimulatorCountrySelect
                      key={`billing-${previewLocale}`}
                      label={copy.billingCountry}
                      value={billingCountry}
                      onChange={(value) => updateState({ billingCountry: value })}
                      copy={copy}
                    />
                  </s-grid>
                  <Disclosure summary={copy.advanced}>
                    <s-box paddingBlockStart="small-200">
                      <s-stack direction="block" gap="small-200">
                        <s-select
                          label={copy.previewLanguage}
                          value={previewLocale}
                          onChange={(event) =>
                            setSelectedPreviewLocale(event.currentTarget.value as Locale)
                          }
                        >
                          <s-option value="it">{copy.italian}</s-option>
                          <s-option value="en">{copy.english}</s-option>
                        </s-select>
                        <s-select
                          key={`stage-${previewLocale}`}
                          label={copy.checkoutStep}
                          value={step}
                          onChange={(event) =>
                            updateState({
                              step: event.currentTarget.value as SimulatorState["step"],
                            })
                          }
                        >
                          <s-option value="CHECKOUT_INTERACTION">{copy.interaction}</s-option>
                          <s-option value="CHECKOUT_COMPLETION">{copy.completion}</s-option>
                        </s-select>
                        <s-checkbox
                          label={copy.shippingSelected}
                          checked={shippingSelected}
                          onChange={(event) =>
                            updateState({ shippingSelected: event.currentTarget.checked })
                          }
                        />
                        <s-checkbox
                          label={copy.mixedDelivery}
                          checked={mixedDelivery}
                          onChange={(event) =>
                            updateState({ mixedDelivery: event.currentTarget.checked })
                          }
                        />
                        <s-checkbox
                          label={copy.taxCodePresent}
                          checked={taxCodePresent}
                          onChange={(event) =>
                            updateState({ taxCodePresent: event.currentTarget.checked })
                          }
                        />
                        <s-checkbox
                          label={copy.pecPresent}
                          checked={pecPresent}
                          onChange={(event) =>
                            updateState({ pecPresent: event.currentTarget.checked })
                          }
                        />
                      </s-stack>
                    </s-box>
                  </Disclosure>
                </s-stack>
              </s-box>

              <SimulatorCustomerFields
                locale={previewLocale}
                rules={rules}
                messages={previewMessages}
                outcome={outcome}
                requiredErrorsDue={requiredFieldsAreDue(step, deliveryGroups)}
                absentRequiredFieldsDue={step === "CHECKOUT_COMPLETION" && deliveryCountry === "IT"}
                company={company}
                taxCode={taxCode}
                pec={pec}
                taxCodePresent={taxCodePresent}
                pecPresent={pecPresent}
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

          <s-box
            background="subdued"
            padding="@container (inline-size > 420px) small-200, small-100"
          >
            <div className="checkout-simulator__actions">
              <div className="checkout-simulator__secondary-actions">
                <div className="checkout-simulator__scenario-copy">
                  <s-text type="strong">{copy.scenarioLabel}</s-text>
                  <s-text color="subdued">{copy.scenarioHelp}</s-text>
                </div>
                <div className="checkout-simulator__scenario">
                  <s-select
                    key={`scenario-${previewLocale}`}
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
                <s-button
                  onClick={() =>
                    updateState({
                      company: "",
                      taxCode: "",
                      pec: "",
                      scenario: "",
                    })
                  }
                >
                  {copy.clear}
                </s-button>
              </div>
              {/* R-S1: l'esito sta accanto al comando, in vista mentre si compilano i campi. */}
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
              <button
                type="button"
                className="checkout-simulator__button checkout-simulator__button--primary"
                onClick={() => {
                  updateState({ shippingSelected: true });
                  setContinueCount((count) => count + 1);
                }}
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
  requiredErrorsDue,
  absentRequiredFieldsDue,
  company,
  taxCode,
  pec,
  taxCodePresent,
  pecPresent,
  onCompanyChange,
  onTaxCodeChange,
  onPecChange,
}: {
  locale: Locale;
  rules: Rules;
  messages: Messages;
  outcome: SimulatorOutcome;
  requiredErrorsDue: boolean;
  absentRequiredFieldsDue: boolean;
  company: string;
  taxCode: string;
  pec: string;
  taxCodePresent: boolean;
  pecPresent: boolean;
  onCompanyChange: (value: string) => void;
  onTaxCodeChange: (value: string) => void;
  onPecChange: (value: string) => void;
}) {
  const t = texts(locale);
  const copy = t.rules.simulator;
  const applies = outcome !== "notApplied";
  const hasManagedFields = Object.values(rules).some((mode) => mode !== "unmanaged");
  const missingFields =
    applies && absentRequiredFieldsDue
      ? [
          !taxCodePresent && rules.taxCode === "required_validated"
            ? checkoutLabelCopy("taxCode", locale, rules.taxCode)
            : null,
          !pecPresent && pecIsRequired(rules.pec, company)
            ? checkoutLabelCopy("pec", locale, rules.pec)
            : null,
        ].filter((label) => label !== null)
      : [];

  return (
    <s-stack direction="block" gap="small-200">
      <s-stack direction="inline" gap="small-100" alignItems="center">
        <s-icon type="identity-card" color="subdued" />
        <s-text type="strong">{copy.customerData}</s-text>
      </s-stack>
      {missingFields.length > 0 ? (
        <div className="checkout-simulator__missing-fields" tabIndex={-1}>
          <s-banner tone="critical">
            <s-stack direction="block" gap="small-100">
              {missingFields.map((label) => (
                <s-paragraph key={label}>{copy.missingRequiredField(label)}</s-paragraph>
              ))}
              <s-paragraph>{copy.showMissingFields}</s-paragraph>
            </s-stack>
          </s-banner>
        </div>
      ) : null}
      {hasManagedFields ? (
        <>
          <SimulatorCompanyField
            mode={rules.pec}
            label={copy.company}
            value={company}
            onInput={onCompanyChange}
          />
          <SimulatorTaxCodeField
            locale={locale}
            mode={rules.taxCode}
            messages={messages}
            value={taxCode}
            present={taxCodePresent}
            applies={applies}
            requiredErrorsDue={requiredErrorsDue}
            onInput={onTaxCodeChange}
          />
          <SimulatorPecField
            locale={locale}
            mode={rules.pec}
            messages={messages}
            company={company}
            value={pec}
            present={pecPresent}
            applies={applies}
            requiredErrorsDue={requiredErrorsDue}
            onInput={onPecChange}
          />
        </>
      ) : (
        <s-box background="subdued" borderRadius="base" padding="base">
          <s-paragraph color="subdued">{t.checkout.nothing}</s-paragraph>
        </s-box>
      )}
      <s-text color="subdued">{copy.labelsAfterSave}</s-text>
    </s-stack>
  );
}

function SimulatorTaxCodeField({
  locale,
  mode,
  messages,
  value,
  present,
  applies,
  requiredErrorsDue,
  onInput,
}: {
  locale: Locale;
  mode: Rules["taxCode"];
  messages: Messages;
  value: string;
  present: boolean;
  applies: boolean;
  requiredErrorsDue: boolean;
  onInput: (value: string) => void;
}) {
  if (mode === "unmanaged" || !present) return null;
  const problem = applies ? simulatorFieldError(mode, value, isValidTaxCode) : null;
  return (
    <s-text-field
      label={checkoutLabelCopy("taxCode", locale, mode)!}
      value={value}
      required={applies && mode === "required_validated"}
      error={simulatorErrorMessage(
        messages,
        "taxCode",
        problem,
        problem === "invalid" || requiredErrorsDue,
        value,
        locale,
      )}
      onInput={(event) => onInput(event.currentTarget.value)}
    />
  );
}

function SimulatorPecField({
  locale,
  mode,
  messages,
  company,
  value,
  present,
  applies,
  requiredErrorsDue,
  onInput,
}: {
  locale: Locale;
  mode: Rules["pec"];
  messages: Messages;
  company: string;
  value: string;
  present: boolean;
  applies: boolean;
  requiredErrorsDue: boolean;
  onInput: (value: string) => void;
}) {
  if (mode === "unmanaged" || !present) return null;
  const required = applies && pecIsRequired(mode, company);
  const problem = applies ? simulatorFieldError(mode, value, isValidPec, required) : null;
  const copy = texts(locale).rules.simulator;
  return (
    <s-text-field
      label={checkoutLabelCopy("pec", locale, mode)!}
      value={value}
      required={required}
      error={simulatorErrorMessage(
        messages,
        "pec",
        problem,
        problem === "invalid" || requiredErrorsDue,
      )}
      details={problem === "invalid" ? copy.diagnostics.pec[diagnosePec(value)] : undefined}
      onInput={(event) => onInput(event.currentTarget.value)}
    />
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
      {rules.taxCode === "unmanaged" ? null : (
        <>
          <s-option value="numericTaxCode">{copy.scenarios.numericTaxCode}</s-option>
          <s-option value="omocodiaTaxCode">{copy.scenarios.omocodiaTaxCode}</s-option>
        </>
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
