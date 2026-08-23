import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

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

export const findingTitle = (body = "") =>
  body
    .split(/\r?\n/, 1)[0]
    .trim()
    .replace(/^\*\*|\*\*$/g, "")
    .replace(/<\/?sub>/gi, "")
    .replace(/!\[P[0-3] Badge\]\([^)]*\)/i, "")
    .replace(/^P[0-3]\*\*\s*/i, "")
    .trim();

export const isVerifiedPromotionMergeFinding = (signal, pullRequest) =>
  findingPriority(signal.body) === "P1" &&
  findingTitle(signal.body).toLocaleLowerCase("it") ===
    "preserva l’ascendenza di develop nella promozione" &&
  pullRequest?.base?.ref === "main" &&
  pullRequest?.head?.ref === "develop" &&
  pullRequest.head.repo?.full_name === pullRequest.base.repo?.full_name &&
  pullRequest.auto_merge?.merge_method === "merge" &&
  pullRequest.merge_commit?.sha === pullRequest.merge_commit_sha &&
  pullRequest.merge_commit?.parents?.length === 2 &&
  pullRequest.merge_commit.parents[0]?.sha === pullRequest.base.sha &&
  pullRequest.merge_commit.parents[1]?.sha === pullRequest.head.sha;

export const isAutomaticFirstReview = (eventName, action) =>
  eventName === "pull_request_target" && ["opened", "ready_for_review"].includes(action);

export const isAutoMergeRevalidation = (eventName, action) =>
  eventName === "pull_request_target" &&
  ["auto_merge_enabled", "auto_merge_disabled"].includes(action);

export const reviewSignalContext = ({
  action,
  eventName,
  headAvailableAt,
  invocationCreatedAt,
  pullRequestCreatedAt,
  pullRequestUpdatedAt,
}) => {
  const automatic = isAutomaticFirstReview(eventName, action);
  const autoMergeRevalidation = isAutoMergeRevalidation(eventName, action);
  const revalidatesInvocation = autoMergeRevalidation && Boolean(invocationCreatedAt);
  return {
    includeInvocationReactions: !automatic && (!autoMergeRevalidation || revalidatesInvocation),
    includePullRequestReactions: automatic || (autoMergeRevalidation && !revalidatesInvocation),
    requestedAt: automatic
      ? (pullRequestUpdatedAt ?? pullRequestCreatedAt)
      : autoMergeRevalidation
        ? (invocationCreatedAt ?? headAvailableAt)
        : (invocationCreatedAt ?? headAvailableAt),
  };
};

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
  includeInvocationReactions = !automatic,
  includePullRequestReactions = automatic,
  invocationReactions = [],
  now = Date.now(),
  pullRequest,
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

  const invalidatedPromotionFinding = exactSignals.some((signal) =>
    isVerifiedPromotionMergeFinding(signal, pullRequest),
  );
  const blockingFinding = exactSignals
    .filter(
      (signal) =>
        ["P0", "P1"].includes(findingPriority(signal.body)) &&
        !isVerifiedPromotionMergeFinding(signal, pullRequest),
    )
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

  const reactions = [
    ...(includePullRequestReactions ? prReactions : []),
    ...(includeInvocationReactions ? invocationReactions : []),
  ];
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
      description: invalidatedPromotionFinding
        ? "Codex: finding merge invalidato dallo stato GitHub"
        : advisory
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
  pullRequest.merge_commit = pullRequest.merge_commit_sha
    ? await request(`/repos/${repository}/commits/${pullRequest.merge_commit_sha}`)
    : undefined;
  const headSha = pullRequest.head.sha;
  const headCommit = await request(`/repos/${repository}/commits/${headSha}`);
  const headAvailableAt =
    event.action === "synchronize"
      ? event.pull_request.updated_at
      : headCommit.commit.committer.date;

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
    const { includeInvocationReactions, includePullRequestReactions, requestedAt } =
      reviewSignalContext({
        action: event.action,
        eventName: process.env.GITHUB_EVENT_NAME,
        headAvailableAt,
        invocationCreatedAt: invocation?.created_at,
        pullRequestCreatedAt: pullRequest.created_at,
        pullRequestUpdatedAt: event.pull_request?.updated_at,
      });
    const result = classifyCodexReview({
      comments,
      headSha,
      includeInvocationReactions,
      includePullRequestReactions,
      invocationReactions,
      pullRequest,
      prReactions,
      requestedAt,
      reviewComments,
      reviews,
    });
    if (result.state !== "pending") {
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
