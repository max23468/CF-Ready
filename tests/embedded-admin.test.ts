import { expect, test, vi } from "vitest";
import {
  embeddedAdminUrl,
  navigateFromShopifyEvent,
  restoreEmbeddedAdmin,
} from "../app/embedded-admin";

test("la navigazione App Bridge resta client-side dentro la cornice Shopify", () => {
  const navigate = vi.fn();
  const link = { getAttribute: (name: string) => (name === "href" ? "/app/messages" : null) };

  expect(navigateFromShopifyEvent({ target: link } as unknown as Event, navigate)).toBe(true);
  expect(navigate).toHaveBeenCalledWith("/app/messages");
});

test("un evento App Bridge senza destinazione non forza una navigazione", () => {
  const navigate = vi.fn();

  expect(
    navigateFromShopifyEvent(
      { target: { getAttribute: () => null } } as unknown as Event,
      navigate,
    ),
  ).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
});

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
