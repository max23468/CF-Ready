import { router, mount, homeData, confirmedHome } from "./route-support";
import { describe, expect, test, vi } from "vitest";
import { act } from "react";

import { texts } from "../../app/i18n";

import { click, type Rendered } from "./render";

import HomePage from "../../app/features/home/HomePage";
import { MerchantCheckIn } from "../../app/features/home/MerchantCheckIn";
import { PlanChoice } from "../../app/features/home/PlanChoice";
import { PlanStatus } from "../../app/features/home/PlanStatus";
import { SetupGuide } from "../../app/features/home/SetupGuide";

describe("Home merchant", () => {
  test("attraversa le varianti commerciali e le relative azioni", async () => {
    const submit = vi.fn();
    const variants = [
      homeData,
      {
        ...homeData,
        entitlement: { kind: "trial", validThrough: "2026-09-10" },
        trialStatus: "active",
        trialEndsAt: "2026-09-10",
        remaining: 1,
        rules: { taxCode: "optional_validated", pec: "unmanaged" },
      },
      {
        ...homeData,
        entitlement: { kind: "subscription", validThrough: "2026-09-30" },
        planKind: "annual",
        accountStatus: "active",
        creditEstimate: 12.5,
      },
      {
        ...homeData,
        entitlement: { kind: "subscription", validThrough: "2026-09-30" },
        planKind: "monthly",
        accountStatus: "ending",
      },
      {
        ...homeData,
        entitlement: { kind: "one_time", validThrough: null },
        complimentary: true,
        planKind: "one_time",
      },
    ] as const;

    for (const [index, data] of variants.entries()) {
      const view = await mount(
        <div>
          <PlanChoice
            data={data as never}
            busy={index === 1}
            pendingIntent={index === 1 ? "annual" : null}
            submit={submit}
            firstCharge="oggi"
          />
          <PlanStatus data={data as never} verifying={false} />
          <SetupGuide
            data={data as never}
            busy={false}
            pendingIntent={null}
            pendingSource={null}
            submit={submit}
          />
        </div>,
      );
      for (const button of view.container.querySelectorAll("s-button")) await click(button);
    }
    expect(submit).toHaveBeenCalledWith("monthly");
    expect(submit).toHaveBeenCalledWith("annual");
    expect(submit).toHaveBeenCalledWith("one_time");
    expect(submit).toHaveBeenCalledWith("start_trial");
  });

  test("mostra lo stato salvato in verifica e segnala la verifica fallita", async () => {
    const entitled = {
      ...homeData,
      entitlement: { kind: "subscription", validThrough: "2026-09-30" },
      planKind: "monthly",
      accountStatus: "active",
      validationEnabled: true,
      onboarding: "completed",
    };
    const t = texts("it");
    router.loaderData = confirmedHome(entitled, new Promise(() => undefined));
    const view = await mount(<HomePage key="pending" />);
    const badges = [...view.container.querySelectorAll("s-badge")].filter(
      (badge) => badge.textContent === t.home.verifying,
    );
    expect(badges).toHaveLength(2);
    const deactivate = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === t.home.deactivate,
    );
    expect(deactivate?.hasAttribute("disabled")).toBe(true);

    router.loaderData = confirmedHome(entitled, Promise.reject(new Error("timeout")));
    await view.rerender(<HomePage key="failed" />);
    await act(async () => void (await Promise.resolve()));
    expect(view.container.textContent).toContain(t.home.verificationFailed);
    expect(view.container.textContent).not.toContain(t.home.verifying);
    const retry = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === t.home.verificationRetry,
    );
    if (!retry) throw new Error("riprova assente");
    await click(retry);
    expect(router.revalidator.revalidate).toHaveBeenCalledOnce();

    router.loaderData = confirmedHome(entitled);
    await view.rerender(<HomePage key="confirmed" />);
    await act(async () => void (await Promise.resolve()));
    expect(view.container.textContent).not.toContain(t.home.verifying);
    expect(view.container.textContent).not.toContain(t.home.verificationFailed);
  });

  test("il check-in copre invio, dismiss e stato occupato", async () => {
    const submit = vi.fn();
    const data = {
      ...homeData,
      entitlement: { kind: "subscription", validThrough: "2026-09-30" },
      validationEnabled: true,
    };
    const view = await mount(
      <MerchantCheckIn
        data={data as never}
        busy={false}
        pendingIntent="dismiss_checkin"
        submit={submit}
      />,
    );
    const banner = view.container.querySelector("s-banner");
    banner?.dispatchEvent(new CustomEvent("dismiss", { bubbles: true }));
    for (const button of view.container.querySelectorAll("s-button")) await click(button);
    expect(submit).toHaveBeenCalledWith("dismiss_checkin", "checkin");
  });

  test("copre primo avvio, errore e azioni principali", async () => {
    router.loaderData = confirmedHome(homeData);
    const view = await mount(<HomePage />);
    expect(view.container.textContent).toContain(texts("it").home.titleNotStarted);
    const startTrial = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").plan.startTrial),
    );
    if (!startTrial) throw new Error("avvio prova assente");
    await click(startTrial);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "start_trial" },
      { method: "post" },
    );

    router.loaderData = confirmedHome({ ...homeData, errorCode: "billing_read_failed" });
    router.fetcher.data = { ok: false, errorCode: "generic" };
    await view.rerender(<HomePage />);
    expect(view.container.querySelectorAll('s-banner[tone="critical"]')).toHaveLength(1);
    const repair = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").home.repair),
    );
    if (!repair) throw new Error("riparazione assente");
    await click(repair);
    expect(router.fetcher.submit).toHaveBeenCalledWith({ intent: "repair" }, { method: "post" });
  });

  test("copre lo stato attivo completo", async () => {
    router.loaderData = confirmedHome({
      ...homeData,
      entitlement: { kind: "subscription", validThrough: "2026-09-30" },
      planKind: "monthly",
      accountStatus: "active",
      validationEnabled: true,
      rules: { taxCode: "required_validated", pec: "optional_validated" },
      onboarding: "completed",
      showMerchantCheckIn: true,
      messagesDefault: false,
      firstChargeAt: "2026-09-10",
      checkoutLabels: { ...homeData.checkoutLabels, status: "action_required" },
    });
    const view = await mount(<HomePage />);
    expect(view.container.textContent).toContain(texts("it").home.titleActive);
    expect(view.container.textContent).not.toContain(
      "Le etichette del checkout o il campo “Interno” richiedono un controllo.",
    );
    const deactivate = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").home.deactivate),
    );
    expect(deactivate).toBeTruthy();
  });

  test("copre avvisi, stati inattivi, intent pendenti e messaggi App Window", async () => {
    const variants = [
      {
        ...homeData,
        rules: { taxCode: "required_validated", pec: "unmanaged" },
      },
      {
        ...homeData,
        validationEnabled: true,
        trialStatus: "expired",
        remaining: 0,
        onboarding: "completed",
      },
      {
        ...homeData,
        entitlement: { kind: "trial", validThrough: "2026-09-02" },
        trialEndsAt: "2026-09-02",
        trialStatus: "active",
        remaining: 0,
        validationEnabled: true,
        rules: { taxCode: "required_validated", pec: "optional_validated" },
        onboarding: "completed",
      },
      { ...homeData, errorCode: "duplicate_validations" },
      { ...homeData, errorCode: "duplicate_validations_active" },
      { ...homeData, errorCode: "validation_readback_failed" },
    ] as const;
    let view: Rendered | undefined;
    for (const data of variants) {
      const variantKey = `${data.errorCode ?? "ok"}-${data.entitlement.kind}-${data.validationEnabled}-${data.rules.taxCode}-${data.trialStatus ?? "none"}`;
      router.loaderData = confirmedHome(data);
      if (!view) view = await mount(<HomePage key={variantKey} />);
      else await view.rerender(<HomePage key={variantKey} />);
    }
    if (!view) throw new Error("Home non montata");

    const appWindow = view.container.querySelector("s-app-window") as HTMLElement & {
      hide: () => Promise<void>;
    };
    appWindow.hide = vi.fn(async () => undefined);
    const plans = view.container.querySelector("#plans") as HTMLElement;
    plans.scrollIntoView = vi.fn();
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { type: "cf-ready:show-plans" },
        }),
      );
      await Promise.resolve();
    });
    expect(appWindow.hide).toHaveBeenCalledOnce();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { type: "cf-ready:navigate-from-app-window", href: "/app/rules" },
        }),
      );
      await Promise.resolve();
    });
    expect(router.navigate).toHaveBeenCalledWith("/app/rules", { viewTransition: true });
  });

  test("inoltra gli esiti della richiesta recensione, incluso il fallimento", async () => {
    const request = vi.fn().mockResolvedValueOnce({ code: "success" });
    vi.stubGlobal("shopify", {
      loading: vi.fn(),
      saveBar: { hide: vi.fn(), show: vi.fn() },
      reviews: { request },
    });
    router.loaderData = confirmedHome({ ...homeData, reviewDue: true });
    const view = await mount(<HomePage key="review-ok" />);
    await act(async () => void (await Promise.resolve()));
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "review_prompt_result", code: "success" },
      { method: "post" },
    );

    router.fetcher.submit.mockClear();
    request.mockRejectedValueOnce(new Error("non disponibile"));
    await view.rerender(<HomePage key="review-ko" />);
    await act(async () => void (await Promise.resolve()));
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "review_prompt_result", code: "request-failed" },
      { method: "post" },
    );
  });

  test("copre confronto piani e attivazione da uno stato avente diritto", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    router.location = {
      pathname: "/app",
      state: { cfReady: "cf-ready:show-plans" },
    };
    const entitledData = {
      ...homeData,
      entitlement: { kind: "subscription", validThrough: "2026-10-01" },
      planKind: "monthly",
      accountStatus: "active",
      onboarding: "completed",
    };
    router.loaderData = confirmedHome(entitledData);
    const view = await mount(<HomePage />);
    await act(
      async () => void (await new Promise((resolve) => requestAnimationFrame(() => resolve(true)))),
    );
    expect(scrollIntoView).toHaveBeenCalled();
    expect(view.container.textContent).toContain(texts("it").home.nextConfigure);

    router.location = { pathname: "/app", state: null };
    router.loaderData = confirmedHome({
      ...entitledData,
      rules: { taxCode: "required_validated", pec: "unmanaged" },
    });
    await view.rerender(<HomePage />);
    expect(view.container.textContent).toContain(texts("it").home.nextActivate);
    const activate = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").home.activate),
    );
    if (!activate) throw new Error("attivazione Home assente");
    await click(activate);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "enable", source: "status" },
      { method: "post" },
    );

    const pending = new FormData();
    pending.set("intent", "enable");
    pending.set("source", "status");
    router.fetcher.formData = pending;
    router.fetcher.state = "submitting";
    router.fetcher.data = { ok: false, errorCode: "future_error" };
    await view.rerender(<HomePage />);
    expect(view.container.textContent).toContain(texts("it").errors.generic);
  });

  test("PlanStatus distingue tutte le forme di accesso e rinnovo", async () => {
    const variants = [
      {
        ...homeData,
        entitlement: { kind: "trial", validThrough: "2026-09-10" },
        trialEndsAt: "2026-09-10",
      },
      {
        ...homeData,
        entitlement: { kind: "one_time", validThrough: null },
        complimentary: false,
      },
      { ...homeData, trialStatus: "expired" },
      { ...homeData, onboarding: "completed" },
      {
        ...homeData,
        entitlement: { kind: "subscription", validThrough: "2026-09-30" },
        planKind: "monthly",
        periodEnd: "2026-09-30",
        accountStatus: "active",
        plan: { ...homeData.plan, generation: "standard" },
      },
      {
        ...homeData,
        entitlement: { kind: "subscription", validThrough: "2026-09-30" },
        planKind: "annual",
        periodEnd: "2026-09-30",
        accountStatus: "ending",
      },
    ] as const;
    for (const data of variants) {
      const view = await mount(<PlanStatus data={data as never} verifying={false} />);
      expect(view.container.textContent).not.toBe("");
    }
  });
});
