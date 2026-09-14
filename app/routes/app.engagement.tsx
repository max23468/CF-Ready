import type { ActionFunctionArgs } from "react-router";
import { authenticateAdmin } from "../admin-auth.server";
import { databaseContext } from "../context.server";
import { logEvent } from "../events.server";
import {
  parseEngagementHeaders,
  recordInstallationEngagement,
} from "../installation-diagnostics.server";

const headers = { "Cache-Control": "no-store", Allow: "POST" };
export const loader = () => new Response(null, { status: 405, headers });

export const action = async ({ request, context }: ActionFunctionArgs) => {
  if (request.method !== "POST") return loader();
  // Il contratto non accetta un body, domini, timestamp osservati o eventi liberi dal browser.
  const report = parseEngagementHeaders(request.headers);
  if (!report || !(await hasEmptyBody(request))) {
    return new Response(null, { status: 400, headers });
  }
  const { session } = await authenticateAdmin(request, context);
  try {
    await recordInstallationEngagement(
      context.get(databaseContext),
      session.shop,
      report.installedAt,
      report.event,
    );
    return new Response(null, { status: 204, headers });
  } catch {
    logEvent({ name: "engagement_write_failed", class: "error" }, new Date().toISOString());
    return new Response(null, { status: 503, headers });
  }
};

async function hasEmptyBody(request: Request) {
  if (!request.body) return true;
  const reader = request.body.getReader();
  try {
    for (;;) {
      // Anche un POST senza contenuto può arrivare come stream vuoto dal provider.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const { done, value } = await reader.read();
      if (done) return true;
      if (value.byteLength > 0) {
        await reader.cancel();
        return false;
      }
    }
  } catch {
    return false;
  } finally {
    reader.releaseLock();
  }
}
