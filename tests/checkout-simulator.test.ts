import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import {
  simulatorErrorMessage,
  simulatorFieldError,
  simulatorOutcome,
  simulatorScenarioValues,
} from "../app/features/rules/checkout-simulator";
import { isValidPec, isValidTaxCode } from "../app/checkout-field-validation";
import { mergeRulesFormDraft } from "../app/features/rules/rules-form";
import { texts } from "../app/i18n";

const requiredTaxCode = { taxCode: "required_validated", pec: "unmanaged" } as const;

test("il simulatore applica le regole soltanto con consegna e fatturazione italiane", () => {
  const input = {
    rules: requiredTaxCode,
    deliveryCountry: "IT",
    billingCountry: "IT",
    taxCode: "",
    pec: "",
    revealErrors: true,
  };

  expect(simulatorOutcome(input)).toBe("blocked");
  expect(simulatorOutcome({ ...input, deliveryCountry: "FR" })).toBe("notApplied");
  expect(simulatorOutcome({ ...input, billingCountry: "DE" })).toBe("notApplied");
});

test("la modalità preventiva aggiorna subito l'esito del simulatore", () => {
  const input = {
    rules: requiredTaxCode,
    deliveryCountry: "IT",
    billingCountry: "IT",
    taxCode: "",
    pec: "",
  };

  expect(simulatorOutcome({ ...input, revealErrors: false })).toBe("checkAtPayment");
  expect(simulatorOutcome({ ...input, revealErrors: true })).toBe("blocked");
});

test("il simulatore distingue nessun controllo, valori pronti ed errore PEC", () => {
  const base = {
    deliveryCountry: "IT",
    billingCountry: "IT",
    taxCode: "RSSMRA85T10A562S",
    pec: "mario.rossi@example.com",
    revealErrors: true,
  };

  expect(simulatorOutcome({ ...base, rules: { taxCode: "unmanaged", pec: "unmanaged" } })).toBe(
    "noChecks",
  );
  expect(simulatorOutcome({ ...base, rules: requiredTaxCode })).toBe("ready");
  expect(
    simulatorOutcome({
      ...base,
      rules: { taxCode: "unmanaged", pec: "required_validated" },
      pec: "mario@",
    }),
  ).toBe("blocked");
});

test("campi facoltativi vuoti passano, mentre valori compilati male vengono bloccati", () => {
  expect(simulatorFieldError("optional_validated", "", () => false)).toBeNull();
  expect(simulatorFieldError("optional_validated", "non valido", () => false)).toBe("invalid");
  expect(simulatorFieldError("required_validated", "", () => true)).toBe("required");
});

test("il simulatore mostra i messaggi configurati effettivi", () => {
  const messages = {
    ...DEFAULT_CONFIG.messages.it,
    taxCodeRequired: "Messaggio merchant corrente",
  };

  expect(simulatorErrorMessage(messages, "taxCode", "required", true)).toBe(
    "Messaggio merchant corrente",
  );
  expect(simulatorErrorMessage(messages, "taxCode", "required", false)).toBeUndefined();
  expect(simulatorErrorMessage(messages, "taxCode", "invalid", true)).toBe(messages.taxCodeInvalid);
  expect(simulatorErrorMessage(messages, "pec", "required", true)).toBe(messages.pecRequired);
  expect(simulatorErrorMessage(messages, "pec", "invalid", true)).toBe(messages.pecInvalid);
  expect(simulatorErrorMessage(messages, "pec", null, true)).toBeUndefined();
});

test("gli scenari pronti coprono valori validi, non validi e campi vuoti", () => {
  expect(isValidTaxCode(simulatorScenarioValues.valid.taxCode)).toBe(true);
  expect(isValidPec(simulatorScenarioValues.valid.pec)).toBe(true);
  expect(isValidTaxCode(simulatorScenarioValues.invalidTaxCode.taxCode)).toBe(false);
  expect(isValidPec(simulatorScenarioValues.invalidPec.pec)).toBe(false);
  expect(simulatorScenarioValues.empty).toEqual({ taxCode: "", pec: "" });
});

test("il selettore spiega che ogni scenario compila i campi e mostra il risultato", () => {
  expect(texts("it").rules.simulator.scenarioHelp).toMatch(/compila i campi/i);
  expect(texts("en").rules.simulator.scenarioHelp).toMatch(/fills the fields/i);
});

test("cambiare una regola non disattiva gli avvisi preventivi", () => {
  const data = new FormData();
  data.set("taxCode", "optional_validated");
  data.set("pec", "required_validated");

  expect(
    mergeRulesFormDraft(
      {
        rules: { taxCode: "required_validated", pec: "unmanaged" },
        errorDisplay: "preventive",
        address2: false,
      },
      data,
    ),
  ).toEqual({
    rules: { taxCode: "optional_validated", pec: "required_validated" },
    errorDisplay: "preventive",
    address2: false,
  });
});

test("una bozza incompleta conserva i valori precedenti e legge la dichiarazione", () => {
  const current = {
    rules: { taxCode: "required_validated", pec: "optional_validated" },
    errorDisplay: "inline",
    address2: false,
  } as const;
  const missing = new FormData();
  expect(mergeRulesFormDraft(current, missing)).toEqual(current);

  const declared = new FormData();
  declared.set("address2", "declared");
  expect(mergeRulesFormDraft(current, declared).address2).toBe(true);
});
