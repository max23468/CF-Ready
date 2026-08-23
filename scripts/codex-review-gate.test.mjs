import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CODEX_REVIEW_POLLING,
  classifyCodexReview,
  findingPriority,
  findingTitle,
  isAutoMergeRevalidation,
  isAutomaticFirstReview,
  isVerifiedPromotionMergeFinding,
  latestCodexInvocation,
  pullRequestNumber,
  reviewSignalContext,
} from "./codex-review-gate.mjs";

const headSha = "0123456789abcdef0123456789abcdef01234567";
const oldSha = "abcdef0123456789abcdef0123456789abcdef01";
const requestedAt = "2026-08-09T12:00:00Z";
const bot = { login: "chatgpt-codex-connector[bot]" };
const classify = (overrides = {}) =>
  classifyCodexReview({
    headSha,
    requestedAt,
    now: new Date("2026-08-09T12:01:00Z").getTime(),
    ...overrides,
  });

test("legge la priorità solo dall'intestazione del finding", () => {
  assert.equal(findingPriority("**P2** Advisory che cita P0 e P1"), "P2");
  assert.equal(findingPriority("testo che cita P1"), undefined);
  assert.equal(
    findingTitle(
      "**<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat)</sub></sub>  Preserva l’ascendenza di develop nella promozione**",
    ),
    "Preserva l’ascendenza di develop nella promozione",
  );
});

test("blocca soltanto P0/P1 dell'HEAD corrente", () => {
  assert.equal(
    classify({
      reviewComments: [
        {
          user: bot,
          original_commit_id: headSha,
          created_at: "2026-08-09T11:59:59Z",
          body: "**P1** Correggi questo problema",
        },
      ],
    }).state,
    "failure",
  );
  assert.equal(
    classify({
      reviewComments: [
        {
          user: bot,
          original_commit_id: oldSha,
          created_at: "2026-08-09T12:00:01Z",
          body: "**P0** Finding del commit precedente",
        },
      ],
    }).state,
    "pending",
  );
});

test("invalida solo il falso P1 di ascendenza quando GitHub prova il merge corretto", () => {
  const finding = {
    user: bot,
    original_commit_id: headSha,
    created_at: "2026-08-09T12:00:02Z",
    body: "**<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat)</sub></sub>  Preserva l’ascendenza di develop nella promozione**",
  };
  const review = {
    user: bot,
    commit_id: headSha,
    submitted_at: "2026-08-09T12:00:03Z",
    body: "",
  };
  const pullRequest = {
    auto_merge: { merge_method: "merge" },
    base: {
      ref: "main",
      sha: oldSha,
      repo: { full_name: "max23468/CF-Ready" },
    },
    head: {
      ref: "develop",
      sha: headSha,
      repo: { full_name: "max23468/CF-Ready" },
    },
    merge_commit_sha: "1111111111111111111111111111111111111111",
    merge_commit: {
      sha: "1111111111111111111111111111111111111111",
      parents: [{ sha: oldSha }, { sha: headSha }],
    },
  };

  assert.equal(isVerifiedPromotionMergeFinding(finding, pullRequest), true);
  assert.deepEqual(classify({ pullRequest, reviewComments: [finding], reviews: [review] }), {
    state: "success",
    description: "Codex: finding merge invalidato dallo stato GitHub",
  });
  assert.equal(
    classify({
      pullRequest: { ...pullRequest, auto_merge: { merge_method: "squash" } },
      reviewComments: [finding],
      reviews: [review],
    }).state,
    "failure",
  );
  assert.equal(
    classify({
      pullRequest: { ...pullRequest, auto_merge: null },
      reviewComments: [finding],
      reviews: [review],
    }).state,
    "failure",
  );
  assert.equal(
    classify({
      pullRequest: {
        ...pullRequest,
        merge_commit: {
          ...pullRequest.merge_commit,
          parents: [{ sha: oldSha }, { sha: oldSha }],
        },
      },
      reviewComments: [finding],
      reviews: [review],
    }).state,
    "failure",
  );
  assert.equal(
    classify({
      pullRequest,
      reviewComments: [
        {
          ...finding,
          body: "**P1** Correggi un difetto reale\n\nNon basta dire: Preserva l’ascendenza di develop nella promozione",
        },
      ],
      reviews: [review],
    }).state,
    "failure",
  );
});

test("P2/P3 sono advisory e completano il gate dopo l'assestamento", () => {
  const input = {
    reviewComments: [
      {
        user: bot,
        original_commit_id: headSha,
        created_at: "2026-08-09T12:00:02Z",
        body: "**P2** Advisory che cita P1",
      },
    ],
    reviews: [
      {
        user: bot,
        commit_id: headSha,
        submitted_at: "2026-08-09T12:00:03Z",
        body: "",
      },
    ],
  };
  assert.equal(
    classify({ ...input, now: new Date("2026-08-09T12:00:20Z").getTime() }).state,
    "pending",
  );
  assert.equal(classify(input).state, "success");
});

test("un advisory top-level richiede il marker dell'HEAD", () => {
  const advisory = (commit) => ({
    user: bot,
    created_at: "2026-08-09T12:00:01Z",
    body: `**P3** Suggerimento\n\n**Reviewed commit:** \`${commit}\``,
  });
  assert.equal(classify({ comments: [advisory(headSha.slice(0, 10))] }).state, "success");
  assert.equal(classify({ comments: [advisory(oldSha.slice(0, 10))] }).state, "pending");
});

test("il pollice della PR vale solo per il primo giro automatico", () => {
  const prReactions = [{ user: bot, content: "+1", created_at: "2026-08-09T12:00:01Z" }];
  assert.equal(classify({ automatic: true, prReactions }).state, "success");
  assert.equal(classify({ automatic: false, prReactions }).state, "pending");
});

test("i giri successivi usano la reaction dell'invocazione corrente", () => {
  assert.equal(
    classify({
      invocationReactions: [{ user: bot, content: "+1", created_at: "2026-08-09T12:00:01Z" }],
    }).state,
    "success",
  );
});

test("la rivalidazione auto-merge conserva la reaction del retry esplicito", () => {
  const context = reviewSignalContext({
    action: "auto_merge_enabled",
    eventName: "pull_request_target",
    headAvailableAt: requestedAt,
    invocationCreatedAt: "2026-08-09T12:00:05Z",
  });
  assert.deepEqual(context, {
    includeInvocationReactions: true,
    includePullRequestReactions: false,
    requestedAt: "2026-08-09T12:00:05Z",
  });
  assert.equal(
    classify({
      ...context,
      prReactions: [{ user: bot, content: "+1", created_at: "2026-08-09T12:00:01Z" }],
    }).state,
    "pending",
  );
  assert.equal(
    classify({
      ...context,
      invocationReactions: [{ user: bot, content: "+1", created_at: "2026-08-09T12:00:06Z" }],
    }).state,
    "success",
  );
});

test("seleziona solo un'invocazione esatta, fidata e successiva all'HEAD", () => {
  const comments = [
    {
      id: 1,
      user: { login: "max23468" },
      author_association: "OWNER",
      body: "@codex review",
      created_at: "2026-08-09T11:59:59Z",
    },
    {
      id: 4,
      user: { login: "max23468" },
      author_association: "OWNER",
      body: "non eseguire @codex review",
      created_at: "2026-08-09T12:00:01Z",
    },
    {
      id: 2,
      user: { login: "utente" },
      author_association: "NONE",
      body: "@codex review",
      created_at: "2026-08-09T12:00:02Z",
    },
    {
      id: 3,
      user: { login: "max23468" },
      author_association: "OWNER",
      body: "@codex review",
      created_at: "2026-08-09T12:00:03Z",
    },
  ];
  assert.equal(latestCodexInvocation(comments, requestedAt).id, 3);
});

test("il primo giro è automatico solo su apertura o ready", () => {
  assert.equal(isAutomaticFirstReview("pull_request_target", "opened"), true);
  assert.equal(isAutomaticFirstReview("pull_request_target", "ready_for_review"), true);
  assert.equal(isAutomaticFirstReview("pull_request_target", "synchronize"), false);
  assert.equal(isAutomaticFirstReview("pull_request_target", "auto_merge_enabled"), false);
  assert.equal(isAutomaticFirstReview("workflow_dispatch", undefined), false);
});

test("la rivalidazione auto-merge riusa i segnali automatici dalla data dell'HEAD", () => {
  assert.equal(isAutoMergeRevalidation("pull_request_target", "auto_merge_enabled"), true);
  assert.equal(isAutoMergeRevalidation("pull_request_target", "auto_merge_disabled"), true);
  assert.deepEqual(
    reviewSignalContext({
      action: "auto_merge_enabled",
      eventName: "pull_request_target",
      headAvailableAt: requestedAt,
      pullRequestCreatedAt: "2026-08-09T11:00:00Z",
      pullRequestUpdatedAt: "2026-08-09T12:00:10Z",
    }),
    {
      includeInvocationReactions: false,
      includePullRequestReactions: true,
      requestedAt,
    },
  );
});

test("gli errori operativi bloccano in assenza di una review conclusa più recente", () => {
  assert.equal(
    classify({
      comments: [
        {
          user: bot,
          created_at: "2026-08-09T12:00:01Z",
          body: "Codex Review: Something went wrong. Unknown error",
        },
      ],
    }).state,
    "error",
  );
});

test("valida il numero PR e mantiene il polling entro cinque ore", () => {
  assert.equal(pullRequestNumber({ issue: { number: 42 } }), "42");
  assert.throws(() => pullRequestNumber({}, "x"), /Numero PR non valido/);
  assert.equal(CODEX_REVIEW_POLLING.attempts * CODEX_REVIEW_POLLING.intervalMs, 18_000_000);
});

test("il workflow usa codice trusted e non richiede commenti al primo giro", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/codex-review-gate.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /auto_merge_enabled/);
  assert.match(workflow, /auto_merge_disabled/);
  assert.match(workflow, /issue_comment:/);
  assert.match(workflow, /github\.event\.comment\.body == '@codex review'/);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.doesNotMatch(workflow, /contains\(github\.event\.comment\.body/);
  assert.match(workflow, /statuses: write/);
  assert.doesNotMatch(workflow, /issues: write/);
  assert.match(workflow, /node --test scripts\/codex-review-gate\.test\.mjs/);
  assert.match(workflow, /ref:\s*\$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.doesNotMatch(workflow, /github\.ref_name/);
  assert.match(workflow, /jobs:\s*\n  gate:[\s\S]*?    concurrency:/);
});
