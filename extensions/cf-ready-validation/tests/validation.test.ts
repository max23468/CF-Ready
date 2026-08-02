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
  schemaVersion: 2,
  enabled: true,
  errorDisplay: "inline",
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
    ["spazio interno", "AAAAAA00A01 A000", false],
    ["mese", "AAAAAA00Z01A000D", false],
    ["giorno 00", "AAAAAA00A00A000I", false],
    ["giorno 35", "AAAAAA00A35A000X", false],
    ["giorno 72", "AAAAAA00A72A000T", false],
    ["31 aprile", "AAAAAA00D31A000Q", false],
    ["31 giugno", "AAAAAA00H31A000M", false],
    ["31 settembre", "AAAAAA00P31A000J", false],
    ["31 novembre", "AAAAAA00S31A000F", false],
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
    ["punto iniziale local part", ".nome@pec.example", false],
    ["punto finale local part", "nome.@pec.example", false],
    ["doppi punti local part", "no..me@pec.example", false],
    ["dominio senza TLD", "nome@pec", false],
  ])("%s", (_name, value, expected) => {
    expect(isValidPec(value)).toBe(expected);
  });
});

describe("applicabilità e fail-open", () => {
  it.each([
    ["step precedente", { step: "CHECKOUT_INTERACTION" }],
    ["config assente", { config: null }],
    ["schema precedente", { config: { ...baseConfig, schemaVersion: 1 } }],
    ["schema futuro", { config: { ...baseConfig, schemaVersion: 3 } }],
    ["disabilitata", { config: { ...baseConfig, enabled: false } }],
    ["modalità errori sconosciuta", { config: { ...baseConfig, errorDisplay: "other" } }],
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
    [
      "messaggio non trimmato",
      {
        config: {
          ...baseConfig,
          messages: {
            ...messages,
            it: { ...messages.it, taxCodeRequired: " CF richiesto" },
          },
        },
      },
    ],
    [
      "messaggio oltre limite",
      {
        config: {
          ...baseConfig,
          messages: {
            ...messages,
            it: { ...messages.it, taxCodeRequired: "x".repeat(201) },
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
      "abbonamento terminato",
      {
        config: {
          ...baseConfig,
          entitlement: { kind: "subscription", validThrough: "2026-07-28" },
        },
      },
    ],
    [
      "rimborso totale una tantum",
      {
        config: {
          ...baseConfig,
          entitlement: { kind: "none", validThrough: null },
        },
      },
    ],
    [
      "una tantum con scadenza",
      {
        config: {
          ...baseConfig,
          entitlement: { kind: "one_time", validThrough: "2026-08-01" },
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
  ])("%s", (_name, options) => {
    expect(errors(input(options))).toEqual([]);
  });

  it("blocca i campi obbligatori assenti quando esiste una consegna italiana", () => {
    expect(errors(input({ fields: [] }))).toEqual([
      { message: "CF richiesto", target: "$.cart" },
      { message: "PEC richiesta", target: "$.cart" },
    ]);
    expect(errors(input({ fields: [], deliveries: [] }))).toEqual([]);
    expect(
      errors(
        input({
          config: {
            ...baseConfig,
            rules: { taxCode: "optional_validated", pec: "optional_validated" },
          },
          fields: [],
        }),
      ),
    ).toEqual([]);
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
      "abbonamento in chiusura",
      {
        config: {
          ...baseConfig,
          entitlement: {
            kind: "subscription",
            validThrough: "2026-07-30",
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
    ["checkout senza spedizione", { deliveries: [] }],
    ["ritiro senza indirizzo", { deliveries: [null] }],
    ["ordine misto", { deliveries: ["FR", "IT"] }],
  ])("%s", (_name, options) => {
    expect(errors(input(options))).toHaveLength(2);
  });

  it("richiede il localized field singolo assente con consegna italiana", () => {
    expect(
      errors(input({ fields: [{ key: "TAX_EMAIL_IT", value: "" }] })).map(({ target }) => target),
    ).toEqual(["$.cart", "$.cart.localizedField.TAX_EMAIL_IT"]);
    expect(
      errors(input({ fields: [{ key: "TAX_CREDENTIAL_IT", value: "" }] })).map(
        ({ target }) => target,
      ),
    ).toEqual(["$.cart.localizedField.TAX_CREDENTIAL_IT", "$.cart"]);
  });

  it("usa box globali solo a Interaction nella modalità preventiva", () => {
    const config = { ...baseConfig, errorDisplay: "preventive" };

    expect(errors(input({ config, step: "CHECKOUT_INTERACTION" }))).toEqual([
      { message: "CF richiesto", target: "$.cart" },
      { message: "PEC richiesta", target: "$.cart" },
    ]);
    expect(errors(input({ config }))).toEqual([
      {
        message: "CF richiesto",
        target: "$.cart.localizedField.TAX_CREDENTIAL_IT",
      },
      {
        message: "PEC richiesta",
        target: "$.cart.localizedField.TAX_EMAIL_IT",
      },
    ]);
  });

  it("resta fail-open se il metafield è assente o il runtime genera un'eccezione", () => {
    const withoutMetafield = input();
    withoutMetafield.validation.metafield = null;

    expect(errors(withoutMetafield)).toEqual([]);
    expect(errors(null as unknown as CartValidationsGenerateRunInput)).toEqual([]);
  });
});

describe("regole e messaggi", () => {
  const rules = ["unmanaged", "optional_validated", "required_validated"] as const;
  const values = {
    taxCode: { valid: "RSSMRA80A01H501U", invalid: "non valido" },
    pec: { valid: "nome@example.com", invalid: "non valida" },
  };

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

  it.each(
    (["taxCode", "pec"] as const).flatMap((field) =>
      rules.flatMap((rule) =>
        [
          ["vuoto", "", rule === "required_validated" ? "required" : null],
          ["nullo", null, rule === "required_validated" ? "required" : null],
          ["valido", values[field].valid, null],
          ["invalido", values[field].invalid, rule === "unmanaged" ? null : "invalid"],
        ].map(([state, value, expected]) => [field, rule, state, value, expected] as const),
      ),
    ),
  )("%s %s con valore %s", (field, rule, _state, value, expected) => {
    const key = field === "taxCode" ? "TAX_CREDENTIAL_IT" : "TAX_EMAIL_IT";
    const config = {
      ...baseConfig,
      rules: {
        taxCode: "unmanaged",
        pec: "unmanaged",
        [field]: rule,
      },
    };
    const result = errors(input({ config, fields: [{ key, value }] }));

    expect(result.map(({ message }) => message)).toEqual(
      expected ? [messages.it[`${field}${expected === "required" ? "Required" : "Invalid"}`]] : [],
    );
  });

  it("restituisce due errori con target e lingua italiana", () => {
    expect(errors(input())).toEqual([
      {
        message: "CF richiesto",
        target: "$.cart.localizedField.TAX_CREDENTIAL_IT",
      },
      {
        message: "PEC richiesta",
        target: "$.cart.localizedField.TAX_EMAIL_IT",
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
