import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import {
  pecIsRequired,
  simulatorErrorMessage,
  simulatorFieldError,
  simulatorOutcome,
  simulatorScenarioValues,
} from "../app/features/rules/checkout-simulator";
import {
  diagnosePec,
  diagnoseTaxCode,
  isValidPec,
  isValidTaxCode,
  requiredFieldsAreDue,
} from "../app/checkout-field-validation";
import { mergeRulesFormDraft, rebaseRulesDraft } from "../app/features/rules/rules-form";
import { texts } from "../app/i18n";

const requiredTaxCode = { taxCode: "required_validated", pec: "unmanaged" } as const;

test("il simulatore applica le regole soltanto con consegna e fatturazione italiane", () => {
  const input = {
    rules: requiredTaxCode,
    billingCountry: "IT",
    step: "CHECKOUT_COMPLETION" as const,
    deliveryGroups: [{ countryCode: "IT" }],
    taxCode: "",
    pec: "",
  };

  expect(simulatorOutcome(input)).toBe("blocked");
  expect(simulatorOutcome({ ...input, deliveryGroups: [{ countryCode: "FR" }] })).toBe(
    "notApplied",
  );
  expect(simulatorOutcome({ ...input, billingCountry: "DE" })).toBe("notApplied");
});

test("il simulatore attende Continua per un required vuoto ma segnala subito un valore invalido", () => {
  const input = {
    rules: requiredTaxCode,
    billingCountry: "IT",
    step: "CHECKOUT_INTERACTION" as const,
    deliveryGroups: [{ countryCode: "IT" }],
    taxCode: "",
    pec: "",
  };

  expect(simulatorOutcome(input)).toBe("editing");
  expect(
    simulatorOutcome({
      ...input,
      deliveryGroups: [{ countryCode: "IT", selectedDeliveryOption: true }],
    }),
  ).toBe("blocked");
  expect(simulatorOutcome({ ...input, taxCode: "non valido" })).toBe("blocked");
});

test("il simulatore distingue nessun controllo, valori pronti ed errore PEC", () => {
  const base = {
    billingCountry: "IT",
    step: "CHECKOUT_COMPLETION" as const,
    deliveryGroups: [{ countryCode: "IT" }],
    taxCode: "RSSMRA85T10A562S",
    pec: "mario.rossi@example.com",
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

test("gli scenari pronti coprono valori validi, non validi, Azienda e campi vuoti", () => {
  expect(isValidTaxCode(simulatorScenarioValues.valid.taxCode)).toBe(true);
  expect(isValidPec(simulatorScenarioValues.valid.pec)).toBe(true);
  expect(isValidTaxCode(simulatorScenarioValues.invalidTaxCode.taxCode)).toBe(false);
  expect(isValidPec(simulatorScenarioValues.invalidPec.pec)).toBe(false);
  expect(isValidTaxCode(simulatorScenarioValues.numericTaxCode.taxCode)).toBe(true);
  expect(isValidTaxCode(simulatorScenarioValues.omocodiaTaxCode.taxCode)).toBe(true);
  expect(simulatorScenarioValues.companyWithoutPec).toEqual({
    company: "Acme S.r.l.",
    taxCode: "RSSMRA85T10A562S",
    pec: "",
  });
  expect(simulatorScenarioValues.empty).toEqual({ company: "", taxCode: "", pec: "" });
});

test("la diagnostica distingue le cause formali senza cambiare il contratto booleano", () => {
  expect(diagnoseTaxCode("ABC")).toBe("length");
  expect(diagnoseTaxCode("AAAAAA00A01-A000")).toBe("characters");
  expect(diagnoseTaxCode("AAAAAA00B30A000K")).toBe("date_structure");
  expect(diagnoseTaxCode("RSSMRA85T10A562A")).toBe("check_character");
  expect(diagnoseTaxCode("12345678903")).toBe("valid");
  expect(diagnoseTaxCode("AAAAAAL0A01A000K")).toBe("valid");
  expect(diagnosePec("mario@")).toBe("email_format");
  expect(diagnosePec("mario@example.com")).toBe("valid");
  expect(isValidTaxCode("RSSMRA85T10A562A")).toBe(false);
  expect(isValidPec("mario@")).toBe(false);
});

test("la soglia dei required segue fase, selezione spedizione e consegne miste", () => {
  expect(requiredFieldsAreDue("CHECKOUT_INTERACTION", [{ countryCode: "IT" }])).toBe(false);
  expect(
    requiredFieldsAreDue("CHECKOUT_INTERACTION", [
      { countryCode: "IT", selectedDeliveryOption: true },
      { countryCode: "FR" },
    ]),
  ).toBe(true);
  expect(
    requiredFieldsAreDue("CHECKOUT_INTERACTION", [
      { countryCode: "IT", selectedDeliveryOption: true },
      {},
    ]),
  ).toBe(false);
  expect(requiredFieldsAreDue("CHECKOUT_COMPLETION", [])).toBe(true);
});

test("la PEC condizionale è richiesta soltanto con Azienda compilata", () => {
  expect(pecIsRequired("required_when_company", "")).toBe(false);
  expect(pecIsRequired("required_when_company", "   ")).toBe(false);
  expect(pecIsRequired("required_when_company", "Acme S.r.l.")).toBe(true);

  const input = {
    rules: { taxCode: "unmanaged", pec: "required_when_company" } as const,
    billingCountry: "IT",
    step: "CHECKOUT_COMPLETION" as const,
    deliveryGroups: [{ countryCode: "IT" }],
    taxCode: "",
    pec: "",
  };
  expect(simulatorOutcome({ ...input, company: "" })).toBe("ready");
  expect(simulatorOutcome({ ...input, company: "Acme S.r.l." })).toBe("blocked");
  expect(simulatorOutcome({ ...input, company: "", pec: "mario@" })).toBe("blocked");
  expect(simulatorOutcome({ ...input, company: "", pec: "mario@example.com" })).toBe("ready");
});

test("il selettore spiega che ogni scenario compila i campi e mostra il risultato", () => {
  expect(texts("it").rules.simulator.scenarioHelp).toMatch(/scenario.*compila i campi/i);
  expect(texts("en").rules.simulator.scenarioHelp).toMatch(/scenario.*fills the fields/i);
  expect(JSON.stringify([texts("it"), texts("en")])).not.toMatch(/sintetic|synthetic/i);
});

test("cambiare una regola aggiorna la bozza", () => {
  const data = new FormData();
  data.set("taxCode", "optional_validated");
  data.set("pec", "required_validated");

  expect(
    mergeRulesFormDraft({ rules: { taxCode: "required_validated", pec: "unmanaged" } }, data),
  ).toEqual({
    rules: { taxCode: "optional_validated", pec: "required_validated" },
  });
});

test("una bozza incompleta conserva i valori precedenti", () => {
  const current = {
    rules: { taxCode: "required_validated", pec: "optional_validated" },
  } as const;
  const missing = new FormData();
  expect(mergeRulesFormDraft(current, missing)).toEqual(current);
});

test("gli indirizzi non ancora disponibili non escludono i campi fiscali presenti", () => {
  const input = {
    rules: requiredTaxCode,
    billingCountry: "IT",
    step: "CHECKOUT_COMPLETION" as const,
    deliveryGroups: [{ countryCode: "IT" }],
    taxCode: "",
    pec: "",
  };
  expect(simulatorOutcome({ ...input, billingCountry: "" })).toBe("blocked");
  expect(simulatorOutcome({ ...input, deliveryGroups: [] })).toBe("blocked");
  expect(simulatorOutcome({ ...input, deliveryGroups: [], billingCountry: "" })).toBe("blocked");
  expect(simulatorOutcome({ ...input, deliveryGroups: [], billingCountry: "FR" })).toBe(
    "notApplied",
  );
});

test("il simulatore distingue campi localized assenti e consegna non osservabile", () => {
  const input = {
    rules: { taxCode: "required_validated", pec: "required_validated" } as const,
    billingCountry: "IT",
    step: "CHECKOUT_INTERACTION" as const,
    deliveryGroups: [] as Array<{ countryCode?: string }>,
    taxCode: "RSSMRA85T10A562S",
    pec: "mario.rossi@example.com",
  };
  expect(simulatorOutcome({ ...input, taxCodePresent: false, pecPresent: false })).toBe(
    "notApplied",
  );
  expect(simulatorOutcome({ ...input, taxCodePresent: false })).toBe("ready");
  expect(simulatorOutcome({ ...input, pecPresent: false })).toBe("ready");
  expect(
    simulatorOutcome({
      ...input,
      step: "CHECKOUT_COMPLETION",
      deliveryGroups: [{ countryCode: "IT" }],
      taxCodePresent: false,
    }),
  ).toBe("blocked");
  expect(
    simulatorOutcome({
      ...input,
      step: "CHECKOUT_COMPLETION",
      deliveryGroups: [{ countryCode: "IT" }],
      pecPresent: false,
    }),
  ).toBe("blocked");
  expect(simulatorOutcome({ ...input, deliveryGroups: [{}] })).toBe("ready");
});

test("la riapplicazione conserva modifiche locali e regole remote non toccate", () => {
  const base = {
    rules: { taxCode: "optional_validated", pec: "unmanaged" },
  } as const;
  const current = {
    ...base,
    rules: { taxCode: "required_validated", pec: "optional_validated" },
  } as const;
  const local = {
    ...base,
    rules: { ...base.rules, pec: "required_validated" },
  } as const;
  expect(rebaseRulesDraft(base, local, current)).toEqual({
    rules: { taxCode: "required_validated", pec: "required_validated" },
  });
});
