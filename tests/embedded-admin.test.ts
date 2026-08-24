import { expect, test, vi } from "vitest";
import { embeddedAdminUrl, restoreEmbeddedAdmin } from "../app/embedded-admin";

test.each(["/app", "/app/rules", "/app/messages", "/app/guide", "/app/onboarding"])(
  "la rotta autonoma %s viene riaperta dentro l'Admin Shopify",
  (appPath) => {
    expect(embeddedAdminUrl("negozio.myshopify.com", "client-id", appPath)).toBe(
      `https://admin.shopify.com/store/negozio/apps/client-id${appPath}`,
    );

    const replace = vi.fn();
    expect(
      restoreEmbeddedAdmin({
        embedded: false,
        shopDomain: "negozio.myshopify.com",
        apiKey: "client-id",
        appPath,
        replace,
      }),
    ).toBe(true);
    expect(replace).toHaveBeenCalledWith(
      `https://admin.shopify.com/store/negozio/apps/client-id${appPath}`,
    );
  },
);

test("un percorso esterno non viene copiato nel rientro embedded", () => {
  const replace = vi.fn();
  expect(
    restoreEmbeddedAdmin({
      embedded: false,
      shopDomain: "negozio.myshopify.com",
      apiKey: "client-id",
      appPath: "//example.com/fuga",
      replace,
    }),
  ).toBe(true);
  expect(replace).toHaveBeenCalledWith("https://admin.shopify.com/store/negozio/apps/client-id");
});

test("una rotta già embedded non cambia pagina", () => {
  const replace = vi.fn();
  expect(
    restoreEmbeddedAdmin({
      embedded: true,
      shopDomain: "negozio.myshopify.com",
      apiKey: "client-id",
      appPath: "/app",
      replace,
    }),
  ).toBe(false);
  expect(replace).not.toHaveBeenCalled();
});
