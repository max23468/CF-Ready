import { expect, test, vi } from "vitest";
import { texts } from "../app/i18n";

const mocks = vi.hoisted(() => ({ authenticateAdmin: vi.fn() }));

vi.mock("../app/shopify.server", () => ({ authenticate: {} }));
vi.mock("../app/admin-auth.server", () => ({ authenticateAdmin: mocks.authenticateAdmin }));

import { loader, NAV } from "../app/routes/app";

test("il layout autentica la richiesta ed espone soltanto il contesto minimo", async () => {
  mocks.authenticateAdmin.mockResolvedValueOnce({
    session: { shop: "negozio.myshopify.com" },
  });
  const request = new Request("https://cf-ready.test/app?locale=it-IT");

  await expect(loader({ request, context: {} } as never)).resolves.toMatchObject({
    apiKey: expect.any(String),
    shopDomain: "negozio.myshopify.com",
    locale: "it",
  });
  expect(mocks.authenticateAdmin).toHaveBeenCalledWith(request, {});
});

// D-130: due voci per `/app` lasciavano l'Admin senza menu quando si tornava alla Home da un
// link dentro una pagina. L'invariante è una voce visibile per rotta.
test("il menu dichiara ogni rotta una volta sola", () => {
  const hrefs = NAV.map((item) => item.href);

  expect(new Set(hrefs).size).toBe(hrefs.length);
});

test("Home resta una voce visibile del menu", () => {
  expect(NAV.filter((item) => item.href === "/app")).toEqual([{ href: "/app", label: "home" }]);
});

test("ogni voce del menu ha un'etichetta in entrambe le lingue", () => {
  for (const locale of ["it", "en"] as const) {
    const nav = texts(locale).nav;

    for (const item of NAV) expect(nav[item.label]).toBeTruthy();
  }
});
