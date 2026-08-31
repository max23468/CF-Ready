import { bench, describe } from "vitest";
import { readBilling } from "../app/billing.server";
import { queryContext, queryHomeSnapshot } from "../app/validation.server";
import { SENZA_ADDEBITI, shopContext } from "../tests/support/lifecycle";

const SHOPIFY_ROUND_TRIP_MS = 75;
const context = shopContext("IT", false);

function delayedAdmin(snapshot: boolean) {
  return {
    graphql: async (query: string) => {
      await new Promise((resolve) => setTimeout(resolve, SHOPIFY_ROUND_TRIP_MS));
      const response = snapshot
        ? { data: { ...context.data, ...SENZA_ADDEBITI.data } }
        : query.includes("currentAppInstallation")
          ? SENZA_ADDEBITI
          : context;
      return Response.json(response);
    },
  };
}

describe("critical path di riconciliazione con 75 ms per round trip Shopify", () => {
  bench("prima: contesto e billing in due richieste seriali", async () => {
    const admin = delayedAdmin(false);
    await queryContext(admin);
    await readBilling(admin);
  });

  bench("dopo: contesto e billing nello snapshot combinato", async () => {
    await queryHomeSnapshot(delayedAdmin(true));
  });
});
