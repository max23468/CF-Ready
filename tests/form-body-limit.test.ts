import { describe, expect, it } from "vitest";
import { MAX_FORM_BODY_BYTES, limitFormBody } from "../workers/form-body";

const url = "https://cf-ready.test/app";
const formHeaders = { "content-type": "application/x-www-form-urlencoded" };

describe("limite dei form HTTP", () => {
  it("conserva un form legittimo", async () => {
    const limited = await limitFormBody(
      new Request(url, {
        method: "POST",
        headers: formHeaders,
        body: "intent=enable",
      }),
    );

    expect(limited).toBeInstanceOf(Request);
    expect((await (limited as Request).formData()).get("intent")).toBe("enable");
  });

  it("rifiuta la dimensione dichiarata prima di leggere il body", async () => {
    const limited = await limitFormBody(
      new Request(url, {
        method: "POST",
        headers: {
          ...formHeaders,
          "content-length": String(MAX_FORM_BODY_BYTES + 1),
        },
        body: "intent=enable",
      }),
    );

    expect(limited).toBeInstanceOf(Response);
    expect((limited as Response).status).toBe(413);
  });

  it("rifiuta un body senza Content-Length oltre il limite", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: formHeaders,
      body: `value=${"a".repeat(MAX_FORM_BODY_BYTES)}`,
    });
    expect(request.headers.has("content-length")).toBe(false);

    const limited = await limitFormBody(request);

    expect(limited).toBeInstanceOf(Response);
    expect((limited as Response).status).toBe(413);
  });

  it("non limita i payload non form", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "a".repeat(MAX_FORM_BODY_BYTES) }),
    });

    expect(await limitFormBody(request)).toBe(request);
  });
});
