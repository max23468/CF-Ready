import { pathToFileURL } from "node:url";

const CODEX_BOT = "chatgpt-codex-connector[bot]";
const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

const timestamp = (value) => new Date(value ?? 0).getTime();
const reviewedCommit = (body = "") =>
  body.match(/\*\*Reviewed commit:\*\*\s*`([0-9a-f]{10,40})`/i)?.[1];

export const latestCodexReviewStart = (reactions, requestedAt) =>
  reactions
    .filter(
      (reaction) =>
        reaction.user?.login === CODEX_BOT &&
        reaction.content === "eyes" &&
        timestamp(reaction.created_at) >= timestamp(requestedAt),
    )
    .reduce((latest, reaction) => Math.max(latest, timestamp(reaction.created_at)), 0);

export const isInitialCodexReview = (action, events = []) =>
  action === "opened" ||
  (action === "ready_for_review" &&
    !events.some((event) => event.event === "convert_to_draft") &&
    events.filter((event) => event.event === "ready_for_review").length <= 1);

export function classifyCodexReview({
  allowUnmarkedComments = true,
  headSha,
  requestedAt,
  now = Date.now(),
  comments,
  reactions,
  progressReactions = reactions,
  reviewStartedAt = 0,
  reviews = [],
  reviewComments,
}) {
  const completions = [];
  const cleanComments = [];
  const activeStartedAt = latestCodexReviewStart(progressReactions, requestedAt);
  const startedAt = Math.max(reviewStartedAt, activeStartedAt);

  for (const comment of reviewComments) {
    if (
      comment.user?.login === CODEX_BOT &&
      (comment.original_commit_id ?? comment.commit_id) === headSha &&
      timestamp(comment.created_at) >= timestamp(requestedAt) &&
      /\bP[0-3]\b/.test(comment.body)
    ) {
      completions.push({
        state: "failure",
        at: timestamp(comment.created_at),
        description: "Codex ha trovato problemi nell'ultimo commit",
      });
    }
  }

  if (completions.length) {
    return completions.sort((left, right) => right.at - left.at)[0];
  }

  for (const comment of comments) {
    if (comment.user?.login !== CODEX_BOT) continue;

    const commit = reviewedCommit(comment.body);
    const belongsToCurrentReview = commit ? headSha.startsWith(commit) : allowUnmarkedComments;
    if (
      belongsToCurrentReview &&
      timestamp(comment.created_at) >= timestamp(requestedAt) &&
      /\bP[0-3]\b/.test(comment.body)
    ) {
      completions.push({
        state: "failure",
        at: timestamp(comment.created_at),
        finding: true,
        description: "Codex ha trovato problemi nell'ultimo commit",
      });
    }

    if (
      commit &&
      headSha.startsWith(commit) &&
      timestamp(comment.created_at) >= timestamp(requestedAt) &&
      /^Codex Review: Didn't find any major issues\./m.test(comment.body)
    ) {
      completions.push({
        state: "success",
        at: timestamp(comment.created_at),
        description: "Codex ha approvato l'ultimo commit",
      });
    }

    if (
      timestamp(comment.created_at) >= timestamp(requestedAt) &&
      now - timestamp(requestedAt) >= 30_000 &&
      !activeStartedAt &&
      belongsToCurrentReview &&
      /reached your Codex usage limits|could not complete|unable to review/i.test(comment.body)
    ) {
      completions.push({
        state: "failure",
        at: timestamp(comment.created_at),
        description: "La review Codex non è stata completata",
      });
    }
  }

  const commentFailure = completions
    .filter((completion) => completion.finding)
    .sort((left, right) => right.at - left.at)[0];
  if (commentFailure) return commentFailure;

  for (const review of reviews) {
    const commit = reviewedCommit(review.body);
    if (
      review.user?.login === CODEX_BOT &&
      (review.commit_id === headSha || (commit && headSha.startsWith(commit))) &&
      timestamp(review.submitted_at) >= timestamp(requestedAt)
    ) {
      cleanComments.push(timestamp(review.submitted_at));
    }
  }

  const thumbsUpAt = reactions
    .filter(
      (reaction) =>
        reaction.user?.login === CODEX_BOT &&
        reaction.content === "+1" &&
        timestamp(reaction.created_at) >= timestamp(requestedAt),
    )
    .reduce((latest, reaction) => Math.max(latest, timestamp(reaction.created_at)), 0);

  if (thumbsUpAt) {
    if (allowUnmarkedComments || (startedAt && thumbsUpAt >= startedAt)) {
      completions.push({
        state: "success",
        at: thumbsUpAt,
        description: "Codex ha approvato l'ultimo commit",
      });
    }
    for (const commentAt of cleanComments) {
      if (thumbsUpAt < commentAt) continue;
      completions.push({
        state: "success",
        at: Math.max(thumbsUpAt, commentAt),
        description: "Codex ha approvato l'ultimo commit",
      });
    }
  }

  return (
    completions.sort((left, right) => right.at - left.at)[0] ?? {
      state: "pending",
      description: "In attesa della review Codex sull'ultimo commit",
    }
  );
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

const reviewSignals = (repository, number) =>
  Promise.all([
    all(`/repos/${repository}/issues/${number}/comments`),
    all(`/repos/${repository}/issues/${number}/reactions`),
    all(`/repos/${repository}/pulls/${number}/reviews`),
    all(`/repos/${repository}/pulls/${number}/comments`),
  ]);

async function main() {
  const event = JSON.parse(
    await (await import("node:fs/promises")).readFile(process.env.GITHUB_EVENT_PATH),
  );
  const repository = process.env.GITHUB_REPOSITORY;
  const pullRequest = event.pull_request;
  if (!pullRequest) throw new Error("Evento pull request non valido");
  const number = pullRequest.number;
  const headSha = pullRequest.head.sha;

  await setStatus(
    repository,
    headSha,
    "pending",
    "In attesa della review Codex sull'ultimo commit",
  );
  if (pullRequest.draft) return;

  const currentPullRequest = await request(`/repos/${repository}/pulls/${number}`);
  if (currentPullRequest.head.sha !== headSha) return;
  const events =
    event.action === "ready_for_review"
      ? await all(`/repos/${repository}/issues/${number}/events`)
      : [];
  const allowUnmarkedComments = isInitialCodexReview(event.action, events);

  let reviewStartedAt = 0;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const [comments, reactions, reviews, reviewComments] = await reviewSignals(repository, number);
    reviewStartedAt = Math.max(
      reviewStartedAt,
      latestCodexReviewStart(reactions, pullRequest.updated_at),
    );
    const result = classifyCodexReview({
      allowUnmarkedComments,
      headSha,
      requestedAt: pullRequest.updated_at,
      comments,
      reactions,
      reviewStartedAt,
      reviews,
      reviewComments,
    });
    if (result.state !== "pending") {
      await setStatus(repository, headSha, result.state, result.description);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }

  await setStatus(repository, headSha, "error", "Review Codex non conclusa entro cinque ore");
}

if (process.env.GITHUB_ACTIONS === "true" && isDirectExecution) {
  await main().catch(async (error) => {
    console.error(error);
    const event = JSON.parse(
      await (await import("node:fs/promises")).readFile(process.env.GITHUB_EVENT_PATH),
    );
    const pullRequest = event.pull_request;
    if (!pullRequest) return;
    await setStatus(
      process.env.GITHUB_REPOSITORY,
      pullRequest.head.sha,
      "error",
      "Impossibile verificare la review Codex",
    ).catch(console.error);
  });
}
