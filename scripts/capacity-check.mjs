import { spawn } from "node:child_process";
import { appendFile } from "node:fs/promises";

const REQUESTS = 120;
const MIN_EVENTS = 100;
const CPU_LIMIT_MS = 10;
const TAIL_READY_TIMEOUT_MS = 60_000;
const TAIL_POLL_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 15_000;

export function parseJsonObjects(input) {
  const objects = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) objects.push(JSON.parse(input.slice(start, index + 1)));
    }
  }
  return objects;
}

export function assessCapacity(events, marker, minimum = MIN_EVENTS) {
  const tagged = events.filter(
    ({ event }) => header(event?.request?.headers, "x-cf-ready-capacity") === marker,
  );
  const measured = tagged.filter(
    ({ event }) => header(event?.request?.headers, "x-cf-ready-capacity-phase") === "measure",
  );
  if (measured.length < minimum || measured.length > REQUESTS) {
    throw new Error(
      `Tail incompleto: ${measured.length}/${minimum} eventi misurabili ` +
        `su ${events.length} eventi totali.`,
    );
  }
  if (
    tagged.some(
      ({ outcome, event }) =>
        outcome !== "ok" || event?.response?.status < 200 || event?.response?.status >= 400,
    )
  ) {
    throw new Error("Il carico sintetico contiene errori Worker o HTTP.");
  }
  const cpuTimes = measured.map(({ cpuTime }) => cpuTime).sort((left, right) => left - right);
  const taggedCpuTimes = tagged.map(({ cpuTime }) => cpuTime);
  if (taggedCpuTimes.some((value) => !Number.isFinite(value))) {
    throw new Error("Il tail non contiene CPU time validi.");
  }
  const p95 = cpuTimes[Math.ceil(cpuTimes.length * 0.95) - 1];
  const maximum = Math.max(...taggedCpuTimes);
  if (p95 > CPU_LIMIT_MS / 2) {
    throw new Error(`CPU p95 ${p95} ms oltre la soglia operativa di ${CPU_LIMIT_MS / 2} ms.`);
  }
  return { requests: measured.length, p95, maximum };
}

async function main() {
  const target = process.argv[2] ?? "https://cf-ready-dev.tmsf.workers.dev";
  const worker = process.argv[3] ?? "cf-ready-dev";
  const marker = [
    "cf-ready",
    process.env.GITHUB_RUN_ID ?? "local",
    process.env.GITHUB_RUN_ATTEMPT ?? process.pid,
    Date.now(),
  ].join("-");
  let output = "";
  let errors = "";
  const tail = spawn(
    "./node_modules/.bin/wrangler",
    [
      "tail",
      worker,
      "--format",
      "json",
      "--sampling-rate",
      "0.999",
      "--header",
      `X-CF-Ready-Capacity:${marker}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  tail.stdout.setEncoding("utf8").on("data", (chunk) => (output += chunk));
  tail.stderr.setEncoding("utf8").on("data", (chunk) => (errors += chunk));

  try {
    await waitForTail(
      tail,
      target,
      marker,
      () => output,
      () => errors,
    );
    await requestBatch(target, 10, 1, marker, "warmup");
    await requestBatch(target, REQUESTS, 5, marker, "measure");
    await waitForEvents(() => output, marker);
  } finally {
    await stop(tail);
  }

  const result = assessCapacity(parseJsonObjects(output), marker);
  const summary =
    `Capacità Development: ${result.requests} richieste, CPU p95 ${result.p95} ms, ` +
    `massimo ${result.maximum} ms, errori 0.`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `- ${summary}\n`);
  }
}

export async function waitForTail(
  tail,
  target,
  marker,
  output,
  errors,
  { request = requestBatch, pause = wait, now = () => performance.now() } = {},
) {
  const deadline = now() + TAIL_READY_TIMEOUT_MS;
  while (now() < deadline) {
    if (tail.exitCode !== null) throw new Error(`Tail Cloudflare non avviato: ${errors().trim()}`);
    const requestTimeout = Math.max(1, Math.ceil(deadline - now()));
    await request(target, 1, 1, marker, "probe", Math.min(REQUEST_TIMEOUT_MS, requestTimeout));
    if (parseJsonObjects(output()).length) return;
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await pause(Math.min(TAIL_POLL_INTERVAL_MS, remaining));
    if (parseJsonObjects(output()).length) return;
  }
  throw new Error("Tail Cloudflare non pronto entro 60 secondi.");
}

export async function waitForEvents(output, marker, pause = wait) {
  let samplesAfterMinimum = 0;
  for (let attempt = 0; attempt < 44; attempt += 1) {
    const count = parseJsonObjects(output()).filter(
      ({ event }) =>
        header(event?.request?.headers, "x-cf-ready-capacity") === marker &&
        header(event?.request?.headers, "x-cf-ready-capacity-phase") === "measure",
    ).length;
    if (count === REQUESTS) return;
    samplesAfterMinimum = count >= MIN_EVENTS ? samplesAfterMinimum + 1 : 0;
    if (samplesAfterMinimum === 5) return;
    await pause(500);
  }
}

async function requestBatch(
  target,
  count,
  concurrency,
  marker,
  phase,
  timeout = REQUEST_TIMEOUT_MS,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < count) {
        next += 1;
        const response = await fetch(target, {
          headers: {
            "X-CF-Ready-Capacity": marker,
            "X-CF-Ready-Capacity-Phase": phase,
          },
          redirect: "manual",
          signal: AbortSignal.timeout(timeout),
        });
        if (response.status < 200 || response.status >= 400) {
          throw new Error(`Carico sintetico interrotto da HTTP ${response.status}.`);
        }
      }
    }),
  );
}

function header(headers, name) {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key && headers[key];
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function stop(child) {
  if (child.exitCode !== null) return;
  const closed = new Promise((resolve) => child.once("close", () => resolve(true)));
  child.kill("SIGINT");
  if (await Promise.race([closed, wait(5000).then(() => false)])) return;
  child.kill("SIGKILL");
  await closed;
}

if (import.meta.main) await main();
