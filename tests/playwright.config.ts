import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

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
      command: "node scripts/vite-dev.mjs",
      cwd: repositoryRoot,
      env: {
        PORT: "3000",
        SHOPIFY_APP_URL: "http://localhost:3000",
        SHOPIFY_API_SECRET: "e2e",
        SESSION_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      },
      url: "http://localhost:3000/auth/login",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run site:dev -- --port 3001 --ip 127.0.0.1",
      cwd: repositoryRoot,
      url: "http://127.0.0.1:3001",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: "login-chromium-stretto",
      testMatch: /login\.spec\.ts/,
      use: {
        browserName: "chromium",
        baseURL: "http://localhost:3000",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "login-chromium-largo",
      testMatch: /login\.spec\.ts/,
      use: {
        browserName: "chromium",
        baseURL: "http://localhost:3000",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "site-webkit-stretto",
      testMatch: /site\.spec\.ts/,
      use: {
        browserName: "webkit",
        baseURL: "http://127.0.0.1:3001",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "site-webkit-largo",
      testMatch: /site\.spec\.ts/,
      use: {
        browserName: "webkit",
        baseURL: "http://127.0.0.1:3001",
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
