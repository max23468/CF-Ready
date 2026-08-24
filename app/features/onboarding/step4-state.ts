export function onboardingStep4State({
  enabled,
  entitled,
  entitlementKind,
  trialStatus,
}: {
  enabled: boolean;
  entitled: boolean;
  entitlementKind: "none" | "trial" | "subscription" | "one_time";
  trialStatus: string | null;
}) {
  return {
    summary: enabled ? ("review" as const) : entitled ? ("ready" as const) : ("needs" as const),
    access: entitled
      ? entitlementKind === "trial"
        ? ("trial" as const)
        : ("plan" as const)
      : trialStatus === null
        ? ("first_run" as const)
        : ("lapsed" as const),
    canActivate: !enabled && entitled,
  };
}
