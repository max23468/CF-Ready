// I workflow di deploy scrivono questo formato con `--message` su Shopify e sul Worker.
export function deployMessage(environment, commit) {
  return `${environment} ${commit}`;
}

export function commitFromMessage(environment, message) {
  return message?.match(new RegExp(`^${environment} ([0-9a-f]{40})$`))?.[1];
}

export function workerMessage(deployment) {
  return deployment?.annotations?.["workers/message"];
}

export function servesAllTraffic(deployment) {
  return deployment?.versions?.length === 1 && deployment.versions[0].percentage === 100;
}

export function activeVersion(versions) {
  return versions.find(({ status }) => status === "active");
}
