import { expect, test, vi } from "vitest";
import {
  APP_WINDOW_NAVIGATION_MESSAGE_TYPE,
  handleAppWindowNavigation,
  requestAppWindowNavigation,
} from "../app/app-window-navigation";

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

test("una route normale senza App Window continua a usare React Router", () => {
  const navigate = vi.fn();

  expect(
    requestAppWindowNavigation(
      { location: { origin: "https://app.example" } as Location, opener: null },
      "/app/messages",
      navigate,
    ),
  ).toBe("fallback");
  expect(navigate).toHaveBeenCalledWith("/app/messages");
});

test("la Home nasconde l'App Window prima di navigare nella cornice Shopify", async () => {
  const calls: string[] = [];
  const event = {
    origin: "https://app.example",
    data: { type: APP_WINDOW_NAVIGATION_MESSAGE_TYPE, href: "/app" },
  } as MessageEvent;

  expect(
    await handleAppWindowNavigation(event, "https://app.example", {
      hideWindow: async () => void calls.push("hide"),
      navigate: (href) => calls.push(`navigate:${href}`),
    }),
  ).toBe(true);
  expect(calls).toEqual(["hide", "navigate:/app"]);
});

test("messaggi esterni o destinazioni fuori app non possono pilotare la navigazione", async () => {
  const hideWindow = vi.fn(async () => undefined);
  const navigate = vi.fn();

  for (const event of [
    {
      origin: "https://external.example",
      data: { type: APP_WINDOW_NAVIGATION_MESSAGE_TYPE, href: "/app" },
    },
    {
      origin: "https://app.example",
      data: { type: APP_WINDOW_NAVIGATION_MESSAGE_TYPE, href: "https://external.example" },
    },
  ]) {
    expect(
      await handleAppWindowNavigation(event as MessageEvent, "https://app.example", {
        hideWindow,
        navigate,
      }),
    ).toBe(false);
  }

  expect(hideWindow).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});
