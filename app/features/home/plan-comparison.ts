export function isPlanComparisonView(search: string) {
  return new URLSearchParams(search).get("view") === "plans";
}

export function showSetupGuide(onboarding: string, search: string) {
  return onboarding !== "completed" && !isPlanComparisonView(search);
}
