function textField(form: FormData | undefined, name: string) {
  const entry = form?.get(name);
  return typeof entry === "string" ? entry : null;
}

export function pendingFetcherIntent(form: FormData | undefined) {
  return textField(form, "intent");
}

export function pendingFetcherSource(form: FormData | undefined) {
  return textField(form, "source");
}

export function showSavedBanner(
  result: { ok: boolean } | undefined,
  dirty: boolean,
  changedSinceResult = false,
) {
  return result?.ok === true && !dirty && !changedSinceResult;
}
