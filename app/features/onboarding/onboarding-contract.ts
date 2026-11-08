export const ONBOARDING_INTENTS = [
  "progress",
  "rules",
  "start_trial",
  "activate",
  "finish",
] as const;

export type OnboardingIntent = (typeof ONBOARDING_INTENTS)[number];
export type OnboardingCloseIntent = Extract<OnboardingIntent, "activate" | "finish">;

export const ONBOARDING_STEPS = { welcome: 1, rules: 2, preview: 3, activation: 4 } as const;

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.activation;

export function parseOnboardingStep(value: FormDataEntryValue | null) {
  const step = Number(value);
  return Number.isInteger(step) && step >= 1 && step <= ONBOARDING_STEP_COUNT ? step : null;
}
