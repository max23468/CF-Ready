import type { ActionFunctionArgs } from "react-router";
import { authenticateAdmin } from "../admin-auth.server";
import { databaseContext } from "../context.server";
import { APP_VERSION } from "../env.server";
import { normalizePerformanceReport, recordPerformanceReport } from "../performance.server";

const MAX_REPORT_BYTES = 16_384;

export const action = async ({ request, context }: ActionFunctionArgs) => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return new Response(null, { status: 415 });
  }
  const announcedLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(announcedLength) && announcedLength > MAX_REPORT_BYTES) {
    return new Response(null, { status: 413 });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_REPORT_BYTES) {
    return new Response(null, { status: 413 });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  const report = normalizePerformanceReport(parsed);
  if (!report) return new Response(null, { status: 400 });

  const { session } = await authenticateAdmin(request, context);
  await recordPerformanceReport(context.get(databaseContext), session.shop, APP_VERSION, report);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};
