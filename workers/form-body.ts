export const MAX_FORM_BODY_BYTES = 16 * 1024;

const payloadTooLarge = () => new Response("Payload too large.", { status: 413 });

export async function limitFormBody(request: Request): Promise<Request | Response> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (
    contentType !== "application/x-www-form-urlencoded" &&
    contentType !== "multipart/form-data"
  ) {
    return request;
  }

  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_FORM_BODY_BYTES)
  ) {
    return payloadTooLarge();
  }
  if (!request.body) return request;

  const reader = request.body.getReader();
  const body = new Uint8Array(MAX_FORM_BODY_BYTES);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > MAX_FORM_BODY_BYTES - length) {
        try {
          await reader.cancel();
        } catch {
          // La risposta 413 resta la difesa anche se lo stream non si lascia cancellare.
        }
        return payloadTooLarge();
      }
      body.set(value, length);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const headers = new Headers(request.headers);
  headers.set("content-length", String(length));
  // oxlint-disable-next-line unicorn/no-invalid-fetch-options -- Il body presente esclude GET e HEAD.
  return new Request(request, { body: body.slice(0, length), headers });
}
