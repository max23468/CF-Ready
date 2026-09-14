import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { InstallationReporter } from "../../app/InstallationReporter";

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(path = "/app", installedAt: string | null = "2026-09-14T12:00:00.000Z") {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StrictMode>
        <MemoryRouter initialEntries={[path]}>
          <InstallationReporter installedAt={installedAt} />
        </MemoryRouter>
      </StrictMode>,
    );
  });
}

test("rileva il primo passo visibile senza Avanti, una sola volta anche in StrictMode", async () => {
  vi.stubGlobal("shopify", {});
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  await render("/app/onboarding");
  await expect.poll(() => fetcher.mock.calls.length).toBe(1);
  expect(fetcher.mock.calls[0][0]).toBe("/app/engagement");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: "POST",
    headers: { "X-CF-Ready-Event": "onboarding_started" },
    keepalive: true,
  });
  expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  document.dispatchEvent(new Event("visibilitychange"));
  await act(async () => {});
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("una pagina nascosta attende la visibilità; un errore non impedisce il retry online", async () => {
  vi.stubGlobal("shopify", {});
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  await render();
  expect(fetcher).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  await expect.poll(() => fetcher.mock.calls.length).toBe(1);
  await act(async () => {});
  window.dispatchEvent(new Event("online"));
  await expect.poll(() => fetcher.mock.calls.length).toBe(2);
  expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ "X-CF-Ready-Event": "app_opened" });
});

test("non segnala una route tecnica o un'installazione senza riferimento", async () => {
  vi.stubGlobal("shopify", {});
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  await render("/app/engagement", null);
  expect(fetcher).not.toHaveBeenCalled();
});
