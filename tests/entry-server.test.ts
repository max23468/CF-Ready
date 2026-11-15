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

test("crea la risposta HTML", async () => {
  mocks.render.mockResolvedValue(stream());
  const headers = new Headers();
  const request = new Request("https://cf-ready.test/app");

  const response = await handleRequest(request, 202, headers, { isSpaMode: false } as never);

  expect(mocks.addDocumentResponseHeaders).toHaveBeenCalledWith(request, headers);
  expect(response.status).toBe(202);
  expect(response.headers.get("content-type")).toBe("text/html");
  expect(await response.text()).toBe("<html></html>");
});

test("il documento dichiara sicurezza e una CSP script-src in sola osservazione", async () => {
  mocks.render.mockResolvedValue(stream());
  // La CSP applicata resta quella di Shopify con `frame-ancestors`.
  mocks.addDocumentResponseHeaders.mockImplementation((_request: Request, headers: Headers) =>
    headers.set("Content-Security-Policy", "frame-ancestors https://admin.shopify.com"),
  );
  const nonces = new Set<string>();
  for (let index = 0; index < 2; index += 1) {
    const response = await handleRequest(
      new Request("https://cf-ready.test/app"),
      200,
      new Headers(),
      { isSpaMode: false } as never,
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("content-security-policy")).toBe(
      "frame-ancestors https://admin.shopify.com",
    );
    const policy = response.headers.get("content-security-policy-report-only")!;
    const nonce = /script-src 'nonce-([A-Za-z0-9+/=]{24})' 'strict-dynamic'/.exec(policy)?.[1];
    expect(nonce).toBeDefined();
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    // Lo stesso nonce arriva al render React e a quello di React Router.
    const [element, options] = mocks.render.mock.calls.at(-1)!;
    expect(options.nonce).toBe(nonce);
    expect(element.props.value).toBe(nonce);
    expect(element.props.children.props.nonce).toBe(nonce);
    nonces.add(nonce!);
  }
  expect(nonces.size).toBe(2);
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
