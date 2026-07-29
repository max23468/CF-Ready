import { describe, expect, it } from "vitest";
import type { CartValidationsGenerateRunInput } from "../generated/api";
import {
  cartValidationsGenerateRun,
  isValidPec,
  isValidTaxCode,
} from "../src/cart_validations_generate_run";

const messages = {
  it: {
    taxCodeRequired: "CF richiesto",
    taxCodeInvalid: "CF non valido",
    pecRequired: "PEC richiesta",
    pecInvalid: "PEC non valida",
  },
  en: {
    taxCodeRequired: "Tax code required",
    taxCodeInvalid: "Invalid tax code",
    pecRequired: "PEC required",
    pecInvalid: "Invalid PEC",
  },
};

const baseConfig = {
  schemaVersion: 1,
  enabled: true,
  entitlement: { kind: "trial", validThrough: "2026-07-29" },
  rules: {
    taxCode: "required_validated",
    pec: "required_validated",
  },
  messages,
};

function input(
  options: {
    config?: unknown;
    step?: string;
    date?: string;
    language?: string;
    billing?: string | null;
    deliveries?: (string | null)[];
    fields?: { key: string; value: string | null }[];
  } = {},
): CartValidationsGenerateRunInput {
  return {
    buyerJourney: { step: options.step ?? "CHECKOUT_COMPLETION" },
    cart: {
      billingAddress: options.billing === null ? null : { countryCode: options.billing ?? "IT" },
      deliveryGroups: (options.deliveries ?? ["IT"]).map((countryCode) => ({
        deliveryAddress: countryCode ? { countryCode } : null,
      })),
      localizedFields: options.fields ?? [
        { key: "TAX_CREDENTIAL_IT", value: "" },
        { key: "TAX_EMAIL_IT", value: "" },
      ],
    },
    localization: { language: { isoCode: options.language ?? "IT" } },
    shop: { localTime: { date: options.date ?? "2026-07-29" } },
    validation: {
      metafield: {
        jsonValue: "config" in options ? options.config : structuredClone(baseConfig),
      },
    },
  } as CartValidationsGenerateRunInput;
}

function errors(value: CartValidationsGenerateRunInput) {
  return cartValidationsGenerateRun(value).operations[0].validationAdd!.errors;
}

describe("Codice Fiscale", () => {
  it.each([
    ["11 cifre", "12345678901", true],
    ["minuscolo", "aaaaaa00a01a000h", true],
    ["spazi esterni", "  AAAAAA00A01A000H  ", true],
    ["omocodia", "AAAAAAL0A01A000K", true],
    ["29 febbraio", "AAAAAA00B29A000D", true],
    ["lunghezza", "AAAAAA00A01A000", false],
    ["separatore", "AAAAAA00A01-A000", false],
    ["mese", "AAAAAA00Z01A000D", false],
    ["giorno 00", "AAAAAA00A00A000I", false],
    ["giorno 35", "AAAAAA00A35A000X", false],
    ["giorno 72", "AAAAAA00A72A000T", false],
    ["31 aprile", "AAAAAA00D31A000Q", false],
    ["30 febbraio", "AAAAAA00B30A000K", false],
    ["catastale", "AAAAAA00A010000H", false],
    ["checksum", "AAAAAA00A01A000A", false],
    ["omocodia illecita", "AAAAAA00U01A000W", false],
    ["11 con lettera", "1234567890A", false],
  ])("%s", (_name, value, expected) => {
    expect(isValidTaxCode(value)).toBe(expected);
  });
});

describe("PEC", () => {
  it.each([
    ["semplice", "nome@pec.example", true],
    ["maiuscole", "NOME@PEC.EXAMPLE", true],
    ["spazi esterni", "  nome+tag@sub.pec.example  ", true],
    ["provider non verificato", "nome@example.com", true],
    ["spazio interno", "no me@pec.example", false],
    ["doppia chiocciola", "nome@@pec.example", false],
    ["label vuota", "nome@pec..example", false],
    ["punto iniziale", "nome@.pec.example", false],
    ["punto finale", "nome@pec.example.", false],
    ["trattino iniziale", "nome@-pec.example", false],
    ["trattino finale", "nome@pec-.example", false],
    ["local part vuota", "@pec.example", false],
    ["dominio senza TLD", "nome@pec", false],
  ])("%s", (_name, value, expected) => {
    expect(isValidPec(value)).toBe(expected);
  });
});

describe("applicabilità e fail-open", () => {
  it.each([
    ["step precedente", { step: "CHECKOUT_INTERACTION" }],
    ["config assente", { config: null }],
    ["schema futuro", { config: { ...baseConfig, schemaVersion: 2 } }],
    ["disabilitata", { config: { ...baseConfig, enabled: false } }],
    [
      "regola sconosciuta",
      {
        config: {
          ...baseConfig,
          rules: { ...baseConfig.rules, taxCode: "other" },
        },
      },
    ],
    [
      "messaggio vuoto",
      {
        config: {
          ...baseConfig,
          messages: {
            ...messages,
            it: { ...messages.it, taxCodeRequired: "" },
          },
        },
      },
    ],
    ["data locale invalida", { date: "29/07/2026" }],
    [
      "trial scaduto",
      {
        config: {
          ...baseConfig,
          entitlement: { kind: "trial", validThrough: "2026-07-28" },
        },
      },
    ],
    [
      "entitlement sconosciuto",
      {
        config: {
          ...baseConfig,
          entitlement: { kind: "other", validThrough: null },
        },
      },
    ],
    ["fatturazione estera", { billing: "FR" }],
    ["consegna solo estera", { deliveries: ["FR", "DE"] }],
    ["campi assenti", { fields: [] }],
  ])("%s", (_name, options) => {
    expect(errors(input(options))).toEqual([]);
  });

  it.each([
    ["ultimo giorno trial", {}],
    [
      "abbonamento attivo",
      {
        config: {
          ...baseConfig,
          entitlement: {
            kind: "subscription",
            validThrough: "2026-08-01",
          },
        },
      },
    ],
    [
      "una tantum",
      {
        config: {
          ...baseConfig,
          entitlement: { kind: "one_time", validThrough: null },
        },
      },
    ],
    ["fatturazione assente", { billing: null }],
    ["ritiro senza indirizzo", { deliveries: [null] }],
    ["ordine misto", { deliveries: ["FR", "IT"] }],
  ])("%s", (_name, options) => {
    expect(errors(input(options))).toHaveLength(2);
  });
});

describe("regole e messaggi", () => {
  const rules = ["unmanaged", "optional_validated", "required_validated"] as const;

  it.each(rules.flatMap((taxCode) => rules.map((pec) => [taxCode, pec])))(
    "combina CF %s e PEC %s",
    (taxCode, pec) => {
      const config = {
        ...baseConfig,
        rules: { taxCode, pec },
      };
      const result = errors(
        input({
          config,
          fields: [
            { key: "TAX_CREDENTIAL_IT", value: "non valido" },
            { key: "TAX_EMAIL_IT", value: "non valida" },
          ],
        }),
      );
      expect(result).toHaveLength(Number(taxCode !== "unmanaged") + Number(pec !== "unmanaged"));
    },
  );

  it("distingue vuoto, valido e invalido", () => {
    const config = {
      ...baseConfig,
      rules: {
        taxCode: "optional_validated",
        pec: "required_validated",
      },
    };
    expect(
      errors(
        input({
          config,
          fields: [
            { key: "TAX_CREDENTIAL_IT", value: "" },
            { key: "TAX_EMAIL_IT", value: "nome@example.com" },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("restituisce due errori con target e lingua italiana", () => {
    expect(errors(input())).toEqual([
      {
        message: "CF richiesto",
        target: "$.cart.localizedFields.TAX_CREDENTIAL_IT",
      },
      {
        message: "PEC richiesta",
        target: "$.cart.localizedFields.TAX_EMAIL_IT",
      },
    ]);
  });

  it("usa l'inglese per le altre lingue", () => {
    expect(errors(input({ language: "FR" })).map(({ message }) => message)).toEqual([
      "Tax code required",
      "PEC required",
    ]);
  });
});
