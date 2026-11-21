import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

const config = {
  test: {
    forceRerunTriggers: ["**/tests/fixtures/**", "**/src/**"],
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.ts", path.resolve(root, "../../app/checkout-field-validation.ts")],
      allowExternal: true,
    },
  },
};

export default config;
