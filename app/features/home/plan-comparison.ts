export function isPlanComparisonView(hash: string) {
  return hash === "#plans";
}

export function showSetupGuide(onboarding: string, hash: string) {
  return onboarding !== "completed" && !isPlanComparisonView(hash);
}
