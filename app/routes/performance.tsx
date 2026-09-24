import type { ActionFunctionArgs } from "react-router";
import { databaseContext } from "../context.server";
import { APP_VERSION } from "../env.server";
import {
  normalizePerformanceReport,
  recordPerformanceReport,
  verifyPerformanceToken,
} from "../performance.server";

const MAX_REPORT_BYTES = 16_384;

const payloadTooLarge = () => new Response(null, { status: 413 });

async function readReportBody(request: Request): Promise<string | Response> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_REPORT_BYTES)
  ) {
    return payloadTooLarge();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const body = new Uint8Array(MAX_REPORT_BYTES);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > MAX_REPORT_BYTES - length) {
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

  return new TextDecoder().decode(body.subarray(0, length));
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return new Response(null, { status: 415 });
  }

  const body = await readReportBody(request);
  if (body instanceof Response) return body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  const report = normalizePerformanceReport(parsed);
  if (!report) return new Response(null, { status: 400 });

  const shopDomain = await verifyPerformanceToken((parsed as { token?: unknown }).token);
  if (!shopDomain) return new Response(null, { status: 401 });
  await recordPerformanceReport(context.get(databaseContext), shopDomain, APP_VERSION, report);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};
