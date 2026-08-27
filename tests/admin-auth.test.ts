import { beforeEach, expect, test, vi } from "vitest";
import { createAppContext } from "../app/context.server";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn() }));

vi.mock("../app/shopify.server", () => ({
  authenticate: { admin: mocks.authenticate },
}));

beforeEach(() => mocks.authenticate.mockReset());

test("i loader della stessa richiesta condividono una sola autenticazione admin", async () => {
  const authenticated = { admin: {}, session: { shop: "example.myshopify.com" } };
  mocks.authenticate.mockResolvedValue(authenticated);
  const { authenticateAdmin } = await import("../app/admin-auth.server");
  const context = createAppContext({} as D1Database);
  const request = new Request("https://example.test/app");

  const [parent, child] = await Promise.all([
    authenticateAdmin(request, context),
    authenticateAdmin(request, context),
  ]);

  expect(parent).toBe(authenticated);
  expect(child).toBe(authenticated);
  expect(mocks.authenticate).toHaveBeenCalledOnce();
});

test("l'autenticazione non viene condivisa tra richieste", async () => {
  mocks.authenticate.mockResolvedValue({ admin: {}, session: { shop: "example.myshopify.com" } });
  const { authenticateAdmin } = await import("../app/admin-auth.server");

  await authenticateAdmin(
    new Request("https://example.test/app"),
    createAppContext({} as D1Database),
  );
  await authenticateAdmin(
    new Request("https://example.test/app/rules"),
    createAppContext({} as D1Database),
  );

  expect(mocks.authenticate).toHaveBeenCalledTimes(2);
});
