import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeAll } from "vitest";

beforeAll(() =>
  applyD1Migrations(env.DB, (env as Env & { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS),
);
