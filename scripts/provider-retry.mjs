import { pathToFileURL } from "node:url";
import { retryCommand } from "./provider-command.mjs";

const ATTEMPTS = 4;

// Il 23 ottobre 2026 un HTTP 500 Cloudflare ha fatto fallire il readback del Worker Production
// e il rollback non ha rilasciato la versione Shopify precedente, che esisteva. Deploy e
// rollback ritentano quindi le chiamate provider idempotenti: letture, release di una
// versione esistente e deployment di una versione Worker già caricata.
function retryProvider(argv, { delayMs = 5_000 } = {}) {
  const separator = argv.indexOf("--");
  const [command, ...args] = separator >= 0 ? argv.slice(separator + 1) : argv;
  if (!command) throw new Error("Uso: node scripts/provider-retry.mjs -- <comando> [argomenti]");
  const result = retryCommand(command, args, { attempts: ATTEMPTS, delayMs });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.slice(0, 3).join(" ")} non riuscito dopo ${ATTEMPTS} tentativi.`,
    );
  }
  return result.stdout;
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  try {
    const delayMs = Number(process.env.CF_READY_PROVIDER_RETRY_MS);
    process.stdout.write(
      retryProvider(process.argv.slice(2), Number.isFinite(delayMs) ? { delayMs } : {}) ?? "",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
