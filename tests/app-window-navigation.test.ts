import { expect, test, vi } from "vitest";
import {
  APP_WINDOW_NAVIGATION_MESSAGE_TYPE,
  appWindowSource,
  handleAppWindowNavigation,
  requestAppWindowNavigation,
} from "../app/app-window-navigation";

const onboardingSource = {} as Window;

test("legge il frame corrente dell'App Window e rifiuta finestre chiuse o mancanti", () => {
  const appWindow = { contentWindow: onboardingSource };
  const getElementById = vi.fn(() => appWindow as unknown as HTMLElement);
  expect(appWindowSource({ getElementById }, "onboarding-window")).toBe(onboardingSource);
  expect(getElementById).toHaveBeenCalledWith("onboarding-window");
  appWindow.contentWindow = {} as Window;
  expect(appWindowSource({ getElementById }, "onboarding-window")).toBe(appWindow.contentWindow);
  for (const element of [null, {}, { contentWindow: null }]) {
    expect(
      appWindowSource({ getElementById: () => element as HTMLElement | null }, "onboarding-window"),
    ).toBeNull();
  }
});

test("nessuna sorgente è autorizzata quando l'App Window è chiusa", async () => {
  const hideWindow = vi.fn(async () => undefined);
  const navigate = vi.fn();
  for (const source of [null, onboardingSource]) {
    expect(
      await handleAppWindowNavigation(
        {
          origin: "https://app.example",
          source,
          data: { type: APP_WINDOW_NAVIGATION_MESSAGE_TYPE, href: "/app" },
        },
        "https://app.example",
        { hideWindow, navigate },
        null,
      ),
    ).toBe(false);
  }
  expect(hideWindow).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

test.each([null, {} as Window])(
  "rifiuta una sorgente diversa dall'App Window anche con origine e contenuto validi (%s)",
  async (source) => {
    const hideWindow = vi.fn(async () => undefined);
    const navigate = vi.fn();
    const expectedSource = {} as Window;
    expect(
      await handleAppWindowNavigation(
        {
          origin: "https://app.example",
          source,
          data: { type: APP_WINDOW_NAVIGATION_MESSAGE_TYPE, href: "/app" },
        },
        "https://app.example",
        { hideWindow, navigate },
        expectedSource,
      ),
    ).toBe(false);
    expect(hideWindow).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  },
);

test("la Home scelta nell'onboarding viene inoltrata alla pagina che ha aperto l'App Window", () => {
  const postMessage = vi.fn();
  const fallback = vi.fn();

  expect(
    requestAppWindowNavigation(
      {
        location: { origin: "https://app.example" } as Location,
        opener: { postMessage } as unknown as Window,
      },
      "/app",
      fallback,
    ),
  ).toBe("opener");
  expect(postMessage).toHaveBeenCalledWith(
    { type: APP_WINDOW_NAVIGATION_MESSAGE_TYPE, href: "/app" },
    "https://app.example",
  );
  expect(fallback).not.toHaveBeenCalled();
});

test.each(["/app", "/app/rules", "/app/messages", "/app/guide"])(
  "la route %s senza App Window continua a usare React Router una sola volta",
  (href) => {
    const navigate = vi.fn();

    expect(
      requestAppWindowNavigation(
        { location: { origin: "https://app.example" } as Location, opener: null },
        href,
        navigate,
      ),
    ).toBe("fallback");
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(href);
  },
);

test("la Home nasconde l'App Window prima di navigare nella cornice Shopify", async () => {
  const calls: string[] = [];
  const event = {
    origin: "https://app.example",
    source: onboardingSource,
    data: { type: APP_WINDOW_NAVIGATION_MESSAGE_TYPE, href: "/app" },
  } as MessageEvent;

  expect(
    await handleAppWindowNavigation(
      event,
      "https://app.example",
      {
        hideWindow: async () => void calls.push("hide"),
        navigate: (href) => calls.push(`navigate:${href}`),
      },
      onboardingSource,
    ),
  ).toBe(true);
  expect(calls).toEqual(["hide", "navigate:/app"]);
});

test("messaggi esterni o destinazioni fuori app non possono pilotare la navigazione", async () => {
  const hideWindow = vi.fn(async () => undefined);
  const navigate = vi.fn();

  for (const event of [
    {
      origin: "https://external.example",
      source: onboardingSource,
      data: { type: APP_WINDOW_NAVIGATION_MESSAGE_TYPE, href: "/app" },
    },
    {
      origin: "https://app.example",
      source: onboardingSource,
      data: { type: APP_WINDOW_NAVIGATION_MESSAGE_TYPE, href: "https://external.example" },
    },
  ]) {
    expect(
      await handleAppWindowNavigation(
        event as MessageEvent,
        "https://app.example",
        {
          hideWindow,
          navigate,
        },
        onboardingSource,
      ),
    ).toBe(false);
  }

  expect(hideWindow).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

test("il messaggio App Window conserva query e hash nella navigazione principale", async () => {
  const hideWindow = vi.fn(async () => undefined);
  const navigate = vi.fn();
  const event = {
    origin: "https://app.example",
    source: onboardingSource,
    data: {
      type: APP_WINDOW_NAVIGATION_MESSAGE_TYPE,
      href: "/app/guide?host=abc#faq",
    },
  } as MessageEvent;

  expect(
    await handleAppWindowNavigation(
      event,
      "https://app.example",
      { hideWindow, navigate },
      onboardingSource,
    ),
  ).toBe(true);
  expect(hideWindow).toHaveBeenCalledOnce();
  expect(navigate).toHaveBeenCalledOnce();
  expect(navigate).toHaveBeenCalledWith("/app/guide?host=abc#faq");
});
