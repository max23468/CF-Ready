import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../app/config";
import { texts } from "../../app/i18n";
import { trialContinuityTexts } from "../../app/i18n/trial-continuity";
import { click, render, type Rendered } from "./render";

const router = vi.hoisted(() => ({
  loaderData: undefined as unknown,
  fetcher: {
    data: undefined as unknown,
    formData: undefined as FormData | undefined,
    state: "idle",
    submit: vi.fn(),
  },
  navigate: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router")>();
  return {
    ...original,
    useFetcher: () => router.fetcher,
    useLoaderData: () => router.loaderData,
    useNavigate: () => router.navigate,
  };
});

vi.mock("@shopify/shopify-app-react-router/server", () => ({
  boundary: { headers: vi.fn() },
}));

vi.mock("../../app/features/onboarding/onboarding.server", () => ({
  action: vi.fn(),
  loader: vi.fn(),
}));

import Onboarding from "../../app/routes/app.onboarding";

let view: Rendered | undefined;

beforeEach(() => {
  router.loaderData = {
    locale: "it",
    step: 4,
    completed: false,
    rules: DEFAULT_CONFIG.rules,
    messages: DEFAULT_CONFIG.messages,
    enabled: false,
    entitlementKind: "trial",
    entitled: true,
    trialStatus: "active",
    trialEndsAt: "2026-09-28",
    errorCode: null,
    labelScopesGranted: false,
    labelState: { mode: "off", address2Classification: "unknown" },
    labelSnapshot: null,
  };
  router.fetcher.data = undefined;
  router.fetcher.state = "idle";
  router.fetcher.formData = undefined;
  router.fetcher.submit.mockReset();
  router.navigate.mockReset();
  vi.stubGlobal("opener", null);
});

afterEach(async () => {
  await view?.unmount();
  view = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const found = [...(view?.container.querySelectorAll("s-button") ?? [])].find(
    (element) => element.textContent === label,
  );
  if (!found) throw new Error(`Pulsante assente: ${label}`);
  return found;
}

async function completeOnboarding() {
  view = await render(<Onboarding />);
  await click(button(texts("it").onboarding.activate));
  expect(router.fetcher.submit).toHaveBeenCalledWith(
    { intent: "activate", step: "4" },
    { method: "post" },
  );
  router.loaderData = { ...(router.loaderData as object), enabled: true, completed: true };
  router.fetcher.data = { ok: true };
  await view.rerender(<Onboarding />);
  expect(view.container.querySelector("s-section")?.getAttribute("heading")).toBe(
    trialContinuityTexts("it").activeHeading,
  );
  expect(router.navigate).not.toHaveBeenCalled();
}

test("la conclusione torna alla home senza obbligare a scegliere un piano", async () => {
  await completeOnboarding();
  await click(button(trialContinuityTexts("it").goHome));
  expect(router.navigate).toHaveBeenCalledWith("/app", { viewTransition: true });
  expect(router.fetcher.submit).toHaveBeenCalledTimes(1);
});

test("la conclusione nella App Window chiede alla home di chiudere la finestra", async () => {
  const postMessage = vi.fn();
  vi.stubGlobal("opener", { postMessage });
  await completeOnboarding();
  await click(button(trialContinuityTexts("it").goHome));
  expect(postMessage).toHaveBeenCalledWith(
    { type: "cf-ready:navigate-from-app-window", href: "/app" },
    window.location.origin,
  );
  expect(router.navigate).not.toHaveBeenCalled();
});

test("Scegli un piano riusa il listino della home senza avviare addebiti", async () => {
  const postMessage = vi.fn();
  vi.stubGlobal("opener", { postMessage });
  await completeOnboarding();
  await click(button(trialContinuityTexts("it").choosePlan));
  expect(postMessage).toHaveBeenCalledWith(
    { type: "cf-ready:show-plans" },
    window.location.origin,
  );
  expect(router.fetcher.submit).toHaveBeenCalledTimes(1);
  expect(router.navigate).not.toHaveBeenCalled();
});
