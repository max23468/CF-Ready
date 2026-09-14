import { expect, test, vi } from "vitest";
import { texts } from "../app/i18n";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  readInstallationStartedAt: vi.fn(),
}));

vi.mock("../app/shopify.server", () => ({ authenticate: {} }));
vi.mock("../app/admin-auth.server", () => ({ authenticateAdmin: mocks.authenticateAdmin }));

vi.mock("../app/installation-diagnostics.server", () => ({
  readInstallationStartedAt: mocks.readInstallationStartedAt,
}));

import { loader, NAV } from "../app/routes/app";

test("il layout autentica la richiesta ed espone soltanto il contesto minimo", async () => {
  mocks.authenticateAdmin.mockResolvedValueOnce({
    session: { shop: "negozio.myshopify.com" },
  });
  const request = new Request("https://cf-ready.test/app?locale=it-IT");

  const db = {};
  const context = { get: vi.fn(() => db) };
  mocks.readInstallationStartedAt.mockResolvedValueOnce("2026-09-14T12:00:00.000Z");

  await expect(loader({ request, context } as never)).resolves.toMatchObject({
    installedAt: "2026-09-14T12:00:00.000Z",
    apiKey: expect.any(String),
    shopDomain: "negozio.myshopify.com",
    locale: "it",
  });
  expect(mocks.authenticateAdmin).toHaveBeenCalledWith(request, context);
  expect(mocks.readInstallationStartedAt).toHaveBeenCalledWith(db, "negozio.myshopify.com");
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

test("il menu espone esattamente le quattro route principali interne", () => {
  expect(NAV.map((item) => item.href)).toEqual([
    "/app",
    "/app/rules",
    "/app/messages",
    "/app/guide",
  ]);
});

test("ogni voce del menu ha un'etichetta in entrambe le lingue", () => {
  for (const locale of ["it", "en"] as const) {
    const nav = texts(locale).nav;

    for (const item of NAV) expect(nav[item.label]).toBeTruthy();
  }
});

test("la diagnostica non impedisce il caricamento se la lettura D1 fallisce", async () => {
  mocks.authenticateAdmin.mockResolvedValueOnce({ session: { shop: "negozio.myshopify.com" } });
  mocks.readInstallationStartedAt.mockRejectedValueOnce(new Error("synthetic storage failure"));
  const request = new Request("https://cf-ready.test/app");
  const context = { get: () => ({}) };
  await expect(loader({ request, context } as never)).resolves.toMatchObject({ installedAt: null });
});
