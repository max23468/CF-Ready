import { renderToReadableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";
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
      onError(error: unknown) {
        responseStatusCode = 500;
        if (shellRendered) {
          // Nome e stack bastano a localizzare il difetto; il messaggio può contenere
          // URL, query string o dati dello store.
          console.error(
            JSON.stringify({
              event: "render_failed",
              class: "error",
              error_name: error instanceof Error ? error.name : "unknown",
              // La prima riga dello stack ripete il messaggio: si tengono solo i frame.
              frames: error instanceof Error ? error.stack?.split("\n").slice(1, 6) : undefined,
            }),
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
