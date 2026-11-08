export const HOME_INTENTS = [
  "review_prompt_result",
  "dismiss_checkin",
  "repair",
  "start_trial",
  "cancel",
  "monthly",
  "annual",
  "one_time",
  "enable",
  "disable",
] as const;

export type HomeIntent = (typeof HOME_INTENTS)[number];
