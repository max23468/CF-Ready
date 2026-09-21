import { beforeEach, expect, test, vi } from "vitest";
import { createAppContext } from "../app/context.server";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), readSessionTimings: vi.fn() }));

vi.mock("../app/shopify.server", () => ({
  authenticate: { admin: mocks.authenticate },
}));
vi.mock("../app/session-storage.server", () => ({
  readSessionTimings: mocks.readSessionTimings,
}));

beforeEach(() => {
  mocks.authenticate.mockReset();
  mocks.readSessionTimings.mockReset().mockReturnValue({});
});

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

test("scompone il refresh della sessione nel Server-Timing", async () => {
  const session = { shop: "example.myshopify.com" };
  const authenticated = { admin: {}, session };
  mocks.authenticate.mockResolvedValue(authenticated);
  mocks.readSessionTimings.mockReturnValue({
    auth_session_lookup: 10,
    auth_session_decrypt: 20,
    auth_session_encrypt: 5,
    auth_session_store: 15,
    auth_after_hook: 7,
  });
  const now = vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(250);
  const timing = { record: vi.fn() };
  const { authenticateAdminTimed } = await import("../app/admin-auth.server");

  await expect(
    authenticateAdminTimed(
      new Request("https://example.test/app"),
      createAppContext({} as D1Database),
      timing as never,
    ),
  ).resolves.toBe(authenticated);

  expect(timing.record.mock.calls).toEqual([
    ["auth", 150],
    ["auth_session_lookup", 10],
    ["auth_session_decrypt", 20],
    ["auth_session_encrypt", 5],
    ["auth_session_store", 15],
    ["auth_after_hook", 7],
    ["auth_token_exchange", 93],
  ]);
  now.mockRestore();
});
