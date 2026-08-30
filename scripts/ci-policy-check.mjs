import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const CI_POLICY_STATUS_CONTEXT = "ci-policy";

const protectedPolicyFiles = new Set([
  ".npmrc",
  "doctor.config.json",
  "react-router.config.ts",
  "tests/apply-migrations.ts",
  "tests/playwright.config.ts",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
]);

export function isCiPolicyFile(path) {
  return (
    path.startsWith(".github/workflows/") ||
    path.startsWith("scripts/") ||
    protectedPolicyFiles.has(path) ||
    /(^|\/)package(?:-lock)?\.json$/.test(path) ||
    /^extensions\/[^/]+\/vitest\.config\.[^/]+$/.test(path)
  );
}

export function evaluateCiPolicy({ action, files, label, ownerId, senderId, trustedAutomation }) {
  const changedPolicyFiles = [...new Set(files.filter(isCiPolicyFile))].sort();
  if (changedPolicyFiles.length === 0) {
    return {
      state: "success",
      description: "La PR non modifica il control plane CI.",
      changedPolicyFiles,
    };
  }
  if (trustedAutomation) {
    return {
      state: "success",
      description: "Modifica CI generata dall'automazione attendibile.",
      changedPolicyFiles,
    };
  }
  if (senderId === ownerId && action === "labeled" && label === "ci-policy-approved") {
    return {
      state: "success",
      description: "Modifica CI attestata dal proprietario per questo SHA.",
      changedPolicyFiles,
    };
  }
  return {
    state: "failure",
    description: "Le modifiche CI richiedono ci-policy-approved dal proprietario.",
    changedPolicyFiles,
  };
}

async function request(path, token, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status}`);
  return response.status === 204 ? undefined : response.json();
}

async function changedFiles(repository, pullRequestNumber, expectedCount, token) {
  const files = [];
  let records = 0;
  for (let page = 1; page <= 30; page += 1) {
    const response = await request(
      `/repos/${repository}/pulls/${pullRequestNumber}/files?per_page=100&page=${page}`,
      token,
    );
    records += response.length;
    for (const file of response) {
      files.push(file.filename);
      if (file.previous_filename) files.push(file.previous_filename);
    }
    if (response.length < 100) break;
  }
  if (records !== expectedCount) {
    throw new Error(`Elenco file PR incompleto: attesi ${expectedCount}, ricevuti ${records}.`);
  }
  return files;
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token || !process.env.GITHUB_EVENT_PATH) {
    throw new Error("Mancano repository, token o payload evento per attestare la policy CI.");
  }
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const pullRequest = event.pull_request;
  const headSha = pullRequest?.head?.sha;
  const pullRequestNumber = event.number;
  const expectedCount = pullRequest?.changed_files;
  if (
    !/^[0-9a-f]{40}$/.test(headSha ?? "") ||
    !Number.isSafeInteger(pullRequestNumber) ||
    !Number.isSafeInteger(expectedCount) ||
    !Number.isSafeInteger(event.sender?.id)
  ) {
    throw new Error("Payload pull_request_target incompleto o non valido.");
  }

  const repositoryDetails = await request(`/repos/${repository}`, token);
  if (!Number.isSafeInteger(repositoryDetails.owner?.id)) {
    throw new Error("Il repository non espone un proprietario verificabile.");
  }
  const dependabot = await request("/users/dependabot%5Bbot%5D", token);
  const files = await changedFiles(repository, pullRequestNumber, expectedCount, token);
  const result = evaluateCiPolicy({
    action: event.action,
    files,
    label: event.label?.name,
    ownerId: repositoryDetails.owner.id,
    senderId: event.sender.id,
    trustedAutomation:
      event.sender.id === dependabot.id &&
      event.sender.login === dependabot.login &&
      event.sender.type === "Bot",
  });
  const targetUrl = `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  await request(`/repos/${repository}/statuses/${headSha}`, token, {
    method: "POST",
    body: JSON.stringify({
      state: result.state,
      context: CI_POLICY_STATUS_CONTEXT,
      description: result.description,
      target_url: targetUrl,
    }),
  });
  console.log(
    result.changedPolicyFiles.length === 0
      ? result.description
      : `${result.description} File: ${result.changedPolicyFiles.join(", ")}.`,
  );
  if (result.state !== "success") process.exitCode = 1;
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (process.env.GITHUB_ACTIONS === "true" && isDirectExecution) {
  await main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
