import { StrictMode, act } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InstallationReporter } from "../../app/InstallationReporter";
import { render, type Rendered } from "./render";

const originalFetch = Object.getOwnPropertyDescriptor(window, "fetch");
const originalShopify = Object.getOwnPropertyDescriptor(window, "shopify");
const originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
let mounted: Rendered | undefined;
let visibility: DocumentVisibilityState;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  visibility = "visible";
  fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  Object.defineProperty(window, "fetch", { configurable: true, writable: true, value: fetcher });
  Object.defineProperty(window, "shopify", { configurable: true, writable: true, value: {} });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(async () => {
  await mounted?.unmount();
  mounted = undefined;
  restore(window, "fetch", originalFetch);
  restore(window, "shopify", originalShopify);
  restore(document, "visibilityState", originalVisibility);
});

function restore(target: object, key: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

async function mount(path = "/app", installedAt: string | null = "2026-09-14T12:00:00.000Z") {
  mounted = await render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <InstallationReporter installedAt={installedAt} />
      </MemoryRouter>
    </StrictMode>,
  );
}

test("rileva il primo passo visibile senza Avanti, una sola volta anche in StrictMode", async () => {
  expect(window.fetch).toBe(fetcher);
  expect(document.visibilityState).toBe("visible");
  await mount("/app/onboarding");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("/app/engagement");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: "POST",
    headers: { "X-CF-Ready-Event": "onboarding_started" },
    keepalive: true,
  });
  expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("una pagina nascosta attende la visibilità; un errore non impedisce il retry online", async () => {
  visibility = "hidden";
  fetcher.mockRejectedValueOnce(new Error("offline"));
  await mount();
  expect(fetcher).not.toHaveBeenCalled();
  visibility = "visible";
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ "X-CF-Ready-Event": "app_opened" });
});

test("non segnala una route tecnica anche con un riferimento di installazione", async () => {
  await mount("/app/engagement");
  expect(fetcher).not.toHaveBeenCalled();
});

test("non segnala una pagina merchant senza riferimento di installazione", async () => {
  await mount("/app", null);
  expect(fetcher).not.toHaveBeenCalled();
});

test("attende App Bridge e ritenta le risposte non riuscite senza log o blocchi della UI", async () => {
  Object.defineProperty(window, "shopify", { configurable: true, writable: true, value: undefined });
  await mount();
  expect(fetcher).not.toHaveBeenCalled();
  Object.defineProperty(window, "shopify", { configurable: true, writable: true, value: {} });
  fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(fetcher).toHaveBeenCalledTimes(2);
});
