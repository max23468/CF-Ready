import path from "node:path";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

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
      instances: [{ browser: "chromium" }],
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
        "app/routes/app._index.tsx",
      ],
    },
  },
});
