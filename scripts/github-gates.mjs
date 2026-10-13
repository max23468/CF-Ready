import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { appendFileSync } from "node:fs";

function latestRequiredChecks(checkRuns, required, currentRunId = "") {
  const requiredNames = new Set(required);
  const latestChecks = new Map();
  for (const check of checkRuns) {
    if (!requiredNames.has(check.name)) continue;
    const workflowRunId = String(check.details_url ?? "").match(
      /\/actions\/runs\/(\d+)(?:\/|$)/,
    )?.[1];
    if (currentRunId && workflowRunId === String(currentRunId)) continue;
    const candidate = {
      check,
      suiteId: Number(check.check_suite?.id ?? workflowRunId ?? 0),
    };
    const previous = latestChecks.get(check.name);
    if (
      !previous ||
      candidate.suiteId > previous.suiteId ||
      (candidate.suiteId === previous.suiteId &&
        Number(check.id ?? 0) > Number(previous.check.id ?? 0))
    ) {
      latestChecks.set(check.name, candidate);
    }
  }
  return latestChecks;
}

export function missingSuccessfulChecks(checkRuns, required, currentRunId = "") {
  const latestChecks = latestRequiredChecks(checkRuns, required, currentRunId);
  return required.filter((name) => latestChecks.get(name)?.check.conclusion !== "success");
}

// Il commit unito conserva il tree dell'HEAD PR: i check di quel tree valgono anche qui,
// ma un esito concluso e non verde sul commit stesso prevale sempre.
export function missingWithEquivalentChecks(
  checkRuns,
  equivalentCheckRuns,
  required,
  currentRunId = "",
) {
  const own = latestRequiredChecks(checkRuns, required, currentRunId);
  const equivalent = latestRequiredChecks(equivalentCheckRuns, required, currentRunId);
  return required.filter((name) => {
    const conclusion = own.get(name)?.check.conclusion;
    if (conclusion) return conclusion !== "success";
    return equivalent.get(name)?.check.conclusion !== "success";
  });
}

export function developPullRequestFor(pullRequests, sha) {
  return pullRequests.find(
    (pullRequest) =>
      pullRequest.merged_at &&
      pullRequest.base?.ref === "develop" &&
      pullRequest.merge_commit_sha === sha &&
      /^[0-9a-f]{40}$/.test(pullRequest.head?.sha ?? ""),
  );
}

export function verifyPromotionHistory(commits) {
  const invalid = commits.find(
    ({ parents = [], pullRequests = [], tree, parentTrees = [] }) =>
      !(
        (parents.length === 2 && parentTrees.includes(tree)) ||
        pullRequests.some((pullRequest) => pullRequest.merged && pullRequest.base === "develop")
      ),
  );
  if (invalid) {
    throw new Error(`Il commit ${invalid.sha} non ha una provenienza review verificabile.`);
  }
}

async function request(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return response.json();
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function reviewedTreeHead(repository, sha) {
  const [detail, pullRequests] = await Promise.all([
    request(`/repos/${repository}/git/commits/${sha}`),
    request(`/repos/${repository}/commits/${sha}/pulls`),
  ]);
  const pullRequest = developPullRequestFor(pullRequests, sha);
  if (!pullRequest || !detail.tree?.sha) return undefined;
  const head = await request(`/repos/${repository}/git/commits/${pullRequest.head.sha}`);
  return head.tree?.sha === detail.tree.sha ? pullRequest.head.sha : undefined;
}

// Il riuso è un'ottimizzazione: prove assenti, incomplete o API indisponibile
// portano alla suite ordinaria, senza produrre un check verde di comodo.
export async function reviewedCiEvidence(repository, sha, domains = []) {
  try {
    const head = await reviewedTreeHead(repository, sha);
    if (!head) return undefined;
    const checks = await checkRunsFor(repository, head);
    if (missingSuccessfulChecks(checks, ["verify", "e2e", "coverage", "mutation"]).length)
      return undefined;
    const { workflow_runs: runs } = await request(
      `/repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${head}&event=pull_request&per_page=100`,
    );
    const latest = runs.sort((a, b) => b.id - a.id)[0];
    if (
      latest?.head_sha !== head ||
      latest.event !== "pull_request" ||
      latest.conclusion !== "success"
    )
      return undefined;
    const runChecks = checks.filter((check) =>
      check.details_url?.includes(`/actions/runs/${latest.id}/`),
    );
    if (missingSuccessfulChecks(runChecks, ["verify", "e2e", "coverage", "mutation"]).length)
      return undefined;
    const { artifacts } = await request(
      `/repos/${repository}/actions/runs/${latest.id}/artifacts?per_page=100`,
    );
    const requiredArtifacts = [
      `ci-reusable-${latest.id}`,
      ...domains.map((domain) => `mutation-incremental-${domain}`),
    ];
    if (
      requiredArtifacts.some(
        (name) => !artifacts.some((artifact) => artifact.name === name && !artifact.expired),
      )
    )
      return undefined;
    return { head, runId: latest.id };
  } catch {
    return undefined;
  }
}

async function checkRunsFor(repository, sha) {
  const { check_runs: checkRuns } = await request(
    `/repos/${repository}/commits/${sha}/check-runs?per_page=100`,
  );
  return checkRuns;
}

export async function waitForChecks(repository, sha, required, options = {}) {
  const attempts = options.attempts ?? 60;
  const intervalMs = options.intervalMs ?? 10_000;
  // ci-policy attesta lo SHA candidato esatto: non si eredita mai da un altro commit.
  const treeReusable = required.filter((name) => name !== "ci-policy");
  let equivalentHead;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const checkRuns = await checkRunsFor(repository, sha);
    if (required.includes("ci-policy")) {
      const { statuses = [] } = await request(`/repos/${repository}/commits/${sha}/status`);
      checkRuns.push(
        ...statuses.map((status) => ({
          id: status.id,
          name: status.context,
          conclusion: status.state === "success" ? "success" : status.state,
          details_url: status.target_url,
          check_suite: { id: status.id },
        })),
      );
    }
    let missing = missingSuccessfulChecks(checkRuns, required, process.env.GITHUB_RUN_ID);
    if (missing.length > 0 && options.reuseReviewedTree && treeReusable.length > 0) {
      equivalentHead ??= (await reviewedTreeHead(repository, sha)) ?? null;
      if (equivalentHead) {
        const equivalentRuns = (await checkRunsFor(repository, equivalentHead)).filter(({ name }) =>
          treeReusable.includes(name),
        );
        missing = missingWithEquivalentChecks(
          checkRuns,
          equivalentRuns,
          required,
          process.env.GITHUB_RUN_ID,
        );
        if (missing.length === 0) {
          console.log(`Gate di ${sha} riusati dall'HEAD PR ${equivalentHead} con tree identico.`);
        }
      }
    }
    if (missing.length === 0) return checkRuns;
    if (attempt === attempts - 1) {
      throw new Error(`Gate mancanti sull'HEAD ${sha}: ${missing.join(", ")}.`);
    }
    await pause(intervalMs);
  }
}

async function promotionCommitEvidence(repository, baseSha, headSha) {
  const comparison = await request(`/repos/${repository}/compare/${baseSha}...${headSha}`);
  const evidence = [];
  for (const commit of comparison.commits) {
    const [pullRequests, detail] = await Promise.all([
      request(`/repos/${repository}/commits/${commit.sha}/pulls`),
      request(`/repos/${repository}/git/commits/${commit.sha}`),
    ]);
    const parentTrees = await Promise.all(
      detail.parents.map(
        async ({ sha }) => (await request(`/repos/${repository}/git/commits/${sha}`)).tree.sha,
      ),
    );
    const mapped = [];
    for (const pullRequest of pullRequests) {
      mapped.push({
        base: pullRequest.base.ref,
        merged: Boolean(pullRequest.merged_at),
      });
    }
    evidence.push({
      sha: commit.sha,
      parents: detail.parents,
      tree: detail.tree.sha,
      parentTrees,
      pullRequests: mapped,
    });
  }
  return evidence;
}

export function verifyProductionMergeEvidence({ event, detail, pullRequests, parentTrees }) {
  const before = event.before;
  const after = event.after;
  const parents = detail.parents ?? [];
  const promotion = pullRequests.find(
    (pullRequest) =>
      pullRequest.merged_at &&
      pullRequest.base?.ref === "main" &&
      pullRequest.head?.ref === "develop" &&
      pullRequest.merge_commit_sha === after,
  );
  if (
    event.ref !== "refs/heads/main" ||
    !/^[0-9a-f]{40}$/.test(before ?? "") ||
    !/^[0-9a-f]{40}$/.test(after ?? "") ||
    detail.sha !== after ||
    parents.length !== 2 ||
    parents[0]?.sha !== before ||
    detail.tree?.sha !== parentTrees[1] ||
    !promotion
  ) {
    throw new Error("Il push su main non è un merge verificato da develop con tree invariato.");
  }
  return { baseSha: before, headSha: after, sourceSha: parents[1].sha };
}

export async function verifyProductionMerge({ event, repository }) {
  const after = event.after;
  const [detail, pullRequests] = await Promise.all([
    request(`/repos/${repository}/git/commits/${after}`),
    request(`/repos/${repository}/commits/${after}/pulls`),
  ]);
  const parentTrees = await Promise.all(
    (detail.parents ?? []).map(
      async ({ sha }) => (await request(`/repos/${repository}/git/commits/${sha}`)).tree.sha,
    ),
  );
  const proof = verifyProductionMergeEvidence({
    event,
    detail,
    pullRequests,
    parentTrees,
  });
  await waitForChecks(repository, proof.sourceSha, ["verify", "e2e", "coverage", "ci-policy"], {
    reuseReviewedTree: true,
  });
  return proof;
}

export async function verifyPromotion({ event, repository }) {
  const pullRequest = event.pull_request;
  if (
    pullRequest?.base?.ref !== "main" ||
    pullRequest?.head?.ref !== "develop" ||
    pullRequest.head.repo?.full_name !== repository
  ) {
    throw new Error("main accetta solo promozioni dal branch develop della stessa repository.");
  }
  const baseSha = pullRequest.base.sha;
  const headSha = pullRequest.head.sha;
  const mergeBase = execFileSync("git", ["merge-base", baseSha, headSha], {
    encoding: "utf8",
  }).trim();
  if (mergeBase !== baseSha) throw new Error("main non è antenato dell'HEAD di develop.");
  await waitForChecks(repository, headSha, ["verify", "e2e", "coverage", "ci-policy"], {
    reuseReviewedTree: true,
  });
  verifyPromotionHistory(await promotionCommitEvidence(repository, baseSha, headSha));
  return { baseSha, headSha };
}

async function main() {
  if (process.argv.includes("--reuse-ci")) {
    const evidence = await reviewedCiEvidence(
      process.env.GITHUB_REPOSITORY,
      process.env.GITHUB_SHA,
      JSON.parse(process.env.MUTATION_MATRIX ?? "[]"),
    );
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `reuse_ci=${Boolean(evidence)}\nreviewed_head=${evidence?.head ?? ""}\nreviewed_run=${evidence?.runId ?? ""}\n`,
    );
    console.log(
      evidence
        ? `CI riusata dal run ${evidence.runId}, HEAD ${evidence.head}.`
        : "CI ordinaria: nessuna prova completa riusabile.",
    );
    return;
  }
  const required = process.env.REQUIRED_CHECKS?.split(",").filter(Boolean);
  if (required?.length) {
    await waitForChecks(process.env.GITHUB_REPOSITORY, process.env.GITHUB_SHA, required, {
      reuseReviewedTree: process.env.GITHUB_REF === "refs/heads/develop",
    });
    console.log(`Gate riusati per ${process.env.GITHUB_SHA}: ${required.join(", ")}.`);
    return;
  }
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  if (process.env.GITHUB_EVENT_NAME === "push" && event.ref === "refs/heads/main") {
    const proof = await verifyProductionMerge({
      event,
      repository: process.env.GITHUB_REPOSITORY,
    });
    console.log(
      `Merge Production verificato: ${proof.baseSha} + ${proof.sourceSha} -> ${proof.headSha}.`,
    );
    return;
  }
  const proof = await verifyPromotion({
    event,
    repository: process.env.GITHUB_REPOSITORY,
  });
  console.log(`Promozione verificata: ${proof.baseSha} -> ${proof.headSha}.`);
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (process.env.GITHUB_ACTIONS === "true" && isDirectExecution) {
  await main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
