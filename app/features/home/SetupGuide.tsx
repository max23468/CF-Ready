import { texts } from "../../i18n";
import { commercialState } from "./commercial-state";
import type { HomeData } from "./home.server";

export function SetupGuide({
  data,
  busy,
  pendingIntent,
  pendingSource,
  submit,
}: {
  data: HomeData;
  busy: boolean;
  pendingIntent: string | null;
  pendingSource: string | null;
  submit: (intent: string, source?: string) => void;
}) {
  const t = texts(data.locale);
  const currentCommercialState = commercialState(data);
  const firstRun = currentCommercialState === "first_run";
  const configured = data.rules.taxCode !== "unmanaged" || data.rules.pec !== "unmanaged";
  const steps = [
    {
      done: configured,
      icon: "forms" as const,
      title: t.setup.rulesTitle,
      body: t.setup.rulesBody,
      action: <s-link href="/app/rules">{t.nav.rules}</s-link>,
    },
    {
      done: data.entitlement.kind !== "none",
      icon: "credit-card" as const,
      title:
        currentCommercialState === "first_run"
          ? t.setup.planTitle
          : currentCommercialState === "lapsed"
            ? t.setup.planTitleLapsed
            : t.setup.planTitleActive,
      body: firstRun ? t.setup.planBody : t.setup.planBodyLapsed,
      action: firstRun ? (
        <s-stack direction="inline" gap="base">
          <s-button
            disabled={busy || !data.eligible}
            loading={pendingIntent === "start_trial"}
            onClick={() => submit("start_trial", "setup")}
          >
            {t.setup.startTrial}
          </s-button>
        </s-stack>
      ) : null,
    },
    {
      done: data.validationEnabled,
      icon: "toggle-on" as const,
      title: t.setup.activateTitle,
      body: t.setup.activateBody,
      action:
        data.validationEnabled || !configured ? null : (
          <s-stack direction="inline" gap="base">
            <s-button
              disabled={busy || data.entitlement.kind === "none"}
              loading={pendingIntent === "enable" && pendingSource === "setup"}
              onClick={() => submit("enable", "setup")}
            >
              {t.home.activate}
            </s-button>
          </s-stack>
        ),
    },
    ...(data.address2Declared
      ? [
          {
            done: false,
            icon: "location" as const,
            title: t.setup.address2Title,
            body: t.home.nextAddress2,
            action: <s-link href="/app/rules">{t.nav.rules}</s-link>,
          },
        ]
      : []),
  ];
  const done = steps.filter((step) => step.done).length;
  const active = steps.findIndex((step) => !step.done);

  return (
    <s-section>
      <s-stack direction="block" gap="base">
        <s-stack direction="block" gap="small-100">
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-heading>{t.setup.heading}</s-heading>
            <s-badge tone={done === steps.length ? "success" : "info"}>
              {t.setup.progress(done, steps.length)}
            </s-badge>
          </s-stack>
          {done === 0 ? <s-paragraph>{t.setup.welcome}</s-paragraph> : null}
        </s-stack>

        <s-query-container>
          <s-grid
            gridTemplateColumns="@container (inline-size > 640px) 'repeat(3, minmax(0, 1fr))', 1fr"
            gap="small-100"
          >
            {steps.map((step, index) => (
              <s-stack key={step.title} direction="inline" gap="small-100" alignItems="center">
                {step.done ? (
                  <s-icon type="check-circle" tone="success" />
                ) : (
                  <s-icon type={step.icon} color={index === active ? "base" : "subdued"} />
                )}
                <s-text
                  type={index === active ? "strong" : undefined}
                  color={step.done ? "subdued" : "base"}
                >
                  {step.title}
                </s-text>
              </s-stack>
            ))}
          </s-grid>
        </s-query-container>

        {active >= 0 ? (
          <s-box background="subdued" borderRadius="base" padding="base">
            <s-stack direction="block" gap="small-100">
              <s-stack direction="inline" gap="small-100" alignItems="center">
                <s-icon type={steps[active].icon} color="base" />
                <s-text type="strong">{steps[active].title}</s-text>
              </s-stack>
              <s-paragraph>{steps[active].body}</s-paragraph>
              {steps[active].action}
            </s-stack>
          </s-box>
        ) : null}

        <s-stack direction="inline" gap="base">
          <s-button commandFor="onboarding-window" command="--show" variant="primary">
            {t.setup.guided}
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
