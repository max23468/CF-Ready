import assert from "node:assert/strict";
import test from "node:test";
import { assessCapacity, parseJsonObjects, waitForEvents } from "./capacity-check.mjs";

const event = (cpuTime, marker = "target", outcome = "ok", status = 302, phase = "measure") => ({
  cpuTime,
  outcome,
  event: {
    request: {
      headers: {
        "x-cf-ready-capacity": marker,
        "x-cf-ready-capacity-phase": phase,
      },
    },
    response: { status },
  },
});

test("estrae oggetti JSON concatenati senza confondere stringhe e parentesi", () => {
  assert.deepEqual(parseJsonObjects('rumore {"value":"{\\\"x\\\":1}"}\n{"value":2}'), [
    { value: '{"x":1}' },
    { value: 2 },
  ]);
});

test("verifica p95, successi e numero minimo degli eventi sintetici", () => {
  const events = [
    ...Array.from({ length: 95 }, () => event(1)),
    ...Array.from({ length: 5 }, () => event(5)),
  ];

  assert.deepEqual(
    assessCapacity(
      [...events, event(22, "target", "ok", 302, "warmup"), event(99, "altro")],
      "target",
    ),
    {
      requests: 100,
      p95: 1,
      maximum: 22,
    },
  );
  assert.throws(() => assessCapacity(events.slice(0, 99), "target"), /Tail incompleto/);
  assert.throws(
    () => assessCapacity([...events, ...events, event(1)], "target"),
    /Tail incompleto/,
  );
  assert.throws(
    () =>
      assessCapacity(
        [...events.slice(0, 94), ...Array.from({ length: 6 }, () => event(6))],
        "target",
      ),
    /CPU p95/,
  );
  assert.throws(
    () => assessCapacity([...events.slice(0, 99), event(1, "target", "exception")], "target"),
    /contiene errori/,
  );
});

test("mantiene aperto il tail per gli eventi tardivi dopo il minimo", async () => {
  const counts = [100, 100, 110, 119, 120];
  let sample = 0;

  await waitForEvents(
    () =>
      counts[sample] &&
      Array.from({ length: counts[sample] }, () => JSON.stringify(event(1))).join("\n"),
    "target",
    async () => {
      sample += 1;
    },
  );

  assert.equal(sample, 4);
});
