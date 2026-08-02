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
  projects: [
    {
      name: "login-chromium",
      testMatch: /login\.spec\.ts/,
      use: {
        browserName: "chromium",
        baseURL: "https://cf-ready-dev.tmsf.workers.dev",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "site-webkit",
      testMatch: /site\.spec\.ts/,
      use: {
        browserName: "webkit",
        baseURL: "https://cf-ready.pages.dev",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
