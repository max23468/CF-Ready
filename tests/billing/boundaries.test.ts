import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { requestedRecurringPlanIsActive, returnUrlFor } from "../../app/billing.server";
import { withValidationLock } from "../../app/validation.server";
import { insertShop, abbonamento } from "../support/billing";

test("il confine billing riconosce il piano ricorrente già attivo", () => {
  const mensile = abbonamento("gid://shopify/AppSubscription/attivo", "2026-08-31");

  expect(requestedRecurringPlanIsActive(mensile, "monthly")).toBe(true);
  expect(requestedRecurringPlanIsActive(mensile, "annual")).toBe(false);
  expect(requestedRecurringPlanIsActive(mensile, "one_time")).toBe(false);
});

test("la lease impedisce che due riconciliazioni facciano la stessa operazione", async () => {
  const shop = await insertShop("contesa.example.myshopify.com");
  let esecuzioni = 0;
  const operazione = async () => {
    esecuzioni += 1;
    // Mentre la prima tiene la lease, la seconda deve uscire senza fare nulla.
    const seconda = await withValidationLock(env.DB, shop, async () => {
      esecuzioni += 1;
      return "eseguita";
    });
    expect(seconda).toEqual({ acquired: false });
    return "eseguita";
  };

  expect(await withValidationLock(env.DB, shop, operazione)).toEqual({
    acquired: true,
    result: "eseguita",
  });
  expect(esecuzioni).toBe(1);

  // Rilasciata la lease, l'operazione successiva può procedere.
  expect(await withValidationLock(env.DB, shop, async () => "dopo")).toEqual({
    acquired: true,
    result: "dopo",
  });
});

test("l'URL di ritorno riporta il merchant dentro l'admin", () => {
  const host = btoa("admin.shopify.com/store/negozio");
  const dentroAdmin = returnUrlFor(
    new Request(`https://app.example/app?shop=intruso.myshopify.com&host=${host}`),
    "negozio.myshopify.com",
  );

  expect(dentroAdmin).toContain("shop=negozio.myshopify.com");
  expect(dentroAdmin).not.toContain("intruso");
  expect(dentroAdmin).toContain(`host=${encodeURIComponent(host)}`);

  // Un `host` non coerente viene scartato; lo shop autenticato permette comunque il rientro.
  const senzaHost = returnUrlFor(
    new Request(`https://app.example/app?host=${btoa("admin.shopify.com/store/altro")}`),
    "negozio.myshopify.com",
  );
  expect(senzaHost).toContain("shop=negozio.myshopify.com");
  expect(senzaHost).not.toContain("host=");
});
