import { spawnSync } from "node:child_process";

// Le chiamate provider idempotenti ritentano un errore transitorio di rete o API prima di far
// fallire il deploy. L'errore del provider resta visibile: la CLI Shopify, per esempio, riduce
// ogni errore di ricerca di una versione a «could not be found».
export function retryCommand(
  command,
  args,
  { stdio = ["pipe", "pipe", "inherit"], attempts, delayMs },
) {
  for (let attempt = 1; ; attempt += 1) {
    const result = spawnSync(command, args, { encoding: "utf8", stdio });
    if (result.status === 0 || attempt >= attempts) return result;
    console.warn(`Chiamata ${command} ${args.slice(0, 2).join(" ")} fallita, nuovo tentativo.`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs * attempt);
  }
}

function preflightCommand(command, args, { stdio, attempts = 3, delayMs = 2_000 }) {
  const result = retryCommand(command, args, { stdio, attempts, delayMs });
  if (result.status !== 0) {
    throw new Error(`Preflight fallito: ${command} ${args.slice(0, 2).join(" ")}`);
  }
  return result.stdout;
}

export function run(command, args) {
  preflightCommand(command, args, { stdio: "inherit" });
}

export function capture(command, args, options = {}) {
  return preflightCommand(command, args, options);
}
