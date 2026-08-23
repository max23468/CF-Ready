import { expect, test } from "vitest";
import { address2Declaration } from "../../app/config";
import {
  describeCheckout,
  homeCheckoutSummary,
  summariseCheckout,
  texts,
  validationStatus,
} from "../../app/i18n";

test("l'anteprima dice la conseguenza per il cliente, non lo stato dei campi", () => {
  const lines = describeCheckout(
    {
      rules: { taxCode: "required_validated", pec: "unmanaged" },
      errorDisplay: "inline",
      status: "active",
    },
    "it",
  );

  expect(lines[0]).toContain("non completa l’ordine senza un Codice Fiscale");
  expect(lines).not.toContain(texts("it").checkout.disabled);
});

test("la revisione onboarding descrive lo stato reale della Validation", () => {
  expect(validationStatus(true, true)).toBe("active");
  expect(validationStatus(true, false)).toBe("lapsed");
  expect(validationStatus(false, true)).toBe("disabled");
  expect(validationStatus(false, false)).toBe("disabled");
});

test("senza regole attive l'anteprima non promette nulla", () => {
  expect(
    describeCheckout(
      {
        rules: { taxCode: "unmanaged", pec: "unmanaged" },
        errorDisplay: "inline",
        status: "active",
      },
      "it",
    ),
  ).toEqual([texts("it").checkout.nothing]);
});

test("una Validation disattivata lo dichiara nell'anteprima", () => {
  expect(
    describeCheckout(
      {
        rules: { taxCode: "unmanaged", pec: "required_validated" },
        errorDisplay: "preventive",
        status: "disabled",
      },
      "en",
    ),
  ).toContain(texts("en").checkout.disabled);
});

test("una Validation attiva senza piano non viene descritta come disattivata", () => {
  const lines = describeCheckout(
    {
      rules: { taxCode: "required_validated", pec: "unmanaged" },
      errorDisplay: "inline",
      status: "lapsed",
    },
    "it",
  );

  expect(lines).toContain(texts("it").checkout.lapsed);
  expect(lines).not.toContain(texts("it").checkout.disabled);
});

test("la Home descrive lo stato reale prima delle regole", () => {
  const rules = { taxCode: "required_validated", pec: "unmanaged" } as const;

  expect(homeCheckoutSummary({ rules, status: "active" }, "it")).toContain("non completa l’ordine");
  expect(homeCheckoutSummary({ rules, status: "disabled" }, "it")).toBe(
    texts("it").checkout.disabled,
  );
  expect(homeCheckoutSummary({ rules, status: "lapsed" }, "en")).toBe(texts("en").checkout.lapsed);
});

test("la dichiarazione sul campo “Interno” cambia solo quando il blocco è stato mostrato", () => {
  const submitted = (entries: [string, string][]) => {
    const form = new FormData();
    for (const [name, value] of entries) form.append(name, value);
    return address2Declaration(form);
  };

  expect(
    submitted([
      ["address2Shown", "1"],
      ["address2", "declared"],
    ]),
  ).toBe(true);
  expect(submitted([["address2Shown", "1"]])).toBe(false);
  // Codice Fiscale non gestito: il blocco non è sullo schermo e la dichiarazione resta com'è.
  expect(submitted([])).toBeNull();
});

// §7.7: massimo tre frasi per blocco. È il caso più affollato possibile: due campi gestiti,
// avvisi preventivi e Validation disattivata.
test("l'anteprima non supera mai le tre frasi", () => {
  for (const status of ["active", "disabled", "lapsed"] as const) {
    for (const errorDisplay of ["inline", "preventive"] as const) {
      const lines = describeCheckout(
        {
          rules: { taxCode: "required_validated", pec: "required_validated" },
          errorDisplay,
          status,
        },
        "it",
      );

      expect(lines.length).toBeLessThanOrEqual(3);
      expect(new Set(lines).size).toBe(lines.length);
    }
  }
});

test("in Home lo stato sta in una riga, due se le regole non valgono", () => {
  const active = summariseCheckout(
    { rules: { taxCode: "required_validated", pec: "optional_validated" }, status: "active" },
    "it",
  );
  expect(active).toEqual([texts("it").checkout.summaryBlocking]);

  const lapsed = summariseCheckout(
    { rules: { taxCode: "optional_validated", pec: "unmanaged" }, status: "lapsed" },
    "it",
  );
  expect(lapsed).toEqual([texts("it").checkout.summaryChecking, texts("it").checkout.lapsed]);

  expect(
    summariseCheckout(
      { rules: { taxCode: "unmanaged", pec: "unmanaged" }, status: "disabled" },
      "en",
    ),
  ).toEqual([texts("en").checkout.nothing]);
});
