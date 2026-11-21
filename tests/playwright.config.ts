import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const appPort = process.env.CF_READY_E2E_APP_PORT ?? "4173";
const sitePort = process.env.CF_READY_E2E_SITE_PORT ?? "4174";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // Nessun retry: un test che passa solo al secondo tentativo ha un bug da correggere.
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `npm run build && vite preview --mode dev --port ${appPort} --strictPort`,
      // La Vite plugin passa al Worker le variabili di processo solo con questo flag.
      env: { CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", SHOPIFY_API_SECRET: "e2e-test-secret" },
      cwd: repositoryRoot,
      url: `http://localhost:${appPort}/favicon.svg`,
    },
    {
      command: `npm run site:dev -- --port ${sitePort}`,
      cwd: repositoryRoot,
      url: `http://localhost:${sitePort}`,
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
        baseURL: `http://localhost:${appPort}`,
      },
    },
    {
      name: "site-chromium-stretto",
      testMatch: /site\.spec\.ts/,
      use: {
        browserName: "chromium",
        baseURL: `http://localhost:${sitePort}`,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "site-webkit-stretto",
      testMatch: /site\.spec\.ts/,
      use: {
        browserName: "webkit",
        baseURL: `http://localhost:${sitePort}`,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "site-webkit-largo",
      testMatch: /site\.spec\.ts/,
      use: {
        browserName: "webkit",
        baseURL: `http://localhost:${sitePort}`,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
