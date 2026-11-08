import type { ActionFunctionArgs } from "react-router";
import { databaseContext } from "../context.server";
import { APP_VERSION } from "../env.server";
import {
  normalizePerformanceReport,
  recordPerformanceReport,
  verifyPerformanceToken,
} from "../performance.server";
import { readLimitedBody } from "../limited-body";

const MAX_REPORT_BYTES = 16_384;

export const action = async ({ request, context }: ActionFunctionArgs) => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return new Response(null, { status: 415 });
  }

  const body = await readLimitedBody(request, MAX_REPORT_BYTES);
  if (!body) return new Response(null, { status: 413 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
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
