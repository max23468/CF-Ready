import { router, mount } from "./route-support";
import { describe, expect, test, vi } from "vitest";

import { click, dispatch } from "./render";
import { texts } from "../../app/i18n";

import App, { ErrorBoundary, headers } from "../../app/routes/app";

describe("shell embedded", () => {
  test("gestisce il menu Shopify senza sospendere il render in una View Transition", async () => {
    router.loaderData = {
      apiKey: "api-key",
      shopDomain: "demo.myshopify.com",
      locale: "it",
    };
    const view = await mount(<App />);
    expect(view.container.querySelectorAll("s-app-nav s-link")).toHaveLength(4);
    expect(view.container.querySelector("[data-outlet]")).not.toBeNull();
    expect(shopify.loading).toHaveBeenCalledWith(false);
    const chatToggle = view.container.querySelector("#support-chat-toggle")!;
    await click(chatToggle);
    const chatFrame = view.container.querySelector(".support-chat__frame");
    expect(chatFrame).not.toBeNull();

    const rulesLink = view.container.querySelector('s-link[href="/app/rules"]');
    if (!rulesLink) throw new Error("link Regole assente");
    const retargetedChild = document.createElement("span");
    rulesLink.append(retargetedChild);
    await dispatch(
      retargetedChild,
      new Event("shopify:navigate", { bubbles: true, composed: true }),
    );
    expect(router.navigate).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith("/app/rules");
    expect(window.location.pathname).toBe("/");

    router.navigation = { state: "loading" };
    router.location = { pathname: "/app/rules", state: null };
    await view.rerender(<App />);
    expect(shopify.loading).toHaveBeenLastCalledWith(true);
    expect(view.container.querySelector(".support-chat__frame")).toBe(chatFrame);
    expect(view.container.querySelector<HTMLElement>(".support-chat__panel")?.hidden).toBe(false);
  });

  test.each([
    ["it", "1k4bnk33m"],
    ["en", "1k4bqnrvs"],
  ] as const)(
    "la chat %s si carica alla prima apertura e resta caricata quando ridotta",
    async (locale, widget) => {
      router.loaderData = { apiKey: "api-key", shopDomain: "demo.myshopify.com", locale };
      const view = await mount(<App />);
      const t = texts(locale);
      const panel = view.container.querySelector<HTMLElement>(".support-chat__panel")!;
      const toggle = view.container.querySelector("#support-chat-toggle")!;
      expect(panel.hidden).toBe(true);
      expect(panel.querySelector("iframe")).toBeNull();
      expect(toggle.textContent).toBe(t.support.heading);

      await click(toggle);
      const frame = panel.querySelector("iframe")!;
      expect(panel.hidden).toBe(false);
      expect(document.activeElement).toBe(panel);
      expect(toggle.textContent).toBe(t.support.minimizeChat);
      expect(frame.title).toBe(t.support.chatTitle);
      expect(frame.src).toBe(`https://tawk.to/chat/6ac67c330815b934ca8c8652/${widget}`);
      expect(frame.referrerPolicy).toBe("no-referrer");
      expect(frame.sandbox.contains("allow-popups-to-escape-sandbox")).toBe(true);
      expect(frame.sandbox.contains("allow-top-navigation")).toBe(false);
      expect(panel.querySelector('s-link[href="mailto:supporto@cfready.it"]')).not.toBeNull();

      await click(toggle);
      expect(panel.hidden).toBe(true);
      expect(toggle.textContent).toBe(t.support.heading);
      await click(toggle);
      expect(panel.querySelector("iframe")).toBe(frame);
      await dispatch(panel, new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      expect(panel.hidden).toBe(false);
      await dispatch(panel, new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(panel.hidden).toBe(true);
    },
  );

  test("installa il reporter prestazioni una volta sola per documento", async () => {
    router.loaderData = {
      apiKey: "api-key",
      shopDomain: "demo.myshopify.com",
      locale: "it",
      performanceReporter: { route: "home", token: "firma-iniziale" },
    };
    const view = await mount(<App />);
    const script = () => view.container.querySelector("script")?.textContent ?? "";
    expect(script()).toContain('"route":"home","token":"firma-iniziale","endpoint":"/performance"');

    router.loaderData = {
      ...router.loaderData,
      performanceReporter: { route: "other", token: "firma-rivalidata" },
    };
    await view.rerender(<App />);
    expect(script()).toContain("firma-iniziale");
    expect(script()).not.toContain("firma-rivalidata");
  });

  test("espone boundary e header Shopify", () => {
    expect(ErrorBoundary()).toBeTruthy();
    expect(headers({} as never)).toBeInstanceOf(Headers);
  });

  test("un errore runtime mostra una pagina bilingue invece di quella di React Router", async () => {
    // Punto 1: `boundary.error` gestisce solo le risposte Shopify e rilancia il resto.
    for (const locale of ["it", "en"] as const) {
      router.loaderData = { locale };
      const view = await mount(<ErrorBoundary />);
      expect(view.container.textContent).toContain(texts(locale).errors.generic);
      expect(view.container.textContent).toContain(texts(locale).errorPage.reload);
      await view.unmount();
    }
  });

  test("ripristina la cornice Admin anche quando App Bridge non è disponibile", async () => {
    router.loaderData = {
      apiKey: "api-key",
      shopDomain: "demo.myshopify.com",
      locale: "it",
    };
    vi.stubGlobal("shopify", undefined);
    let redirect: ((url: string) => void) | undefined;
    router.restoreEmbeddedAdmin.mockImplementationOnce(
      ({ replace }: { replace: (url: string) => void }) => {
        redirect = replace;
        return false;
      },
    );

    await mount(<App />);
    redirect?.("#embedded-restore");

    expect(window.location.hash).toBe("#embedded-restore");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  });
});
