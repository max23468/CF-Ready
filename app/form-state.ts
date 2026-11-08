export function pendingFetcherIntent(form: FormData | undefined) {
  return form?.get("intent")?.toString() ?? null;
}

export function pendingFetcherSource(form: FormData | undefined) {
  return form?.get("source")?.toString() ?? null;
}

export function showSavedBanner(
  result: { ok: boolean } | undefined,
  dirty: boolean,
  changedSinceResult = false,
) {
  return result?.ok === true && !dirty && !changedSinceResult;
}
