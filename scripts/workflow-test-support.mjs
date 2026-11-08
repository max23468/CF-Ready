import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

function loadGithubFile(path) {
  return parse(readFileSync(new URL(`../.github/${path}`, import.meta.url), "utf8"));
}

export function loadWorkflow(file) {
  return loadGithubFile(`workflows/${file}`);
}

export function loadAction(name) {
  return loadGithubFile(`actions/${name}/action.yml`);
}

export function findStep(job, command) {
  const step = job.steps.find(({ run, uses }) => command.test(run ?? uses));
  assert.ok(step, `nessuno step esegue ${command}`);
  return step;
}

export function stepProducing(job, output) {
  const [, id] = job.outputs[output].match(/steps\.([\w-]+)\.outputs\./);
  const step = job.steps.find((candidate) => candidate.id === id);
  assert.ok(step, `nessuno step produce ${output}`);
  return step;
}

export function commands(workflow) {
  return Object.values(workflow.jobs)
    .flatMap((job) => job.steps.flatMap(({ run }) => run ?? []))
    .join("\n");
}

export function assertStepOrder(job, ...steps) {
  const positions = steps.map((step) =>
    job.steps.indexOf(step instanceof RegExp ? findStep(job, step) : step),
  );
  assert.ok(
    positions.every((position, index) => position > (positions[index - 1] ?? -1)),
    `ordine degli step errato: ${positions.join(", ")}`,
  );
}

export function assertNeeds(job, ...jobIds) {
  assert.deepEqual(new Set([job.needs].flat()), new Set(jobIds));
}
