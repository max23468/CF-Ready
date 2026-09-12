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
  schemaVersion: 3,
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
    date?: unknown;
    language?: string;
    billing?: string | null;
    company?: string | null;
    deliveries?: (string | null | { countryCode: string | null; selected?: boolean })[];
    fields?: { key: string; value: string | null }[];
  } = {},
): CartValidationsGenerateRunInput {
  return {
    buyerJourney: { step: options.step ?? "CHECKOUT_COMPLETION" },
    cart: {
      billingAddress:
        options.billing === null
          ? null
          : { company: options.company ?? null, countryCode: options.billing ?? "IT" },
      deliveryGroups: (options.deliveries ?? ["IT"]).map((delivery, index) => {
        const countryCode =
          typeof delivery === "object" && delivery ? delivery.countryCode : delivery;
        const selected = typeof delivery === "object" && delivery?.selected === true;
        return {
          deliveryAddress: countryCode ? { countryCode } : null,
          selectedDeliveryOption: selected ? { handle: `option-${index}` } : null,
        };
      }),
      localizedFields: options.fields ?? [
        { key: "TAX_CREDENTIAL_IT", value: "" },
        { key: "TAX_EMAIL_IT", value: "" },
      ],
    },
    localization: { language: { isoCode: options.language ?? "IT" } },
    shop: { localTime: { date: "date" in options ? options.date : "2026-07-29" } },
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
    ["11 cifre con controllo corretto", "12345678903", true],
    ["11 cifre con controllo errato", "12345678901", false],
    ["11 cifre tutte zero", "00000000000", false],
    ["11 cifre con trasposizione", "13245678903", false],
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

// I valori che il reviewer Shopify digiterà stanno scritti in
// docs/listing/reviewer-instructions.md §4. Se il validatore cambia, quel
// documento diventa falso davanti a chi decide l'approvazione: qui fallisce prima.
describe("valori delle reviewer instructions", () => {
  it.each([
    ["Codice Fiscale valido", "RSSMRA85T10A562S", true],
    ["Codice Fiscale non valido", "RSSMRA85T10A562X", false],
  ])("%s", (_name, value, expected) => {
    expect(isValidTaxCode(value)).toBe(expected);
  });

  it.each([
    ["PEC valida", "mario.rossi@example.com", true],
    ["PEC non valida", "mario.rossi@pec", false],
  ])("%s", (_name, value, expected) => {
    expect(isValidPec(value)).toBe(expected);
  });
});

describe("applicabilità e fail-open", () => {
  it.each([
    ["step precedente", { step: "CART_INTERACTION" }],
    ["config assente", { config: null }],
    ["schema precedente", { config: { ...baseConfig, schemaVersion: 1 } }],
    ["schema futuro", { config: { ...baseConfig, schemaVersion: 4 } }],
    [
      "regola condizionale nello schema precedente",
      {
        config: {
          ...baseConfig,
          schemaVersion: 2,
          rules: { taxCode: "unmanaged", pec: "required_when_company" },
        },
      },
    ],
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
    ["data locale non stringa", { date: null }],
    [
      "messaggi non strutturati",
      {
        config: {
          ...baseConfig,
          messages: null,
        },
      },
    ],
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
    ["anno bisestile ordinario", { date: "2024-02-29" }],
    ["anno bisestile secolare", { date: "2000-02-29" }],
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

  it("ignora il localized field assente quando non osserva una consegna italiana", () => {
    expect(
      errors(
        input({
          deliveries: [],
          fields: [{ key: "TAX_EMAIL_IT", value: "nome@example.com" }],
        }),
      ),
    ).toEqual([]);
    expect(
      errors(
        input({
          deliveries: [],
          fields: [{ key: "TAX_CREDENTIAL_IT", value: "RSSMRA80A01H501U" }],
        }),
      ),
    ).toEqual([]);
  });

  it.each([undefined, "inline", "preventive", "other"])(
    "ignora la precedente modalità %s e usa lo stesso comportamento automatico",
    (errorDisplay) => {
      const config = { ...baseConfig, errorDisplay };
      const interaction = input({
        config,
        step: "CHECKOUT_INTERACTION",
        fields: [
          { key: "TAX_CREDENTIAL_IT", value: "non valido" },
          { key: "TAX_EMAIL_IT", value: "non valida" },
        ],
      });

      expect(errors(interaction)).toEqual([
        { message: "CF non valido", target: "$.cart.localizedField.TAX_CREDENTIAL_IT" },
        { message: "PEC non valida", target: "$.cart.localizedField.TAX_EMAIL_IT" },
      ]);
    },
  );

  it("non mostra required vuoti all'apertura e li mostra inline con consegna risolta", () => {
    const started = { step: "CHECKOUT_INTERACTION", deliveries: ["IT"] };
    expect(errors(input(started))).toEqual([]);

    expect(
      errors(
        input({
          step: "CHECKOUT_INTERACTION",
          deliveries: [{ countryCode: "IT", selected: true }],
        }),
      ),
    ).toEqual([
      { message: "CF richiesto", target: "$.cart.localizedField.TAX_CREDENTIAL_IT" },
      { message: "PEC richiesta", target: "$.cart.localizedField.TAX_EMAIL_IT" },
    ]);
  });

  it.each([
    ["nessuna delivery group", []],
    ["delivery italiana senza opzione", ["IT"]],
    ["delivery non ancora localizzata", [null]],
    ["split con una destinazione irrisolta", [{ countryCode: "IT", selected: true }, null]],
    [
      "due delivery italiane con una sola opzione selezionata",
      [{ countryCode: "IT", selected: true }, { countryCode: "IT" }],
    ],
  ])("rimanda il required a Completion con %s", (_name, deliveries) => {
    expect(errors(input({ step: "CHECKOUT_INTERACTION", deliveries }))).toEqual([]);
  });

  it.each([
    ["una delivery italiana", [{ countryCode: "IT", selected: true }]],
    [
      "due delivery italiane risolte",
      [
        { countryCode: "IT", selected: true },
        { countryCode: "IT", selected: true },
      ],
    ],
    [
      "split Italia-estero con la delivery italiana risolta",
      [{ countryCode: "IT", selected: true }, { countryCode: "FR" }],
    ],
  ])("anticipa inline i required vuoti con %s", (_name, deliveries) => {
    expect(errors(input({ step: "CHECKOUT_INTERACTION", deliveries }))).toHaveLength(2);
    expect(
      errors(input({ step: "CHECKOUT_INTERACTION", deliveries })).every(({ target }) =>
        target.startsWith("$.cart.localizedField."),
      ),
    ).toBe(true);
  });

  it("non usa un banner globale a Interaction se il localized field non è materializzato", () => {
    expect(
      errors(
        input({
          step: "CHECKOUT_INTERACTION",
          deliveries: [{ countryCode: "IT", selected: true }],
          fields: [],
        }),
      ),
    ).toEqual([]);
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
  const steps = ["CHECKOUT_INTERACTION", "CHECKOUT_COMPLETION"] as const;
  const values = {
    taxCode: { valid: "RSSMRA80A01H501U", invalid: "non valido" },
    pec: { valid: "nome@example.com", invalid: "non valida" },
  };

  it.each(
    (["taxCode", "pec"] as const).flatMap((field) =>
      steps.flatMap((step) =>
        rules.flatMap((rule) =>
          (["absent", "empty", "invalid", "valid"] as const).map((state) => [
            field,
            step,
            rule,
            state,
          ]),
        ),
      ),
    ),
  )("%s a %s con regola %s e campo %s", (field, step, rule, state) => {
    const key = field === "taxCode" ? "TAX_CREDENTIAL_IT" : "TAX_EMAIL_IT";
    const target = `$.cart.localizedField.${key}`;
    const config = {
      ...baseConfig,
      rules: {
        taxCode: "unmanaged",
        pec: "unmanaged",
        [field]: rule,
      },
    };
    const fields =
      state === "absent" ? [] : [{ key, value: state === "empty" ? "" : values[field][state] }];
    const result = errors(
      input({
        config,
        step,
        deliveries: [{ countryCode: "IT", selected: true }],
        fields,
      }),
    );
    const expectedKind =
      rule === "unmanaged" ||
      state === "valid" ||
      (rule === "optional_validated" && state !== "invalid")
        ? null
        : state === "invalid"
          ? "Invalid"
          : rule === "required_validated" && (step === "CHECKOUT_COMPLETION" || state === "empty")
            ? "Required"
            : null;

    expect(result).toEqual(
      expectedKind
        ? [
            {
              message: messages.it[`${field}${expectedKind}`],
              target: state === "absent" ? "$.cart" : target,
            },
          ]
        : [],
    );
  });

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

  describe("PEC obbligatoria con Azienda", () => {
    const config = {
      ...baseConfig,
      rules: { taxCode: "unmanaged", pec: "required_when_company" },
    };

    it.each([
      ["null", null],
      ["vuota", ""],
      ["solo spazi", "   "],
    ])("lascia la PEC facoltativa con Azienda %s", (_name, company) => {
      expect(
        errors(input({ config, company, fields: [{ key: "TAX_EMAIL_IT", value: "" }] })),
      ).toEqual([]);
    });

    it("lascia la PEC facoltativa quando Azienda non è presente nell'input", () => {
      const value = input({ config, fields: [{ key: "TAX_EMAIL_IT", value: "" }] });
      delete (value.cart.billingAddress as { company?: string | null }).company;
      expect(errors(value)).toEqual([]);
    });

    it("richiede la PEC quando Azienda è compilata", () => {
      expect(
        errors(
          input({ config, company: "Acme S.r.l.", fields: [{ key: "TAX_EMAIL_IT", value: "" }] }),
        ),
      ).toEqual([{ message: "PEC richiesta", target: "$.cart.localizedField.TAX_EMAIL_IT" }]);
    });

    it("usa il target globale a Completion quando Shopify non espone la PEC", () => {
      expect(errors(input({ config, company: "Acme S.r.l.", fields: [] }))).toEqual([
        { message: "PEC richiesta", target: "$.cart" },
      ]);
    });

    it("mantiene i gate preventivi a Interaction", () => {
      const interaction = {
        config,
        company: "Acme S.r.l.",
        step: "CHECKOUT_INTERACTION" as const,
        fields: [{ key: "TAX_EMAIL_IT", value: "" }],
      };

      expect(errors(input({ ...interaction, deliveries: ["IT"] }))).toEqual([]);
      expect(
        errors(input({ ...interaction, deliveries: [{ countryCode: "IT", selected: true }] })),
      ).toEqual([{ message: "PEC richiesta", target: "$.cart.localizedField.TAX_EMAIL_IT" }]);
      expect(
        errors(
          input({
            ...interaction,
            deliveries: [{ countryCode: "IT", selected: true }],
            fields: [],
          }),
        ),
      ).toEqual([]);
    });

    it.each([
      ["Azienda vuota", ""],
      ["Azienda compilata", "Acme S.r.l."],
    ])("valida una PEC presente con %s", (_name, company) => {
      expect(
        errors(input({ config, company, fields: [{ key: "TAX_EMAIL_IT", value: "non valida" }] })),
      ).toEqual([{ message: "PEC non valida", target: "$.cart.localizedField.TAX_EMAIL_IT" }]);
      expect(
        errors(
          input({ config, company, fields: [{ key: "TAX_EMAIL_IT", value: "nome@example.com" }] }),
        ),
      ).toEqual([]);
    });

    it("mantiene il comportamento dello schema 2 per le regole esistenti", () => {
      expect(
        errors(
          input({
            config: { ...baseConfig, schemaVersion: 2 },
            company: "Acme S.r.l.",
          }),
        ),
      ).toHaveLength(2);
    });
  });
});

it("il simulatore concorda con la Function nelle fasi e topologie del checkout", async () => {
  const { simulatorOutcome } = await import("../../../app/features/rules/checkout-simulator");
  const scenarios = [
    { name: "compilazione iniziale", step: "CHECKOUT_INTERACTION", deliveries: ["IT"] },
    {
      name: "spedizione italiana selezionata",
      step: "CHECKOUT_INTERACTION",
      deliveries: [{ countryCode: "IT", selected: true }],
    },
    { name: "completamento", step: "CHECKOUT_COMPLETION", deliveries: ["IT"] },
    { name: "nessuna consegna", step: "CHECKOUT_COMPLETION", deliveries: [] },
    {
      name: "consegne miste",
      step: "CHECKOUT_INTERACTION",
      deliveries: [{ countryCode: "IT", selected: true }, "FR"],
    },
    {
      name: "consegna irrisolta",
      step: "CHECKOUT_INTERACTION",
      deliveries: [{ countryCode: "IT", selected: true }, null],
    },
    { name: "solo estero", step: "CHECKOUT_COMPLETION", deliveries: ["FR"] },
    {
      name: "campo assente a Interaction",
      step: "CHECKOUT_INTERACTION",
      deliveries: [{ countryCode: "IT", selected: true }],
      fields: [],
    },
    {
      name: "campo assente a Completion",
      step: "CHECKOUT_COMPLETION",
      deliveries: ["IT"],
      fields: [],
    },
    {
      name: "campo assente senza consegna",
      step: "CHECKOUT_COMPLETION",
      deliveries: [],
      fields: [],
    },
    {
      name: "valore invalido immediato",
      step: "CHECKOUT_INTERACTION",
      deliveries: ["IT"],
      fields: [{ key: "TAX_CREDENTIAL_IT", value: "non valido" }],
    },
  ] as const;
  const rules = { taxCode: "required_validated", pec: "unmanaged" } as const;

  for (const scenario of scenarios) {
    const fields =
      "fields" in scenario ? [...scenario.fields] : [{ key: "TAX_CREDENTIAL_IT", value: "" }];
    const actual = cartValidationsGenerateRun({
      buyerJourney: { step: scenario.step },
      cart: {
        billingAddress: { company: null, countryCode: "IT" },
        deliveryGroups: scenario.deliveries.map((delivery, index) => {
          const countryCode =
            typeof delivery === "object" && delivery ? delivery.countryCode : delivery;
          const selected = typeof delivery === "object" && delivery?.selected === true;
          return {
            deliveryAddress: countryCode ? { countryCode } : null,
            selectedDeliveryOption: selected ? { handle: `option-${index}` } : null,
          };
        }),
        localizedFields: fields,
      },
      localization: { language: { isoCode: "IT" } },
      shop: { localTime: { date: "2026-09-05" } },
      validation: {
        metafield: {
          jsonValue: {
            ...baseConfig,
            rules,
            entitlement: { kind: "one_time", validThrough: null },
          },
        },
      },
    } as never);
    expect(
      simulatorOutcome({
        rules,
        billingCountry: "IT",
        step: scenario.step,
        deliveryGroups: scenario.deliveries.map((delivery) => ({
          countryCode: typeof delivery === "object" && delivery ? delivery.countryCode : delivery,
          selectedDeliveryOption: typeof delivery === "object" && delivery?.selected === true,
        })),
        taxCode: fields.find(({ key }) => key === "TAX_CREDENTIAL_IT")?.value ?? "",
        pec: "",
        taxCodePresent: fields.some(({ key }) => key === "TAX_CREDENTIAL_IT"),
        pecPresent: false,
      }) === "blocked",
      scenario.name,
    ).toBe((actual.operations[0].validationAdd?.errors.length ?? 0) > 0);
  }
});
