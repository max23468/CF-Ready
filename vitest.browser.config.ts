import path from "node:path";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const routeTests = [
  "tests/browser/route-surfaces.test.tsx",
  "tests/browser/home-route.test.tsx",
  "tests/browser/guide-route.test.tsx",
  "tests/browser/messages-route.test.tsx",
  "tests/browser/onboarding-route.test.tsx",
  "tests/browser/rules-route.test.tsx",
  "tests/browser/visual-surfaces.test.tsx",
];

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": path.join(root, "tests/browser/cloudflare-workers.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: [
      "@shopify/shopify-app-react-router/server",
      "@react-router/dev/routes",
      "react",
      "react-dom/client",
      "react-dom/server",
      "react/jsx-dev-runtime",
      "react-router",
    ],
  },
  test: {
    include: ["tests/browser/**/*.test.tsx"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        { browser: "chromium", name: "merchant-chromium", exclude: routeTests },
        {
          browser: "chromium",
          name: "merchant-chromium-routes",
          include: routeTests,
          setupFiles: [path.join(root, "tests/browser/route-setup.tsx")],
        },
        {
          browser: "webkit",
          name: "merchant-webkit-critical",
          include: routeTests,
          setupFiles: [path.join(root, "tests/browser/route-setup.tsx")],
        },
        ...(["chromium", "webkit"] as const).map((browser) => ({
          browser,
          name: `merchant-${browser}-polaris-v2`,
          include: ["tests/browser/visual-surfaces.test.tsx"],
          setupFiles: [path.join(root, "tests/browser/route-setup.tsx")],
          provide: { polarisEnvironment: "development" },
        })),
      ],
    },
    coverage: {
      provider: "istanbul",
      include: ["app/**/*.{ts,tsx}"],
      exclude: [
        "app/**/*.d.ts",
        "app/**/*.server.{ts,tsx}",
        "app/billing/types.ts",
        "app/i18n/types.ts",
        // Questi moduli sono già coperti nella corsia Workers; Vite Browser può trasformarli
        // con mappe diverse tra piattaforme e produrrebbe un secondo denominatore.
        "app/embedded-admin.ts",
        "app/owner-control/*.ts",
        "app/owner-notifications/model.ts",
        "app/routes/app._index.tsx",
        "app/reporting/*.ts",
      ],
    },
  },
});
