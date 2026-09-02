import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  logEvent: vi.fn(),
  addDocumentResponseHeaders: vi.fn(),
}));

vi.mock("react-dom/server", () => ({ renderToReadableStream: mocks.render }));
vi.mock("../app/events.server", () => ({ logEvent: mocks.logEvent }));
vi.mock("../app/shopify.server", () => ({
  addDocumentResponseHeaders: mocks.addDocumentResponseHeaders,
}));

import handleRequest from "../app/entry.server";

function stream(body = "<html></html>") {
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  }) as ReadableStream & { allReady: Promise<void> };
  readable.allReady = Promise.resolve();
  return readable;
}

beforeEach(() => vi.clearAllMocks());

test("crea la risposta HTML e attende il rendering completo in SPA mode", async () => {
  const body = stream();
  let markReady = () => {};
  let completed = false;
  body.allReady = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  mocks.render.mockResolvedValue(body);
  const headers = new Headers();
  const request = new Request("https://cf-ready.test/app");

  const pending = handleRequest(request, 202, headers, { isSpaMode: true } as never).then(
    (response) => {
      completed = true;
      return response;
    },
  );
  await Promise.resolve();
  expect(completed).toBe(false);
  markReady();
  const response = await pending;

  expect(mocks.addDocumentResponseHeaders).toHaveBeenCalledWith(request, headers);
  expect(response.status).toBe(202);
  expect(response.headers.get("content-type")).toBe("text/html");
  expect(await response.text()).toBe("<html></html>");
});

test("un errore prima della shell restituisce 500 senza registrare dettagli", async () => {
  mocks.render.mockImplementation(async (_element, options) => {
    options.onError(new Error("URL riservato"));
    return stream();
  });

  const response = await handleRequest(
    new Request("https://cf-ready.test/app"),
    200,
    new Headers(),
    { isSpaMode: false } as never,
  );

  expect(response.status).toBe(500);
  expect(mocks.logEvent).not.toHaveBeenCalled();
});

test("un errore dopo la shell registra solo il codice sanitizzato", async () => {
  let onError: (() => void) | undefined;
  mocks.render.mockImplementation(async (_element, options) => {
    onError = options.onError;
    return stream();
  });

  await handleRequest(new Request("https://cf-ready.test/app"), 200, new Headers(), {
    isSpaMode: false,
  } as never);
  onError?.();

  expect(mocks.logEvent).toHaveBeenCalledWith(
    {
      name: "render_failed",
      class: "error",
      metadata: { error_code: "render_stream_failed" },
    },
    expect.any(String),
  );
});
