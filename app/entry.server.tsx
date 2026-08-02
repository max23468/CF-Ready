import { renderToReadableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";
import { logEvent } from "./events.server";
import { addDocumentResponseHeaders } from "./shopify.server";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);
  let shellRendered = false;

  const body = await renderToReadableStream(
    <ServerRouter context={reactRouterContext} url={request.url} />,
    {
      onError() {
        responseStatusCode = 500;
        if (shellRendered) {
          // Messaggio e stack possono contenere URL, query string o dati dello store.
          logEvent(
            {
              name: "render_failed",
              class: "error",
              metadata: { error_code: "render_stream_failed" },
            },
            new Date().toISOString(),
          );
        }
      },
    },
  );
  shellRendered = true;

  if (reactRouterContext.isSpaMode) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
