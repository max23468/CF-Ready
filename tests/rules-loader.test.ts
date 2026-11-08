import { expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import * as rulesRoute from "../app/routes/app.rules";
import { merchant, routeArgs } from "./support/merchant";

const auth = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("../app/shopify.server", () => ({ authenticate: { admin: auth.admin } }));

test("la pagina Regole carica l’entitlement autorevole per l’anteprima", async () => {
  const { shop, shopify } = await merchant("rules-loader");
  shopify.addValidation(DEFAULT_CONFIG, true);
  auth.admin.mockResolvedValue({
    admin: shopify.admin,
    session: { shop },
    scopes: { query: vi.fn(async () => ({ granted: [] })) },
  });

  const result = await rulesRoute.loader(
    routeArgs(new Request("https://example.test/app/rules?locale=it")),
  );

  expect(result.data).toMatchObject({ enabled: true, entitled: false });
  const serverTiming = new Headers(result.init?.headers).get("Server-Timing");
  expect(serverTiming).toMatch(/auth;dur=/);
  expect(serverTiming).toMatch(/d1_validation_state;dur=/);
  expect(serverTiming).not.toMatch(/d1_configuration_history/);
  expect(serverTiming).toMatch(/total;dur=/);
  // I tempi della riconciliazione confluiscono nello stesso header della pagina.
  expect(serverTiming).toMatch(/d1_commercial;dur=/);
  expect(
    new Headers(
      rulesRoute.headers({
        loaderHeaders: new Headers(result.init?.headers),
        parentHeaders: new Headers(),
      } as never),
    ).get("Server-Timing"),
  ).toBe(serverTiming);
  expect(shopify.callsTo("CfReadyHomeSnapshot")).toHaveLength(1);
  expect(shopify.callsTo("CfReadyContext", "CfReadyBilling")).toEqual([]);
});
