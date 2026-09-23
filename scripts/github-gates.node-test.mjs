import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  developPullRequestFor,
  missingSuccessfulChecks,
  missingWithEquivalentChecks,
  verifyProductionMerge,
  verifyProductionMergeEvidence,
  verifyPromotion,
  verifyPromotionHistory,
  waitForChecks,
} from "./github-gates.mjs";

test("riusa soltanto la suite più recente conclusa fuori dal run corrente", () => {
  const checks = [
    {
      id: 1,
      name: "verify",
      conclusion: "success",
      details_url: "https://github.test/actions/runs/10/job/1",
      check_suite: { id: 20 },
    },
    {
      id: 2,
      name: "e2e",
      conclusion: "success",
      details_url: "https://github.test/actions/runs/10/job/2",
      check_suite: { id: 20 },
    },
    {
      id: 3,
      name: "verify",
      conclusion: "success",
      details_url: "https://github.test/actions/runs/11/job/3",
      check_suite: { id: 21 },
    },
    {
      id: 4,
      name: "e2e",
      conclusion: "success",
      details_url: "https://github.test/actions/runs/11/job/4",
      check_suite: { id: 21 },
    },
    {
      id: 5,
      name: "verify",
      conclusion: "failure",
      details_url: "https://github.test/actions/runs/11/job/5",
      check_suite: { id: 21 },
    },
  ];
  assert.deepEqual(missingSuccessfulChecks(checks, ["verify", "e2e"], "11"), []);
  assert.deepEqual(missingSuccessfulChecks(checks, ["verify", "e2e"], "12"), ["verify"]);
  assert.deepEqual(
    missingSuccessfulChecks([{ name: "verify", conclusion: "neutral" }], ["verify"]),
    ["verify"],
  );
});

test("seleziona il check più recente per nome tra workflow distinti", () => {
  const checks = [
    {
      id: 1,
      name: "verify",
      conclusion: "success",
      check_suite: { id: 20 },
    },
    {
      id: 2,
      name: "e2e",
      conclusion: "success",
      check_suite: { id: 20 },
    },
    {
      id: 3,
      name: "verify",
      conclusion: null,
      check_suite: { id: 21 },
    },
  ];
  assert.deepEqual(missingSuccessfulChecks(checks, ["verify", "e2e"]), ["verify"]);
  assert.deepEqual(
    missingSuccessfulChecks(
      [
        ...checks,
        {
          id: 4,
          name: "react-doctor",
          conclusion: "success",
          check_suite: { id: 22 },
        },
      ],
      ["verify", "e2e", "react-doctor"],
    ),
    ["verify"],
  );
});

test("un esito concluso sul commit prevale sul tree equivalente", () => {
  const check = (name, conclusion, suite = 1) => ({
    id: suite,
    name,
    conclusion,
    check_suite: { id: suite },
  });
  const equivalent = [check("verify", "success"), check("coverage", "success")];
  assert.deepEqual(
    missingWithEquivalentChecks([check("verify", null, 2)], equivalent, ["verify", "coverage"]),
    [],
  );
  assert.deepEqual(
    missingWithEquivalentChecks([check("verify", "failure", 2)], equivalent, [
      "verify",
      "coverage",
    ]),
    ["verify"],
  );
  assert.deepEqual(missingWithEquivalentChecks([], equivalent, ["verify", "e2e"]), ["e2e"]);
});

test("riconosce soltanto la PR unita su develop con quel merge commit", () => {
  const sha = "a".repeat(40);
  const head = { sha: "b".repeat(40) };
  const merged = { merged_at: "2026-09-23T00:00:00Z", merge_commit_sha: sha, head };
  assert.equal(developPullRequestFor([{ ...merged, base: { ref: "develop" } }], sha).head, head);
  assert.equal(developPullRequestFor([{ ...merged, base: { ref: "main" } }], sha), undefined);
  assert.equal(
    developPullRequestFor([{ ...merged, base: { ref: "develop" }, merged_at: null }], sha),
    undefined,
  );
  assert.equal(
    developPullRequestFor(
      [{ ...merged, base: { ref: "develop" }, merge_commit_sha: "c".repeat(40) }],
      sha,
    ),
    undefined,
  );
});

function reviewedTreeFetch({ sha, head, mergedTree, headTree, ownRuns = [], statuses = [] }) {
  return async (input) => {
    const url = String(input);
    let payload;
    if (url.endsWith(`/commits/${sha}/check-runs?per_page=100`)) {
      payload = { check_runs: ownRuns };
    } else if (url.endsWith(`/commits/${sha}/status`)) {
      payload = { statuses };
    } else if (url.endsWith(`/commits/${head}/check-runs?per_page=100`)) {
      payload = {
        check_runs: ["verify", "e2e", "coverage", "ci-policy"].map((name, id) => ({
          id,
          name,
          conclusion: "success",
          check_suite: { id: 5 },
        })),
      };
    } else if (url.endsWith(`/git/commits/${sha}`)) {
      payload = { tree: { sha: mergedTree } };
    } else if (url.endsWith(`/git/commits/${head}`)) {
      payload = { tree: { sha: headTree } };
    } else if (url.endsWith(`/commits/${sha}/pulls`)) {
      payload = [
        {
          merged_at: "2026-09-23T00:00:00Z",
          base: { ref: "develop" },
          merge_commit_sha: sha,
          head: { sha: head },
        },
      ];
    } else {
      throw new Error(`richiesta inattesa: ${url}`);
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

test("riusa i gate dell'HEAD PR solo con tree identico e mai ci-policy", async () => {
  const originalFetch = globalThis.fetch;
  const sha = "a".repeat(40);
  const head = "b".repeat(40);
  const options = { attempts: 1, intervalMs: 0, reuseReviewedTree: true };
  try {
    globalThis.fetch = reviewedTreeFetch({ sha, head, mergedTree: "t1", headTree: "t1" });
    await assert.doesNotReject(
      waitForChecks("owner/repo", sha, ["verify", "e2e", "coverage"], options),
    );
    await assert.rejects(
      waitForChecks("owner/repo", sha, ["verify", "ci-policy"], options),
      /Gate mancanti.*ci-policy/,
    );
    await assert.rejects(
      waitForChecks("owner/repo", sha, ["verify"], { attempts: 1, intervalMs: 0 }),
      /Gate mancanti.*verify/,
    );

    globalThis.fetch = reviewedTreeFetch({ sha, head, mergedTree: "t1", headTree: "t2" });
    await assert.rejects(
      waitForChecks("owner/repo", sha, ["verify"], options),
      /Gate mancanti.*verify/,
    );

    globalThis.fetch = reviewedTreeFetch({
      sha,
      head,
      mergedTree: "t1",
      headTree: "t1",
      ownRuns: [{ id: 9, name: "verify", conclusion: "failure", check_suite: { id: 9 } }],
    });
    await assert.rejects(
      waitForChecks("owner/repo", sha, ["verify"], options),
      /Gate mancanti.*verify/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("la promozione include coverage e policy dell'HEAD develop", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("./github-gates.mjs", import.meta.url), "utf8"),
  );
  assert.match(source, /\["verify", "e2e", "coverage", "ci-policy"\]/);
});

test("accetta soltanto il merge main a due parent con tree di develop", () => {
  const before = "a".repeat(40);
  const after = "b".repeat(40);
  const source = "c".repeat(40);
  assert.deepEqual(
    verifyProductionMergeEvidence({
      event: { ref: "refs/heads/main", before, after },
      detail: {
        sha: after,
        tree: { sha: "tree-source" },
        parents: [{ sha: before }, { sha: source }],
      },
      parentTrees: ["tree-main", "tree-source"],
      pullRequests: [
        {
          merged_at: "2026-09-13T00:00:00Z",
          base: { ref: "main" },
          head: { ref: "develop" },
          merge_commit_sha: after,
        },
      ],
    }),
    { baseSha: before, headSha: after, sourceSha: source },
  );
});

test("rifiuta squash, tree modificato e PR con provenienza diversa", () => {
  const before = "a".repeat(40);
  const after = "b".repeat(40);
  const source = "c".repeat(40);
  const evidence = {
    event: { ref: "refs/heads/main", before, after },
    detail: {
      sha: after,
      tree: { sha: "tree-source" },
      parents: [{ sha: before }, { sha: source }],
    },
    parentTrees: ["tree-main", "tree-source"],
    pullRequests: [
      {
        merged_at: "2026-09-13T00:00:00Z",
        base: { ref: "main" },
        head: { ref: "develop" },
        merge_commit_sha: after,
      },
    ],
  };
  assert.throws(
    () =>
      verifyProductionMergeEvidence({
        ...evidence,
        detail: { ...evidence.detail, parents: [{ sha: before }] },
      }),
    /merge verificato/,
  );
  assert.throws(
    () => verifyProductionMergeEvidence({ ...evidence, parentTrees: ["tree-main", "other"] }),
    /merge verificato/,
  );
  assert.throws(
    () =>
      verifyProductionMergeEvidence({
        ...evidence,
        pullRequests: [{ ...evidence.pullRequests[0], head: { ref: "feature" } }],
      }),
    /merge verificato/,
  );
});

test("il merge Production riusa i gate del parent develop", async () => {
  const originalFetch = globalThis.fetch;
  const before = "a".repeat(40);
  const after = "b".repeat(40);
  const source = "c".repeat(40);
  try {
    globalThis.fetch = async (input) => {
      const url = String(input);
      let payload;
      if (url.endsWith(`/git/commits/${after}`)) {
        payload = {
          sha: after,
          tree: { sha: "tree-source" },
          parents: [{ sha: before }, { sha: source }],
        };
      } else if (url.endsWith(`/commits/${after}/pulls`)) {
        payload = [
          {
            merged_at: "2026-09-13T00:00:00Z",
            base: { ref: "main" },
            head: { ref: "develop" },
            merge_commit_sha: after,
          },
        ];
      } else if (url.endsWith(`/git/commits/${before}`)) {
        payload = { tree: { sha: "tree-main" } };
      } else if (url.endsWith(`/git/commits/${source}`)) {
        payload = { tree: { sha: "tree-source" } };
      } else if (url.endsWith(`/commits/${source}/check-runs?per_page=100`)) {
        payload = {
          check_runs: ["verify", "e2e", "coverage"].map((name, id) => ({
            id,
            name,
            conclusion: "success",
            check_suite: { id: 10 },
          })),
        };
      } else if (url.endsWith(`/commits/${source}/status`)) {
        payload = {
          statuses: [{ id: 20, context: "ci-policy", state: "success" }],
        };
      } else {
        throw new Error(`richiesta inattesa: ${url}`);
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    await assert.doesNotReject(
      verifyProductionMerge({
        repository: "max23468/CF-Ready",
        event: { ref: "refs/heads/main", before, after },
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("accetta commit da PR develop revisionata e merge senza nuovo tree", () => {
  assert.doesNotThrow(() =>
    verifyPromotionHistory([
      {
        sha: "a".repeat(40),
        parents: [{}],
        pullRequests: [{ base: "develop", merged: true }],
      },
      {
        sha: "b".repeat(40),
        parents: [{}, {}],
        tree: "tree",
        parentTrees: ["old", "tree"],
        pullRequests: [],
      },
    ]),
  );
});

test("rifiuta commit senza una PR merged verso develop", () => {
  assert.throws(
    () =>
      verifyPromotionHistory([
        {
          sha: "c".repeat(40),
          parents: [{}],
          pullRequests: [{ base: "main", merged: true }],
        },
      ]),
    /provenienza review/,
  );
});

test("attende check GitHub e segnala risposta API o gate mancanti", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          check_runs:
            calls++ === 0
              ? []
              : [
                  {
                    id: 1,
                    name: "verify",
                    conclusion: "success",
                    check_suite: { id: 1 },
                  },
                ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    await assert.doesNotReject(
      waitForChecks("owner/repo", "a".repeat(40), ["verify"], {
        attempts: 2,
        intervalMs: 0,
      }),
    );
    assert.equal(calls, 2);
    await assert.rejects(
      waitForChecks("owner/repo", "a".repeat(40), ["verify", "coverage"], {
        attempts: 1,
        intervalMs: 0,
      }),
      /Gate mancanti.*coverage/,
    );

    globalThis.fetch = async () => new Response("errore", { status: 503 });
    await assert.rejects(
      waitForChecks("owner/repo", "a".repeat(40), ["verify"], { attempts: 1 }),
      /GET .*check-runs.*503/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verifica la provenienza completa della promozione tramite prove GitHub sintetiche", async () => {
  const originalFetch = globalThis.fetch;
  const headSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const baseSha = execFileSync("git", ["merge-base", "origin/main", headSha], {
    encoding: "utf8",
  }).trim();
  const reviewedSha = "d".repeat(40);
  const parentSha = "e".repeat(40);
  try {
    globalThis.fetch = async (input) => {
      const url = String(input);
      let payload;
      if (url.includes("/check-runs")) {
        payload = {
          check_runs: ["verify", "e2e", "coverage"].map((name, id) => ({
            id,
            name,
            conclusion: "success",
            check_suite: { id: 10 },
          })),
        };
      } else if (url.endsWith(`/commits/${headSha}/status`)) {
        payload = { statuses: [{ id: 20, context: "ci-policy", state: "success" }] };
      } else if (url.includes("/compare/")) {
        payload = { commits: [{ sha: reviewedSha }] };
      } else if (url.endsWith(`/commits/${reviewedSha}/pulls`)) {
        payload = [{ base: { ref: "develop" }, merged_at: "2026-09-02T00:00:00Z" }];
      } else if (url.endsWith(`/git/commits/${reviewedSha}`)) {
        payload = { parents: [{ sha: parentSha }], tree: { sha: "tree-reviewed" } };
      } else if (url.endsWith(`/git/commits/${parentSha}`)) {
        payload = { parents: [], tree: { sha: "tree-parent" } };
      } else {
        throw new Error(`richiesta inattesa: ${url}`);
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    await assert.doesNotReject(
      verifyPromotion({
        repository: "max23468/CF-Ready",
        event: {
          pull_request: {
            base: { ref: "main", sha: baseSha },
            head: {
              ref: "develop",
              sha: headSha,
              repo: { full_name: "max23468/CF-Ready" },
            },
          },
        },
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rifiuta una promozione che non nasce da develop", async () => {
  await assert.rejects(
    verifyPromotion({
      repository: "max23468/CF-Ready",
      event: { pull_request: { base: { ref: "main" }, head: { ref: "feature" } } },
    }),
    /main accetta solo promozioni/,
  );
});
