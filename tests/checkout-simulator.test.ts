import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import {
  simulatorErrorMessage,
  simulatorFieldError,
  simulatorOutcome,
} from "../app/features/rules/checkout-simulator";
import { mergeRulesFormDraft } from "../app/features/rules/rules-form";

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
