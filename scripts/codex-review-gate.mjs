import { readFile } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { classifyCiLane } from "./ci-lane.mjs";
import { verifyPromotion } from "./github-gates.mjs";

const CODEX_BOT = "chatgpt-codex-connector[bot]";
const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
export const CODEX_REVIEW_POLLING = { attempts: 100, intervalMs: 180_000 };

const timestamp = (value) => new Date(value ?? 0).getTime();
const signalTimestamp = (signal) => timestamp(signal.submitted_at ?? signal.created_at);
const matchesHead = (candidate, headSha) => Boolean(candidate && headSha.startsWith(candidate));

export const reviewedCommit = (body = "") =>
  body.match(/\*\*Reviewed commit:\*\*\s*`([0-9a-f]{10,40})`/i)?.[1];

export const findingPriority = (body = "") =>
  body.match(/^(?:\*\*|<sub>)*(?:!?\[)?(P[0-3])(?: Badge)?(?:\]\([^)]*\)|\]\s*|\*\*)/m)?.[1];

export const isAutomaticFirstReview = (eventName, action) =>
  eventName === "pull_request_target" && ["opened", "ready_for_review"].includes(action);

export const isPromotion = (pullRequest, repository) =>
  pullRequest.base?.ref === "main" &&
  pullRequest.head?.ref === "develop" &&
  pullRequest.head?.repo?.full_name === repository;

export const codexReviewLane = (files, pullRequest) =>
  classifyCiLane(
    files.map((file) => file.filename),
    { base: pullRequest.base?.ref, head: pullRequest.head?.ref },
  ).lane;

export function advisoryReviewThreads(threads, headSha) {
  return threads.filter((thread) => {
    if (thread.isResolved) return false;
    const exactCodexComments = thread.comments.nodes.filter(
      (comment) => comment.author?.login === CODEX_BOT && comment.originalCommit?.oid === headSha,
    );
    return (
      exactCodexComments.some((comment) => ["P2", "P3"].includes(findingPriority(comment.body))) &&
      !exactCodexComments.some((comment) => ["P0", "P1"].includes(findingPriority(comment.body)))
    );
  });
}

export const latestCodexInvocation = (comments, headAvailableAt) =>
  comments
    .filter(
      (comment) =>
        comment.user?.login !== CODEX_BOT &&
        TRUSTED_ASSOCIATIONS.has(comment.author_association) &&
        /^\s*@codex\s+review\s*$/i.test(comment.body) &&
        timestamp(comment.created_at) >= timestamp(headAvailableAt),
    )
    .sort((left, right) => timestamp(right.created_at) - timestamp(left.created_at))[0];

export function classifyCodexReview({
  automatic = false,
  comments = [],
  headSha,
  invocationReactions = [],
  now = Date.now(),
  prReactions = [],
  requestedAt,
  reviewComments = [],
  reviews = [],
}) {
  const afterRequest = (signal) => signalTimestamp(signal) >= timestamp(requestedAt);
  const exactInline = reviewComments.filter(
    (comment) => comment.user?.login === CODEX_BOT && comment.original_commit_id === headSha,
  );
  const exactTopLevel = comments.filter(
    (comment) =>
      comment.user?.login === CODEX_BOT && matchesHead(reviewedCommit(comment.body), headSha),
  );
  const exactReviews = reviews.filter(
    (review) =>
      review.user?.login === CODEX_BOT &&
      (review.commit_id === headSha || matchesHead(reviewedCommit(review.body), headSha)) &&
      afterRequest(review),
  );
  const exactSignals = [...exactInline, ...exactTopLevel, ...exactReviews];

  const blockingFinding = exactSignals
    .filter((signal) => ["P0", "P1"].includes(findingPriority(signal.body)))
    .sort((left, right) => signalTimestamp(right) - signalTimestamp(left))[0];
  if (blockingFinding) {
    return {
      state: "failure",
      description: `Codex ha trovato un finding ${findingPriority(blockingFinding.body)}`,
    };
  }

  const completionTimes = exactReviews.map(signalTimestamp);
  for (const comment of exactTopLevel) {
    if (
      afterRequest(comment) &&
      (/^Codex Review: Didn't find any major issues\./m.test(comment.body) ||
        ["P2", "P3"].includes(findingPriority(comment.body)))
    ) {
      completionTimes.push(signalTimestamp(comment));
    }
  }

  const reactions = automatic ? prReactions : invocationReactions;
  for (const reaction of reactions) {
    if (
      reaction.user?.login === CODEX_BOT &&
      reaction.content === "+1" &&
      timestamp(reaction.created_at) >= timestamp(requestedAt)
    ) {
      completionTimes.push(timestamp(reaction.created_at));
    }
  }

  const operationalErrorAt = comments
    .filter(
      (comment) =>
        comment.user?.login === CODEX_BOT &&
        afterRequest(comment) &&
        /reached your Codex usage limits|could not complete|unable to review|something went wrong|unknown error/i.test(
          comment.body,
        ),
    )
    .reduce((latest, comment) => Math.max(latest, signalTimestamp(comment)), 0);
  const completionAt = Math.max(...completionTimes, 0);
  if (operationalErrorAt > completionAt) {
    return { state: "error", description: "La review Codex non è stata completata" };
  }

  const settledAt = Math.max(completionAt, ...exactSignals.map(signalTimestamp));
  if (completionAt && now - settledAt >= 30_000) {
    const advisory = exactSignals.some((signal) =>
      ["P2", "P3"].includes(findingPriority(signal.body)),
    );
    return {
      state: "success",
      description: advisory
        ? "Codex: solo finding P2/P3 advisory"
        : "Codex ha approvato l'ultimo commit",
    };
  }

  return { state: "pending", description: "In attesa della review Codex" };
}

export function pullRequestNumber(event, input) {
  const number = String(event.pull_request?.number ?? event.issue?.number ?? input);
  if (!/^\d+$/.test(number)) throw new Error("Numero PR non valido");
  return number;
}

async function request(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "x-github-api-version": "2022-11-28",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path}: ${response.status}`);
  return response.json();
}

async function graphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`POST /graphql: ${response.status}`);
  const result = await response.json();
  if (result.errors?.length)
    throw new Error(result.errors.map(({ message }) => message).join("; "));
  return result.data;
}

async function resolveAdvisoryThreads(repository, number, headSha) {
  const [owner, name] = repository.split("/");
  const data = await graphql(
    `
      query AdvisoryThreads($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $number) {
            reviewThreads(first: 100) {
              nodes {
                id
                isResolved
                comments(first: 100) {
                  nodes {
                    body
                    url
                    author {
                      login
                    }
                    originalCommit {
                      oid
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    { owner, name, number: Number(number) },
  );
  const advisory = advisoryReviewThreads(data.repository.pullRequest.reviewThreads.nodes, headSha);
  for (const thread of advisory) {
    await graphql(
      `
        mutation ResolveAdvisory($threadId: ID!) {
          resolveReviewThread(input: { threadId: $threadId }) {
            thread {
              id
              isResolved
            }
          }
        }
      `,
      { threadId: thread.id },
    );
  }
  const report = advisory.flatMap((thread) =>
    thread.comments.nodes
      .filter(
        (comment) =>
          comment.author?.login === CODEX_BOT &&
          comment.originalCommit?.oid === headSha &&
          ["P2", "P3"].includes(findingPriority(comment.body)),
      )
      .map((comment) => ({
        priority: findingPriority(comment.body),
        url: comment.url,
        body: comment.body,
      })),
  );
  if (process.env.ADVISORY_REPORT_PATH) {
    await writeFile(
      process.env.ADVISORY_REPORT_PATH,
      `${JSON.stringify({ pullRequest: Number(number), headSha, findings: report }, null, 2)}\n`,
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY && report.length > 0) {
    await writeFile(
      process.env.GITHUB_STEP_SUMMARY,
      `\n### Finding Codex advisory registrati\n\n${report.map(({ priority, url }) => `- ${priority}: ${url}`).join("\n")}\n`,
      { flag: "a" },
    );
  }
  return report;
}

async function all(path) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    );
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

async function setStatus(repository, sha, state, description) {
  await request(`/repos/${repository}/statuses/${sha}`, {
    method: "POST",
    body: JSON.stringify({
      state,
      context: "codex-review",
      description,
      target_url: `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    }),
  });
}

async function main() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const repository = process.env.GITHUB_REPOSITORY;
  const number = pullRequestNumber(event, process.env.PULL_REQUEST_NUMBER);
  const pullRequest = await request(`/repos/${repository}/pulls/${number}`);
  const headSha = pullRequest.head.sha;
  const headCommit = await request(`/repos/${repository}/commits/${headSha}`);
  const automatic = isAutomaticFirstReview(process.env.GITHUB_EVENT_NAME, event.action);
  const headAvailableAt =
    event.action === "synchronize"
      ? event.pull_request.updated_at
      : headCommit.commit.committer.date;

  if (isPromotion(pullRequest, repository)) {
    await verifyPromotion({ event: { pull_request: pullRequest }, repository });
    await setStatus(repository, headSha, "success", "Codex: review del contenuto già verificata");
    return;
  }

  const files = await all(`/repos/${repository}/pulls/${number}/files`);
  if (codexReviewLane(files, pullRequest) === "docs") {
    await setStatus(
      repository,
      headSha,
      "success",
      "Codex: review non applicabile alla documentazione di contenuto",
    );
    return;
  }

  await setStatus(repository, headSha, "pending", "In attesa della review Codex");
  if (pullRequest.draft) return;

  for (let attempt = 0; attempt < CODEX_REVIEW_POLLING.attempts; attempt += 1) {
    const [comments, prReactions, reviews, reviewComments] = await Promise.all([
      all(`/repos/${repository}/issues/${number}/comments`),
      all(`/repos/${repository}/issues/${number}/reactions`),
      all(`/repos/${repository}/pulls/${number}/reviews`),
      all(`/repos/${repository}/pulls/${number}/comments`),
    ]);
    const latestInvocation = latestCodexInvocation(comments, headAvailableAt);
    const invocation =
      process.env.GITHUB_EVENT_NAME !== "issue_comment" ||
      latestInvocation?.id === event.comment?.id
        ? latestInvocation
        : undefined;
    const invocationReactions = invocation
      ? await all(`/repos/${repository}/issues/comments/${invocation.id}/reactions`)
      : [];
    const requestedAt = automatic
      ? (event.pull_request?.updated_at ?? pullRequest.created_at)
      : (invocation?.created_at ?? headAvailableAt);
    const result = classifyCodexReview({
      automatic,
      comments,
      headSha,
      invocationReactions,
      prReactions,
      requestedAt,
      reviewComments,
      reviews,
    });
    if (result.state !== "pending") {
      if (result.state === "success") await resolveAdvisoryThreads(repository, number, headSha);
      await setStatus(repository, headSha, result.state, result.description);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, CODEX_REVIEW_POLLING.intervalMs));
  }

  await setStatus(repository, headSha, "error", "Review Codex non conclusa entro cinque ore");
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (process.env.GITHUB_ACTIONS === "true" && isDirectExecution) {
  await main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
