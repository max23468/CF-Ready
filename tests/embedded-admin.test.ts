import { expect, test, vi } from "vitest";
import {
  appRouteFromShopifyEvent,
  embeddedAdminUrl,
  navigateFromShopifyEvent,
  restoreEmbeddedAdmin,
} from "../app/embedded-admin";

const origin = "https://app.example";
const link = (href: string) => ({
  tagName: "S-LINK",
  getAttribute: (name: string) => (name === "href" ? href : null),
});

test.each(["/app", "/app/rules", "/app/messages", "/app/guide"])(
  "la navigazione App Bridge usa la route interna %s esposta dal target",
  (href) => {
    const navigate = vi.fn();

    expect(
      navigateFromShopifyEvent({ target: link(href) } as unknown as Event, origin, navigate),
    ).toBe(true);
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(href);
  },
);

test("recupera la destinazione dal composedPath quando il target è retargettizzato", () => {
  const navigate = vi.fn();
  const source = link("/app/rules");
  const event = {
    target: { tagName: "S-APP-NAV", getAttribute: () => null },
    composedPath: () => [{ tagName: "SPAN", getAttribute: () => null }, source, {}],
  } as unknown as Event;

  expect(navigateFromShopifyEvent(event, origin, navigate)).toBe(true);
  expect(navigate).toHaveBeenCalledOnce();
  expect(navigate).toHaveBeenCalledWith("/app/rules");
});

test("recupera la destinazione oltre un target interno allo Shadow DOM", () => {
  const source = link("/app/guide?host=abc#faq");
  const shadowTarget = { tagName: "SPAN", getAttribute: () => null };
  const shadowRoot = { host: source };

  expect(
    appRouteFromShopifyEvent(
      {
        target: shadowTarget,
        composedPath: () => [shadowTarget, shadowRoot, source, {}],
      } as unknown as Event,
      origin,
    ),
  ).toBe("/app/guide?host=abc#faq");
});

test("normalizza un URL assoluto della stessa origin preservando query e hash", () => {
  expect(
    appRouteFromShopifyEvent(
      {
        target: link("https://app.example/app/messages?host=abc#preview"),
      } as unknown as Event,
      origin,
    ),
  ).toBe("/app/messages?host=abc#preview");
});

test.each([
  "https://external.example/app/rules",
  "//external.example/app/messages",
  "/account",
  "/application",
  "http://[",
])("rifiuta la destinazione non interna %s", (href) => {
  const navigate = vi.fn();

  expect(
    navigateFromShopifyEvent({ target: link(href) } as unknown as Event, origin, navigate),
  ).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
});

test("un evento App Bridge senza destinazione non forza una navigazione", () => {
  const navigate = vi.fn();

  expect(
    navigateFromShopifyEvent(
      {
        target: { getAttribute: () => null },
        composedPath: () => [{ getAttribute: () => null }],
        detail: { href: "/app/messages" },
      } as unknown as Event,
      origin,
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

test("il rientro rifiuta un target senza API key", () => {
  expect(() => embeddedAdminUrl("negozio.myshopify.com", "", "/app")).toThrow(
    "invalid_embedded_admin_target",
  );
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
