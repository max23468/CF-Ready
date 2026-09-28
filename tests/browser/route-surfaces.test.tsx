import { router, mount } from "./route-support";
import { describe, expect, test, vi } from "vitest";

import { dispatch } from "./render";

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
  });

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
