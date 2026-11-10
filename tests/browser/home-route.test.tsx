import { router, mount, homeData, confirmedHome } from "./route-support";
import { describe, expect, test, vi } from "vitest";
import { act } from "react";

import { texts } from "../../app/i18n";
import { formatDate } from "../../app/i18n/format";

import { click, dispatch, type Rendered } from "./render";

import HomePage from "../../app/features/home/HomePage";
import { MerchantCheckIn } from "../../app/features/home/MerchantCheckIn";
import { HomeTrialNotice, HomeValidationSection } from "../../app/features/home/HomeSections";
import { PlanChoice } from "../../app/features/home/PlanChoice";
import { PlanStatus } from "../../app/features/home/PlanStatus";
import { SetupGuide } from "../../app/features/home/SetupGuide";

const paidActive = {
  ...homeData,
  entitlement: { kind: "subscription", validThrough: "2026-09-30" },
  planKind: "monthly",
  accountStatus: "active",
  validationEnabled: true,
  onboarding: "completed",
} as const;

describe("Home merchant", () => {
  test("la guida resta visibile e completata quando la configurazione finisce durante la visita", async () => {
    const before = {
      ...homeData,
      onboarding: "in_progress",
      entitlement: { kind: "trial", validThrough: "2026-10-22" },
      trialStatus: "active",
      trialEndsAt: "2026-10-22",
    };
    router.loaderData = confirmedHome(before);
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    expect(view.container.textContent).toContain(texts("it").setup.heading);

    router.loaderData = confirmedHome({
      ...before,
      onboarding: "completed",
      validationEnabled: true,
      rules: { taxCode: "required_validated", pec: "optional_validated" },
    });
    await view.rerender(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    // Togliere la card in cima alla pagina spostava tutta la Home (CLS fino a 0,6).
    expect(view.container.textContent).toContain(texts("it").setup.heading);
  });

  test("gli stati rari della Home portano in vista piani e avvisi", async () => {
    const lapsed = { ...homeData, trialStatus: "expired", remaining: 0, onboarding: "completed" };
    const view = await mount(
      <div>
        <HomeValidationSection
          data={lapsed as never}
          entitled={false}
          firstRun={false}
          busy={false}
          pendingIntent={null}
          pendingSource={null}
          submit={vi.fn()}
          verification="confirmed"
          t={texts("it")}
        />
        <HomeTrialNotice data={lapsed as never} busy={false} />
        <PlanChoice
          data={homeData as never}
          busy={false}
          pendingIntent={null}
          submit={vi.fn()}
          firstCharge="PRIMO-ADDEBITO"
        />
        <SetupGuide
          data={homeData as never}
          busy={false}
          pendingIntent={null}
          pendingSource={null}
          submit={vi.fn()}
        />
      </div>,
    );
    // P2-T4: l'unico badge della scelta del piano ha il tono del banner della prova.
    const recommended = [...view.container.querySelectorAll("s-badge")].find(
      (badge) => badge.textContent === texts("it").plan.recommended,
    );
    expect(recommended?.getAttribute("tone")).toBe("info");
    // Punto 2: "Scegli un piano" porta ai piani e sposta il focus, senza ancora `#plans`.
    const plans = view.container.querySelector<HTMLElement>("#plans")!;
    plans.scrollIntoView = vi.fn();
    const choose = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").trialContinuity.choosePlan,
    )!;
    expect(choose.getAttribute("href")).toBeNull();
    await click(choose);
    expect(plans.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(plans);
    // Punto 15: la data del primo addebito compare una volta, non per ogni piano ricorrente.
    expect(view.container.textContent!.match(/PRIMO-ADDEBITO/g)).toHaveLength(1);
    // Punto 6: quattro passi in una griglia 2 × 2, senza un passo da solo sull'ultima riga.
    expect(
      view.container
        .querySelector(".setup-guide__step")!
        .closest("s-grid")!
        .getAttribute("gridTemplateColumns"),
    ).toBe("@container (inline-size > 400px) 1fr 1fr, 1fr");
    await view.unmount();

    // Prezzi di lancio: contano solo per chi ha un abbonamento con rinnovi.
    const oneTime = await mount(
      <PlanStatus
        data={
          {
            ...homeData,
            entitlement: { kind: "one_time", validThrough: null },
            planKind: "one_time",
          } as never
        }
      />,
    );
    expect(oneTime.container.textContent).not.toContain(texts("it").plan.generationLaunch);
    await oneTime.unmount();

    // Punto 3: gli avvisi della Home si portano in vista come in Regole e Messaggi.
    router.loaderData = confirmedHome({ ...homeData, errorCode: "duplicate_validations" });
    const home = await mount(<HomePage />);
    expect(home.container.querySelector(".cf-reveal-banner s-banner")).not.toBeNull();
  });

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
          <PlanStatus data={data as never} />
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

  test("senza offerta il pagamento unico si richiede al supporto", async () => {
    const t = texts("it");
    const submit = vi.fn();
    const noOffer = { ...homeData, plan: { ...homeData.plan, one_time: null } };
    const view = await mount(
      <PlanChoice
        data={noOffer as never}
        busy={false}
        pendingIntent={null}
        submit={submit}
        firstCharge="oggi"
      />,
    );
    const request = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === t.plan.oneTimeRequest,
    );
    expect(request?.getAttribute("href")).toMatch(/^mailto:/);
    expect(view.container.textContent).not.toContain(t.plan.oneTimeStart);
    for (const button of view.container.querySelectorAll("s-button")) await click(button);
    expect(submit).not.toHaveBeenCalledWith("one_time");

    const managed = await mount(
      <PlanChoice
        data={{ ...paidActive, plan: noOffer.plan } as never}
        busy={false}
        pendingIntent={null}
        submit={submit}
        firstCharge="oggi"
      />,
    );
    expect(managed.container.querySelectorAll('input[name="managed-plan"]')).toHaveLength(2);
    expect(managed.container.textContent).toContain(t.plan.oneTimeRequest);
  });

  // Conferma rapida e fallita con il layout reale stanno in visual-surfaces.
  test("oltre il primo secondo di attesa la verifica diventa esplicita e ferma le azioni", async () => {
    const t = texts("it");
    router.loaderData = confirmedHome(paidActive, new Promise(() => undefined));
    // Si simula solo il timer del badge: `act` e le Promise restano reali.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const view = await mount(<HomePage />);
      const status = view.container.querySelector('div[role="status"]');
      const deactivate = view.container.querySelector('s-button[commandfor="deactivate"]');
      expect(status?.textContent).toContain(t.home.badgeActive);
      expect(view.container.textContent).not.toContain(t.home.verifying);
      expect(deactivate?.hasAttribute("disabled")).toBe(false);

      await act(async () => void vi.runOnlyPendingTimers());

      expect(status?.textContent).toContain(t.home.verifying);
      expect(status?.querySelectorAll("s-badge")).toHaveLength(1);
      expect(deactivate?.hasAttribute("disabled")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("una verifica fallita offre di riprovare e rilegge i dati", async () => {
    const failed = Promise.reject(new Error("timeout"));
    failed.catch(() => undefined);
    router.loaderData = confirmedHome(paidActive, failed);
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    const retry = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").home.verificationRetry,
    );
    if (!retry) throw new Error("riprova assente");
    await click(retry);
    expect(router.revalidator.revalidate).toHaveBeenCalledOnce();
  });

  test("il check-in pagante apre l'assistenza senza dati fiscali e si chiude dal bottone", async () => {
    const onDismiss = vi.fn();
    const t = texts("it");
    const data = {
      ...homeData,
      entitlement: { kind: "subscription", validThrough: "2026-09-30" },
      validationEnabled: true,
    };
    const component = (busy: boolean) => (
      <MerchantCheckIn
        data={data as never}
        busy={busy}
        pendingIntent={busy ? "dismiss_checkin" : null}
        onDismiss={onDismiss}
      />
    );
    const view = await mount(component(false));
    const banner = view.container.querySelector("s-banner")!;
    const button = (label: string) =>
      [...view.container.querySelectorAll("s-button")].find((item) => item.textContent === label)!;
    expect(banner.getAttribute("tone")).toBe("info");
    expect(button(t.home.checkInContact).getAttribute("href")).toMatch(
      /^mailto:supporto@cfready\.it\?/,
    );
    expect(button(t.home.checkInContact).getAttribute("href")).not.toContain("Codice%20Fiscale");
    expect(button(t.home.checkInContact).getAttribute("slot")).toBe("secondary-actions");
    expect(button(t.home.checkInDismiss).getAttribute("slot")).toBe("secondary-actions");

    await click(button(t.home.checkInDismiss));
    expect(onDismiss).toHaveBeenCalledOnce();

    await view.rerender(component(true));
    expect(button(t.home.checkInDismiss).hasAttribute("disabled")).toBe(true);
    expect(button(t.home.checkInDismiss).hasAttribute("loading")).toBe(true);
  });

  // D-199: il check-in si decide al primo paint e sparisce al clic, prima della risposta.
  test("il check-in compare solo se c'è all'apertura e si chiude subito", async () => {
    const paid = {
      ...homeData,
      entitlement: { kind: "subscription", validThrough: "2026-09-30" },
      planKind: "monthly",
      accountStatus: "active",
      validationEnabled: true,
      onboarding: "completed",
    };
    router.loaderData = confirmedHome(
      paid,
      Promise.resolve({ ...paid, showMerchantCheckIn: true }),
    );
    const late = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    expect(late.container.textContent).not.toContain(texts("it").home.checkInHeading);
    await late.unmount();

    router.loaderData = confirmedHome({ ...paid, showMerchantCheckIn: true });
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    const dismiss = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").home.checkInDismiss,
    );
    if (!dismiss) throw new Error("chiusura check-in assente");
    await click(dismiss);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "dismiss_checkin", source: "checkin" },
      { method: "post" },
    );
    expect(view.container.querySelector('s-banner[tone="info"]')).toBeNull();
  });

  // D-199: l'avviso presente all'apertura resta al suo posto e, se la conferma lo risolve, lo dice.
  test("l'avviso dell'apertura dice che il problema è risolto", async () => {
    const stored = { ...homeData, errorCode: "billing_read_failed" };
    router.loaderData = confirmedHome(stored, Promise.resolve({ ...homeData }));
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    const resolved = view.container.querySelector('s-banner[tone="success"]');
    expect(resolved?.textContent).toBe(texts("it").home.noticeResolved);
    expect(view.container.querySelector('div[role="status"]')?.textContent).not.toContain(
      texts("it").home.verificationUnavailable,
    );
  });

  test("l'avviso dell'apertura ripara un errore ancora presente", async () => {
    const failing = { ...homeData, errorCode: "validation_write_failed" };
    router.loaderData = confirmedHome(failing);
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    const repair = view.container.querySelector<HTMLElement>('s-banner[tone="critical"] s-button');
    if (!repair) throw new Error("riparazione nell'avviso assente");
    await click(repair);
    expect(router.fetcher.submit).toHaveBeenCalledWith({ intent: "repair" }, { method: "post" });
  });

  test("un errore emerso dopo l'apertura si ripara dalla card della Validation", async () => {
    router.loaderData = confirmedHome(
      { ...homeData },
      Promise.resolve({ ...homeData, errorCode: "billing_read_failed" }),
    );
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    expect(view.container.querySelector("s-banner")).toBeNull();
    expect(view.container.querySelector('div[role="status"]')?.textContent).toBe(
      texts("it").home.verificationUnavailable,
    );
    const repair = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").home.repair,
    );
    if (!repair) throw new Error("riparazione assente");
    await click(repair);
    expect(router.fetcher.submit).toHaveBeenCalledWith({ intent: "repair" }, { method: "post" });
  });

  test("al primo avvio la Home dichiara lo stato e richiede la prova", async () => {
    router.loaderData = confirmedHome(homeData);
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    expect(view.container.querySelector('div[role="status"]')?.textContent).toBe(
      texts("it").home.badgeNotStarted,
    );
    const startTrial = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").plan.startTrial),
    );
    if (!startTrial) throw new Error("avvio prova assente");
    await click(startTrial);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "start_trial" },
      { method: "post" },
    );
  });

  test("un'azione fallita mostra un solo errore critico e l'errore emerso resta riparabile", async () => {
    router.loaderData = confirmedHome(homeData);
    const view = await mount(<HomePage />);
    router.loaderData = confirmedHome({ ...homeData, errorCode: "billing_read_failed" });
    router.fetcher.data = { ok: false, errorCode: "generic" };
    await view.rerender(<HomePage />);
    const banners = view.container.querySelectorAll('s-banner[tone="critical"]');
    expect(banners).toHaveLength(1);
    expect(banners[0].textContent).toBe(texts("it").errors.generic);
    const repair = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").home.repair),
    );
    if (!repair) throw new Error("riparazione assente");
    await click(repair);
    expect(router.fetcher.submit).toHaveBeenCalledWith({ intent: "repair" }, { method: "post" });
  });

  test("BFS: piano gestito in finestra, date della Validation e motivo dell'attivazione bloccata", async () => {
    const t = texts("it");
    router.loaderData = confirmedHome({
      ...homeData,
      entitlement: { kind: "subscription", validThrough: "2026-09-30" },
      planKind: "monthly",
      accountStatus: "active",
      validationEnabled: true,
      validationActiveSince: "2026-10-01T08:00:00.000Z",
      lastConfirmedAt: "2026-10-30T09:15:00.000Z",
      rules: { taxCode: "required_validated", pec: "optional_validated" },
      onboarding: "completed",
    });
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    // 4.3.6: l'upgrade non resta in pagina, si apre da "Gestisci piano".
    const manage = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === t.plan.manage,
    );
    expect(
      manage?.getAttribute("commandfor") ?? (manage as { commandFor?: string })?.commandFor,
    ).toBe("manage-plan");
    const modal = view.container.querySelector("s-modal#manage-plan")!;
    // 4.1.6: scelta nel corpo, una sola conferma nello slot del dialogo.
    expect(modal.querySelectorAll('input[type="radio"]')).toHaveLength(3);
    expect(modal.querySelector('s-button[slot="primary-action"]')).not.toBeNull();
    expect(modal.querySelectorAll(":scope > s-stack s-button")).toHaveLength(0);
    // 4.2.3: da quando è attiva e quando Shopify l'ha confermata.
    expect(view.container.textContent).toContain(t.home.activeSince);
    expect(view.container.textContent).toContain(t.home.lastConfirmed);
    await view.unmount();

    router.loaderData = confirmedHome({ ...homeData, onboarding: "completed" });
    const blocked = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    // 4.3.7: l'attivazione disattivata dice perché.
    expect(blocked.container.textContent).toContain(t.home.activateNeedsPlan);
    expect(blocked.container.textContent).not.toContain(t.home.activeSince);
  });

  test.each(["it", "en"] as const)(
    "Gestisci piano conferma solo la scelta esplicita e ripristina la bozza alla chiusura (%s)",
    async (locale) => {
      const t = texts(locale);
      for (const currentPlan of ["monthly", "annual"] as const) {
        const data = {
          ...homeData,
          locale,
          entitlement: { kind: "subscription", validThrough: "2026-12-01" },
          planKind: currentPlan,
          accountStatus: "active",
          creditEstimate: { amount: 1, currencyCode: "EUR" },
        };
        const submit = vi.fn();
        const component = (busy = false) => (
          <PlanChoice
            data={data as never}
            busy={busy}
            pendingIntent={busy ? "one_time" : null}
            submit={submit}
            firstCharge="PRIMO-ADDEBITO"
          />
        );
        const view = await mount(component());
        const modal = view.container.querySelector("s-modal#manage-plan")!;
        const confirm = modal.querySelector('s-button[slot="primary-action"]')!;
        const choose = async (value: string) => {
          const input = modal.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
          await act(async () => input.click());
        };
        expect(modal.querySelector("input:checked")?.getAttribute("value")).toBe(currentPlan);
        expect(confirm.hasAttribute("disabled")).toBe(true);
        await click(confirm);
        expect(submit).not.toHaveBeenCalled();

        const nextPlan = currentPlan === "monthly" ? "annual" : "monthly";
        await choose(nextPlan);
        expect(confirm.textContent).toBe(
          currentPlan === "monthly" ? t.plan.annualSwitch : t.plan.monthlySwitch,
        );
        expect(submit).not.toHaveBeenCalled();
        await click(confirm);
        expect(submit).toHaveBeenLastCalledWith(nextPlan);

        // Annulla e chiusura nativa (X/Escape) non inviano nulla e scartano la scelta.
        submit.mockClear();
        await click(modal.querySelector('s-button[slot="secondary-actions"]')!);
        expect(confirm.hasAttribute("disabled")).toBe(true);
        await choose(nextPlan);
        await dispatch(modal, new Event("hide"));
        expect(confirm.hasAttribute("disabled")).toBe(true);
        await choose("one_time");
        await dispatch(modal, new Event("show"));
        expect(confirm.hasAttribute("disabled")).toBe(true);
        expect(submit).not.toHaveBeenCalled();

        await choose("one_time");
        expect(modal.textContent).toContain(t.plan.creditExpected);
        expect(confirm.textContent).toBe(t.plan.oneTimeStart);
        await view.rerender(component(true));
        expect(confirm.hasAttribute("disabled")).toBe(true);
        await click(confirm);
        expect(submit).not.toHaveBeenCalled();
        await view.rerender(component());
        await click(confirm);
        expect(submit).toHaveBeenCalledExactlyOnceWith("one_time");
        await view.unmount();
      }
    },
  );

  test("la disdetta invia l'intent solo dalla conferma e mostra l'invio in corso", async () => {
    const submit = vi.fn();
    const component = (pendingIntent: string | null) => (
      <PlanChoice
        data={
          {
            ...homeData,
            entitlement: { kind: "subscription", validThrough: "2026-12-01" },
            planKind: "monthly",
            accountStatus: "active",
          } as never
        }
        busy={pendingIntent !== null}
        pendingIntent={pendingIntent}
        submit={submit}
        firstCharge="oggi"
      />
    );
    const view = await mount(component(null));
    const trigger = view.container.querySelector(
      's-button[commandfor="cancel-renewal"][command="--show"]',
    )!;
    const confirm = view.container.querySelector(
      '#cancel-renewal s-button[slot="primary-action"]',
    )!;
    await click(trigger);
    expect(submit).not.toHaveBeenCalled();
    await click(confirm);
    expect(submit).toHaveBeenCalledExactlyOnceWith("cancel");
    await view.rerender(component("cancel"));
    expect(trigger.hasAttribute("loading")).toBe(true);
    expect(trigger.hasAttribute("disabled")).toBe(true);
  });

  test("il pagamento unico cita la prova soltanto mentre è in corso", async () => {
    const cases = [
      [{ entitlement: { kind: "trial", validThrough: "2026-11-07" }, trialStatus: "active" }, true],
      [{ entitlement: { kind: "none", validThrough: null }, trialStatus: "expired" }, false],
      [{ entitlement: { kind: "subscription", validThrough: "2026-12-01" } }, false],
    ] as const;
    for (const [state, mentionsTrial] of cases) {
      const view = await mount(
        <PlanChoice
          data={{ ...homeData, planKind: "monthly", accountStatus: "active", ...state } as never}
          busy={false}
          pendingIntent={null}
          submit={vi.fn()}
          firstCharge="oggi"
        />,
      );
      expect(view.container.textContent).toContain(
        mentionsTrial
          ? texts("it").plan.oneTimeChargeTrial
          : state.entitlement.kind === "subscription"
            ? texts("it").plan.noRenewals
            : texts("it").plan.oneTimeCharge,
      );
      expect(view.container.textContent?.includes("prova")).toBe(mentionsTrial);
      await view.unmount();
    }
  });

  test("con la Validation attiva la disattivazione parte solo dalla conferma del dialogo", async () => {
    const t = texts("it");
    router.loaderData = confirmedHome({
      ...paidActive,
      rules: { taxCode: "required_validated", pec: "optional_validated" },
      showMerchantCheckIn: true,
      messagesDefault: false,
      firstChargeAt: "2026-09-10",
      checkoutLabels: { ...homeData.checkoutLabels, status: "action_required" },
    });
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    expect(view.container.querySelector('div[role="status"]')?.textContent).toBe(
      t.home.badgeActive,
    );
    expect(view.container.textContent).toContain(t.home.messagesCustom);
    expect(view.container.querySelector('s-banner[tone="info"]')?.getAttribute("heading")).toBe(
      t.home.checkInHeading,
    );
    expect(view.container.textContent).not.toContain(
      "Le etichette del checkout o il campo «Interno» richiedono un controllo.",
    );

    await click(view.container.querySelector('s-button[commandfor="deactivate"]')!);
    await click(view.container.querySelector('#deactivate s-button[slot="secondary-actions"]')!);
    expect(router.fetcher.submit).not.toHaveBeenCalled();

    await click(view.container.querySelector('#deactivate s-button[slot="primary-action"]')!);
    expect(router.fetcher.submit).toHaveBeenCalledExactlyOnceWith(
      { intent: "disable" },
      { method: "post" },
    );
  });

  test.each([
    ["duplicate_validations", texts("it").errors.duplicate_validations],
    ["duplicate_validations_active", texts("it").errors.duplicate_validations_active],
    ["validation_readback_failed", texts("it").home.syncNeeded],
    ["billing_read_failed", texts("it").plan.lastAttempt],
  ])("l'avviso di apertura per %s spiega il problema", async (errorCode, message) => {
    router.loaderData = confirmedHome({ ...homeData, errorCode });
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    expect(view.container.querySelector('s-banner[tone="critical"]')?.textContent).toContain(
      message,
    );
  });

  test("le regole scelte prima della prova portano ad avviarla", async () => {
    const t = texts("it");
    router.loaderData = confirmedHome({
      ...homeData,
      rules: { taxCode: "required_validated", pec: "unmanaged" },
    });
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    const badge = view.container.querySelector('div[role="status"] s-badge');
    expect(badge?.textContent).toBe(t.home.badgeNotStarted);
    expect(badge?.getAttribute("tone")).toBe("neutral");
    expect(view.container.textContent).toContain(t.home.nextStartTrial);
  });

  test("una Validation rimasta attiva dopo la prova avvisa e porta alla scelta del piano", async () => {
    const t = texts("it");
    router.loaderData = confirmedHome({
      ...homeData,
      validationEnabled: true,
      trialStatus: "expired",
      remaining: 0,
      onboarding: "completed",
    });
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    expect(view.container.querySelector('div[role="status"] s-badge')?.getAttribute("tone")).toBe(
      "warning",
    );
    expect(view.container.textContent).toContain(t.home.titleLapsed);
    expect(view.container.textContent).toContain(t.home.nextChoosePlan);
    expect(view.container.querySelector('s-banner[tone="warning"]')?.textContent).toContain(
      t.trialContinuity.expired,
    );
  });

  test("l'ultimo giorno di prova con regole attive porta a verificare gli ordini", async () => {
    const t = texts("it");
    router.loaderData = confirmedHome({
      ...homeData,
      entitlement: { kind: "trial", validThrough: "2026-09-02" },
      trialEndsAt: "2026-09-02",
      trialStatus: "active",
      remaining: 0,
      validationEnabled: true,
      rules: { taxCode: "required_validated", pec: "optional_validated" },
      onboarding: "completed",
    });
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    expect(view.container.querySelector('div[role="status"] s-badge')?.getAttribute("tone")).toBe(
      "success",
    );
    expect(view.container.textContent).toContain(t.home.nextTestOrder);
    expect(view.container.querySelector('s-link[href="shopify://admin/orders"]')).not.toBeNull();
    expect(view.container.querySelector("s-banner")).toBeNull();
  });

  test("la finestra onboarding chiude e naviga soltanto con messaggi propri", async () => {
    router.loaderData = confirmedHome(homeData);
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));

    const appWindow = view.container.querySelector("s-app-window") as HTMLElement & {
      hide: () => Promise<void>;
      contentWindow: Window | null;
    };
    const onboardingFrame = document.createElement("iframe");
    view.container.append(onboardingFrame);
    appWindow.hide = vi.fn(async () => undefined);
    const plans = view.container.querySelector("#plans") as HTMLElement;
    plans.scrollIntoView = vi.fn();
    const send = (source: Window | null, data: object, origin = window.location.origin) =>
      act(async () => {
        window.dispatchEvent(new MessageEvent("message", { origin, source, data }));
        await Promise.resolve();
      });
    const showPlansMessage = { type: "cf-ready:show-plans" };
    const navigateMessage = { type: "cf-ready:navigate-from-app-window", href: "/app/rules" };

    // Finestra non ancora aperta: nessun mittente è atteso.
    await send(onboardingFrame.contentWindow, showPlansMessage);
    appWindow.contentWindow = onboardingFrame.contentWindow;
    for (const source of [null, window]) {
      await send(source, showPlansMessage);
      await send(source, navigateMessage);
    }
    await send(onboardingFrame.contentWindow, showPlansMessage, "https://other.example");
    expect(appWindow.hide).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(plans.scrollIntoView).not.toHaveBeenCalled();

    await send(onboardingFrame.contentWindow, showPlansMessage);
    expect(appWindow.hide).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(plans.scrollIntoView).toHaveBeenCalled());

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { type: "cf-ready:navigate-from-app-window", href: "/app/rules" },
          source: onboardingFrame.contentWindow,
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

  const entitledDisabled = { ...paidActive, validationEnabled: false } as const;
  const configuredRules = { taxCode: "required_validated", pec: "unmanaged" } as const;

  test("il ritorno con la richiesta dei piani li porta in vista e dà loro il focus", async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => undefined);
    router.location = { pathname: "/app", state: { cfReady: "cf-ready:show-plans" } };
    router.loaderData = confirmedHome(entitledDisabled);
    const view = await mount(<HomePage />);
    const plans = view.container.querySelector("#plans");
    await vi.waitFor(() => expect(scrollIntoView.mock.contexts).toContain(plans));
    expect(document.activeElement).toBe(plans);
    expect(view.container.textContent).toContain(texts("it").home.nextConfigure);
  });

  test("con un diritto attivo l'attivazione è l'azione primaria e conferma con un toast", async () => {
    const t = texts("it");
    router.loaderData = confirmedHome({ ...entitledDisabled, rules: configuredRules });
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    expect(view.container.textContent).toContain(t.home.nextActivate);
    const activate = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === t.home.activate,
    );
    if (!activate) throw new Error("attivazione Home assente");
    expect(activate.getAttribute("variant")).toBe("primary");
    await click(activate);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "enable", source: "status" },
      { method: "post" },
    );
    router.fetcher.data = { ok: true, enabled: true };
    await view.rerender(<HomePage />);
    expect(shopify.toast.show).toHaveBeenCalledWith(t.home.activated);
  });

  test("durante l'attivazione il bottone è occupato e un errore ignoto usa il messaggio generico", async () => {
    const t = texts("it");
    const pending = new FormData();
    pending.set("intent", "enable");
    pending.set("source", "status");
    router.fetcher.formData = pending;
    router.fetcher.state = "submitting";
    router.fetcher.data = { ok: false, errorCode: "future_error" };
    router.loaderData = confirmedHome({ ...entitledDisabled, rules: configuredRules });
    const view = await mount(<HomePage />);
    await act(async () => void (await Promise.resolve()));
    const activate = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === t.home.activate,
    );
    expect(activate?.hasAttribute("loading")).toBe(true);
    expect(activate?.hasAttribute("disabled")).toBe(true);
    expect(view.container.textContent).toContain(t.errors.generic);
  });

  test("l'approvazione del piano si apre fuori dall'iframe e solo se Shopify la richiede", async () => {
    const opener = vi.fn();
    vi.stubGlobal("open", opener);
    router.loaderData = confirmedHome(homeData);
    router.fetcher.data = { ok: true };
    const view = await mount(<HomePage />);
    expect(opener).not.toHaveBeenCalled();

    router.fetcher.data = { ok: true, confirmationUrl: "https://shopify.example/approve" };
    await view.rerender(<HomePage />);
    expect(opener).toHaveBeenCalledExactlyOnceWith("https://shopify.example/approve", "_top");
  });

  const date = (value: string) => formatDate(value, "it");
  const planStatusText = texts("it").plan;

  test.each([
    [
      "prova",
      {
        entitlement: { kind: "trial", validThrough: "2026-09-10" },
        trialEndsAt: "2026-09-10",
      },
      [planStatusText.trial(date("2026-09-10")), planStatusText.generationLaunch],
    ],
    [
      "pagamento unico",
      { entitlement: { kind: "one_time", validThrough: null }, complimentary: false },
      [planStatusText.oneTime],
    ],
    [
      "prova finita",
      { trialStatus: "expired" },
      [planStatusText.trialOver, planStatusText.generationLaunch],
    ],
    [
      "primo avvio",
      { onboarding: "completed" },
      [planStatusText.notStartedStatus, planStatusText.generationLaunch],
    ],
    [
      "abbonamento in rinnovo",
      {
        entitlement: { kind: "subscription", validThrough: "2026-09-30" },
        planKind: "monthly",
        periodEnd: "2026-09-30",
        accountStatus: "active",
        plan: { ...homeData.plan, generation: "standard" },
      },
      [
        planStatusText.subscription(date("2026-09-30")),
        planStatusText.nextCharge(date("2026-09-30")),
        planStatusText.generationStandard,
      ],
    ],
    [
      "abbonamento in chiusura",
      {
        entitlement: { kind: "subscription", validThrough: "2026-09-30" },
        planKind: "annual",
        periodEnd: "2026-09-30",
        accountStatus: "ending",
      },
      [
        planStatusText.subscription(date("2026-09-30")),
        planStatusText.periodEnds(date("2026-09-30")),
        planStatusText.generationLaunch,
      ],
    ],
  ])("PlanStatus descrive: %s", async (_, state, expected) => {
    const view = await mount(<PlanStatus data={{ ...homeData, ...state } as never} />);
    expect(
      [...view.container.querySelectorAll("s-paragraph")].map((item) => item.textContent),
    ).toEqual(expected);
  });

  const mountPlans = (state: object, firstCharge = "oggi") =>
    mount(
      <div>
        <PlanChoice
          data={{ ...homeData, planKind: "monthly", accountStatus: "active", ...state } as never}
          busy={false}
          pendingIntent={null}
          submit={vi.fn()}
          firstCharge={firstCharge}
        />
        <PlanStatus data={{ ...homeData, ...state } as never} />
      </div>,
    );
  const oneTimeEntitlement = { kind: "one_time", validThrough: null } as const;

  test("il piano omaggio non viene presentato come un pagamento", async () => {
    const { plan } = texts("it");
    expect(plan.complimentarySettled).not.toContain("attivo");
    const complimentary = await mountPlans({
      entitlement: oneTimeEntitlement,
      complimentary: true,
    });
    expect(
      complimentary.container.querySelector(`s-section[heading="${plan.includedHeading}"]`),
    ).not.toBeNull();
    expect(
      complimentary.container.querySelector(`s-section[heading="${plan.heading}"]`),
    ).not.toBeNull();
    expect(complimentary.container.textContent).toContain(plan.complimentarySettled);
    expect(complimentary.container.textContent).toContain(plan.complimentary);
    expect(complimentary.container.textContent).not.toContain(plan.oneTimeSettled);
    await complimentary.unmount();

    const purchased = await mountPlans({ entitlement: oneTimeEntitlement, complimentary: false });
    expect(purchased.container.textContent).toContain(plan.oneTimeSettled);
    expect(purchased.container.textContent).not.toContain(plan.complimentarySettled);
  });

  test.each([
    ["confirmed", 5, texts("it").plan.creditComplete],
    ["needs_review", null, texts("it").plan.creditProcessing],
    ["pending", null, texts("it").plan.creditProcessing],
  ])(
    "il credito del pagamento unico in stato %s dice cosa accade",
    async (status, actual, text) => {
      const view = await mountPlans({
        entitlement: oneTimeEntitlement,
        conversionCredit: { actual, estimate: 4, currency: "EUR", status },
      });
      const paragraphs = [...view.container.querySelectorAll("#plans s-paragraph")];
      expect(paragraphs.map((item) => item.textContent)).toContain(text);
    },
  );

  test("un credito non applicabile non aggiunge note al pagamento unico", async () => {
    const { plan } = texts("it");
    const view = await mountPlans({
      entitlement: oneTimeEntitlement,
      conversionCredit: { actual: null, estimate: null, currency: null, status: "not_applicable" },
    });
    expect(view.container.textContent).not.toContain(plan.creditProcessing);
    expect(view.container.textContent).not.toContain(plan.creditComplete);
  });

  test("la prima installazione non viene presentata come un piano da riattivare", async () => {
    const { plan } = texts("it");
    const firstRunState = { planKind: "none", accountStatus: "none" };
    const view = await mountPlans(firstRunState);
    const headings = [...view.container.querySelectorAll("s-section")].map((section) =>
      section.getAttribute("heading"),
    );
    const paragraphs = [...view.container.querySelectorAll("s-paragraph")].map(
      (paragraph) => paragraph.textContent,
    );
    expect(headings).toContain(plan.chooseNowHeading);
    expect(headings).not.toContain(plan.chooseHeading);
    expect(paragraphs).toContain(plan.oneTimeChargeNotStarted);
    expect(paragraphs).not.toContain(plan.oneTimeCharge);
    expect(paragraphs).toContain(plan.notStartedStatus);
    expect(
      [...view.container.querySelectorAll("s-button")].map((button) => button.textContent),
    ).toContain(plan.oneTimeStart);
    expect(
      [...view.container.querySelectorAll('s-button[variant="primary"]:not([slot])')].map(
        (button) => button.textContent,
      ),
    ).toEqual([plan.startTrial]);
    await view.unmount();

    const lapsed = await mountPlans({ ...firstRunState, trialStatus: "expired" });
    expect(
      lapsed.container.querySelector(`s-section[heading="${plan.chooseHeading}"]`),
    ).not.toBeNull();
    expect(
      lapsed.container.querySelector(`s-section[heading="${plan.chooseNowHeading}"]`),
    ).toBeNull();
  });

  const mountSetupGuide = (state: object, submit = vi.fn()) =>
    mount(
      <SetupGuide
        data={{ ...homeData, ...state } as never}
        busy={false}
        pendingIntent={null}
        pendingSource={null}
        submit={submit}
      />,
    );
  const stepTitles = (view: Rendered) =>
    [...view.container.querySelectorAll(".setup-guide__step s-text")].map(
      (title) => title.textContent,
    );
  const trialButton = (view: Rendered) =>
    [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").setup.startTrial,
    );
  const managedRules = { taxCode: "required_validated", pec: "unmanaged" } as const;

  test("la Setup guide spunta solo i passi conclusi e ne apre uno per volta", async () => {
    const open = await mountSetupGuide({});
    expect(open.container.querySelectorAll(".setup-guide__step")).toHaveLength(4);
    expect(open.container.querySelectorAll(".setup-guide__step--active")).toHaveLength(1);
    expect(open.container.querySelectorAll('s-icon[type="check-circle"]')).toHaveLength(0);
    expect(open.container.querySelectorAll('s-icon[tone="success"]')).toHaveLength(0);
    await open.unmount();

    const halfway = await mountSetupGuide({
      rules: managedRules,
      trialStatus: "active",
      entitlement: { kind: "trial", validThrough: "2026-08-18" },
    });
    expect(halfway.container.querySelectorAll('s-icon[type="check-circle"]')).toHaveLength(2);
    expect(halfway.container.querySelectorAll(".setup-guide__step--active")).toHaveLength(1);
  });

  test("la Setup guide offre la prova soltanto a chi non l'ha mai iniziata", async () => {
    const { setup } = texts("it");
    const submit = vi.fn();
    const first = await mountSetupGuide({}, submit);
    expect(stepTitles(first).filter((title) => title === setup.rulesTitle)).toHaveLength(1);
    await first.unmount();

    // Il passo della prova viene prima dell'attivazione, che senza diritto resterebbe disabilitata.
    const atTrial = await mountSetupGuide({ rules: managedRules }, submit);
    expect(stepTitles(atTrial)).toContain(setup.planTitle);
    await click(trialButton(atTrial)!);
    expect(submit).toHaveBeenCalledExactlyOnceWith("start_trial", "setup");
    await atTrial.unmount();

    const inTrial = await mountSetupGuide({
      trialStatus: "active",
      entitlement: { kind: "trial", validThrough: "2026-08-18" },
    });
    expect(trialButton(inTrial)).toBeUndefined();
    await inTrial.unmount();

    // Un piano assegnato prima della prova è uno stato attivo: non invita ad avviarla.
    const withPlan = await mountSetupGuide({
      entitlement: { kind: "subscription", validThrough: "2027-08-18" },
    });
    expect(trialButton(withPlan)).toBeUndefined();
    expect(stepTitles(withPlan)).toContain(setup.planTitleActive);
    await withPlan.unmount();

    const lapsed = await mountSetupGuide({ rules: managedRules, trialStatus: "expired" });
    expect(stepTitles(lapsed)).toContain(setup.planTitleLapsed);
    expect(
      [...lapsed.container.querySelectorAll("s-paragraph")].map((item) => item.textContent),
    ).toContain(setup.planBodyLapsed);
  });
});
