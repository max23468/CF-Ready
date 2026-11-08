import { readLimitedBody } from "../app/limited-body";

export const MAX_FORM_BODY_BYTES = 16 * 1024;

export async function limitFormBody(request: Request): Promise<Request | Response> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (
    contentType !== "application/x-www-form-urlencoded" &&
    contentType !== "multipart/form-data"
  ) {
    return request;
  }

  const body = await readLimitedBody(request, MAX_FORM_BODY_BYTES);
  if (!body) return new Response("Payload too large.", { status: 413 });
  if (!request.body) return request;

  const headers = new Headers(request.headers);
  headers.set("content-length", String(body.byteLength));
  // oxlint-disable-next-line unicorn/no-invalid-fetch-options -- Il body presente esclude GET e HEAD.
  return new Request(request, { body, headers });
}
