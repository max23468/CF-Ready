import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "npm run build && npx wrangler dev --config build/server/wrangler.json --var SHOPIFY_API_SECRET:e2e-test-secret --port 4173",
      cwd: "..",
      url: "http://localhost:4173/auth/login",
      timeout: 120_000,
    },
    {
      command: "npm run site:dev -- --port 4174",
      cwd: "..",
      url: "http://localhost:4174",
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "login-chromium",
      testMatch: /login\.spec\.ts/,
      use: {
        browserName: "chromium",
        baseURL: "http://localhost:4173",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "site-webkit",
      testMatch: /site\.spec\.ts/,
      use: {
        browserName: "webkit",
        baseURL: "http://localhost:4174",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
