import { spawn } from "node:child_process";

const allowed = [
  "HOME",
  "PATH",
  "TMPDIR",
  "NODE_ENV",
  "PORT",
  "FRONTEND_PORT",
  "BACKEND_PORT",
  "HOST",
  "SHOPIFY_APP_URL",
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SCOPES",
  "SESSION_ENCRYPTION_KEY",
  "SHOP_CUSTOM_DOMAIN",
];
const env = Object.fromEntries(
  allowed.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]])),
);
env.CLOUDFLARE_INCLUDE_PROCESS_ENV = "true";

const child = spawn("npm", ["exec", "vite", "dev"], {
  env,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
