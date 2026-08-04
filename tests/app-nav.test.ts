import { expect, test, vi } from "vitest";
import { texts } from "../app/i18n";
import { NAV } from "../app/routes/app";

vi.mock("../app/shopify.server", () => ({ authenticate: {} }));

// D-130: due voci per `/app` lasciavano l'Admin senza menu quando si tornava alla Home da un
// link dentro una pagina. L'invariante è una voce per rotta.
test("il menu dichiara ogni rotta una volta sola", () => {
  const hrefs = NAV.map((item) => item.href);

  expect(new Set(hrefs).size).toBe(hrefs.length);
});

test("la rotta di casa è dichiarata ad App Bridge", () => {
  const home = NAV.filter((item) => "home" in item);

  expect(home).toHaveLength(1);
  expect(home[0].href).toBe("/app");
});

test("ogni voce del menu ha un'etichetta in entrambe le lingue", () => {
  for (const locale of ["it", "en"] as const) {
    const nav = texts(locale).nav;

    for (const item of NAV) expect(nav[item.label]).toBeTruthy();
  }
});
