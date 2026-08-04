import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  failOnFlakyTests: Boolean(process.env.CI),
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
      cwd: repositoryRoot,
      url: "http://localhost:4173/favicon.svg",
      timeout: 120_000,
    },
    {
      command: "npm run site:dev -- --port 4174",
      cwd: repositoryRoot,
      url: "http://localhost:4174",
      timeout: 120_000,
    },
  ],
  projects: [
    {
      // Il percorso pre-OAuth si verifica sulle risposte HTTP, non su un rendering: niente
      // viewport da confrontare.
      name: "install-chromium",
      testMatch: /install\.spec\.ts/,
      use: {
        browserName: "chromium",
        baseURL: "http://localhost:4173",
      },
    },
    {
      name: "site-webkit-stretto",
      testMatch: /site\.spec\.ts/,
      use: {
        browserName: "webkit",
        baseURL: "http://localhost:4174",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "site-webkit-largo",
      testMatch: /site\.spec\.ts/,
      use: {
        browserName: "webkit",
        baseURL: "http://localhost:4174",
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
