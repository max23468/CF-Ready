import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import * as onboardingRoute from "../app/routes/app.onboarding";
import { saveOnboarding } from "../app/validation/repository.server";
import { merchant, routeArgs } from "./support/merchant";

const auth = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("../app/shopify.server", () => ({ authenticate: { admin: auth.admin } }));

test("l’Onboarding riusa lo snapshot Shopify combinato", async () => {
  const { shop, shopify } = await merchant("onboarding");
  await saveOnboarding(env.DB, shop, { status: "in_progress", step: 2 });
  shopify.addValidation(DEFAULT_CONFIG, false);
  auth.admin.mockResolvedValue({
    admin: shopify.admin,
    session: { shop },
    scopes: { query: vi.fn().mockResolvedValue({ granted: [] }) },
  });
  const load = (path: string) =>
    onboardingRoute.loader(routeArgs(new Request(`https://example.test${path}`)));

  const result = await load("/app/onboarding?locale=it");

  expect(result.data).toMatchObject({ step: 2, completed: false, entitled: false });

  // Ricaricando la pagina si resta al passo indicato nell'URL.
  const reloaded = await load("/app/onboarding?locale=it&step=4");
  expect(reloaded.data).toMatchObject({ step: 4 });

  const serverTiming = new Headers(result.init?.headers).get("Server-Timing");
  expect(serverTiming).toMatch(/auth;dur=.*d1_onboarding;dur=.*total;dur=/);
  // I tempi della riconciliazione confluiscono nello stesso header della pagina.
  expect(serverTiming).toContain("d1_commercial;dur=");
  expect(
    new Headers(
      onboardingRoute.headers({
        loaderHeaders: new Headers(result.init?.headers),
        parentHeaders: new Headers(),
      } as never),
    ).get("Server-Timing"),
  ).toBe(serverTiming);
  expect(shopify.callsTo("CfReadyHomeSnapshot")).toHaveLength(2);
  expect(shopify.callsTo("CfReadyContext", "CfReadyBilling")).toEqual([]);
});
