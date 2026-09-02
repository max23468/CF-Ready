import { expect, test } from "vitest";
import { planFor, planPrices } from "../app/plans.server";

test("la generazione senza prezzi non costruisce offerte acquistabili", () => {
  expect(planFor("value", "monthly")).toBeNull();
  expect(planPrices("value")).toBeNull();
});

test("le generazioni acquistabili espongono importo, valuta e intervallo", () => {
  expect(planFor("launch", "annual")).toEqual({
    name: "CF Ready — abbonamento annuale",
    amount: 29.9,
    currency: "EUR",
    interval: "ANNUAL",
  });
  expect(planPrices("balanced")).toEqual({
    generation: "balanced",
    monthly: 3.99,
    annual: 39.9,
    one_time: 119.9,
  });
});
