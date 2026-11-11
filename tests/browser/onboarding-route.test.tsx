import { router, mount, onboardingData, labelSlot } from "./route-support";
import { describe, expect, test, vi } from "vitest";

import { MESSAGE_KEYS } from "../../app/config";
import { texts } from "../../app/i18n";
import { click, dispatch } from "./render";

import Onboarding from "../../app/routes/app.onboarding";

describe("Onboarding", () => {
  test("ignora un modulo regole incompleto senza richiedere permessi", async () => {
    router.loaderData = { ...onboardingData, step: 2 };
    const view = await mount(<Onboarding />);
    expect(shopify.scopes.request).not.toHaveBeenCalled();
    expect(router.fetcher.submit).not.toHaveBeenCalled();

    const originalFormData = FormData;
    class IncompleteRulesFormData {
      get(name: string) {
        return name === "taxCode" ? "required_validated" : null;
      }
    }
    vi.stubGlobal("FormData", IncompleteRulesFormData as unknown as typeof originalFormData);
    const next = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").onboarding.next),
    );
    if (!next) throw new Error("avanzamento onboarding assente");
    router.fetcher.submit.mockClear();
    await click(next);
    expect(router.fetcher.submit).not.toHaveBeenCalled();
    vi.stubGlobal("FormData", originalFormData);
  });

  test("il passo resta nell'URL e il passo 2 ha titoli coerenti", async () => {
    const original = window.location.href;
    router.loaderData = { ...onboardingData, step: 1, completed: true };
    const view = await mount(<Onboarding />);
    await click(
      [...view.container.querySelectorAll("s-button")].find(
        (button) => button.textContent === texts("it").onboarding.next,
      )!,
    );
    // Ricaricando, il loader riparte dal passo scritto nell'URL.
    expect(new URL(window.location.href).searchParams.get("step")).toBe("2");
    // Codice Fiscale e PEC mantengono i propri titoli.
    const headings = [...view.container.querySelectorAll(".onboarding-step s-heading")].map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual(
      expect.arrayContaining([texts("it").rules.taxCodeLabel, texts("it").rules.pecLabel]),
    );
    window.history.replaceState(window.history.state, "", original);
  });

  for (const locale of ["it", "en"] as const) {
    for (const [taxCode, taxMessages] of [
      ["unmanaged", []],
      ["optional_validated", ["taxCodeInvalid"]],
      ["required_validated", ["taxCodeRequired", "taxCodeInvalid"]],
    ] as const) {
      for (const [pec, pecMessages] of [
        ["unmanaged", []],
        ["optional_validated", ["pecInvalid"]],
        ["required_validated", ["pecRequired", "pecInvalid"]],
        ["required_when_company", ["pecRequired", "pecInvalid"]],
      ] as const) {
        test(`il passo 3 mostra solo i messaggi previsti: ${locale}, CF ${taxCode}, PEC ${pec}`, async () => {
          router.loaderData = { ...onboardingData, locale, step: 3, rules: { taxCode, pec } };
          const view = await mount(<Onboarding />);
          const t = texts(locale);
          const keys = [...taxMessages, ...pecMessages];
          const blocks = [...view.container.querySelectorAll<HTMLElement>(".onboarding-message")];
          expect(blocks).toHaveLength(keys.length);
          expect(
            blocks.map((block) => block.querySelector('s-text[type="strong"]')?.textContent),
          ).toEqual(keys.map((key) => t.messages[key]));
          for (const key of MESSAGE_KEYS) {
            const message = onboardingData.messages[locale][key];
            const shown = blocks.some(
              (block) => block.querySelector("s-text-field")?.getAttribute("error") === message,
            );
            if (keys.some((shown) => shown === key)) {
              expect(shown).toBe(true);
            } else {
              expect(shown).toBe(false);
            }
          }
          expect(view.container.querySelector(".onboarding-message s-badge")).toBeNull();
          expect(view.container.textContent).toContain(
            keys.length ? t.onboarding.step3MessagesBody : t.onboarding.step3NoMessages,
          );
          expect(view.container.textContent).not.toContain(
            keys.length ? t.onboarding.step3NoMessages : t.onboarding.step3MessagesBody,
          );
          if (!keys.length)
            expect(view.container.textContent).not.toContain(t.messages.previewHint);
        });
      }
    }
  }

  test.each(["it", "en"] as const)(
    "il passo 2 contiene solo le scelte CF e PEC (%s)",
    async (locale) => {
      router.loaderData = {
        ...onboardingData,
        step: 2,
        locale,
        rules: { taxCode: "required_validated", pec: "required_when_company" },
      };
      const view = await mount(<Onboarding />);
      const step = view.container.querySelector(".onboarding-step")!;
      expect(step.querySelectorAll("s-choice-list")).toHaveLength(2);
      expect(step.querySelectorAll("s-checkbox, s-box")).toHaveLength(0);
      expect(step.querySelectorAll("s-heading")).toHaveLength(2);
      expect(view.container.querySelector("s-modal")).toBeNull();
      expect(shopify.scopes.request).not.toHaveBeenCalled();
    },
  );

  test.each(["off", "guided", "partial", "automatic"] as const)(
    "salvare dal passo 2 conserva la gestione etichette %s",
    async (mode) => {
      router.loaderData = {
        ...onboardingData,
        step: 2,
        configHash: "hash",
        rules: { taxCode: "required_validated", pec: "optional_validated" },
        labelState: { ...onboardingData.labelState, mode },
        labelSnapshot: {
          revision: "labels-r1",
          slots: [
            labelSlot({
              name: "taxCode",
              key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
              locale: "it",
              family: "it",
              capability: "automatic",
            }),
            labelSlot({
              name: "pec",
              key: "shopify.checkout.localized_fields.additional_information.tax_email_it",
              locale: "en",
              family: "en",
              capability: "automatic",
            }),
            labelSlot({
              name: "taxCode",
              key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
              locale: "it",
              family: "it",
              capability: "automatic",
              currentValue: "Codice fiscale",
            }),
            labelSlot({ name: "address2", kind: "source" }),
          ],
        },
      };
      const view = await mount(<Onboarding />);
      const originalFormData = FormData;
      class LabelsFormData {
        get(name: string) {
          if (name === "taxCode") return "required_validated";
          if (name === "pec") return "optional_validated";
          return null;
        }
      }
      vi.stubGlobal("FormData", LabelsFormData as unknown as typeof originalFormData);
      await dispatch(view.container.querySelector("form")!, new Event("change", { bubbles: true }));
      await click(
        [...view.container.querySelectorAll("s-button")].find((button) =>
          button.textContent?.includes(texts("it").onboarding.next),
        )!,
      );
      expect(router.fetcher.submit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          intent: "rules",
          configHash: "hash",
          labelsEnabled: mode === "off" ? "0" : "1",
          labelsConfirmed: "0",
          labelsRevision: "labels-r1",
        }),
        { method: "post" },
      );
      vi.stubGlobal("FormData", originalFormData);
    },
  );

  test.each(["it", "en"] as const)(
    "il passo 2 non configura il campo Interno (%s)",
    async (locale) => {
      router.loaderData = { ...onboardingData, step: 2, locale };
      const view = await mount(<Onboarding />);
      const t = texts(locale);
      const addressMode = [...view.container.querySelectorAll("s-select")].find(
        (select) => select.getAttribute("label") === t.rules.labels.addressModeLabel,
      );
      expect(addressMode).toBeUndefined();
      expect(view.container.textContent).not.toContain(t.rules.labels.addressHeading);
      expect(view.container.textContent).not.toContain(t.rules.labels.addressModeHelp);
      expect(view.container.querySelector('s-choice-list[name="taxCode"]')).not.toBeNull();
      expect(view.container.querySelector('s-choice-list[name="pec"]')).not.toBeNull();
      expect(
        view.container.querySelectorAll(".onboarding-step s-checkbox, .onboarding-step s-box"),
      ).toHaveLength(0);
    },
  );

  test("salva le regole nel percorso locale e avanza al riepilogo", async () => {
    router.loaderData = onboardingData;
    const originalFormData = FormData;
    class RulesFormData {
      get(name: string) {
        if (name === "taxCode") return "required_validated";
        if (name === "pec") return "optional_validated";
        return null;
      }
      has() {
        return false;
      }
    }
    const view = await mount(<Onboarding />);
    const next = () =>
      [...view.container.querySelectorAll("s-button")].find((button) =>
        button.textContent?.includes(texts("it").onboarding.next),
      );
    await click(next()!);
    vi.stubGlobal("FormData", RulesFormData as unknown as typeof originalFormData);
    await click(next()!);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "rules",
        taxCode: "required_validated",
        pec: "optional_validated",
      }),
      { method: "post" },
    );
    router.fetcher.state = "loading";
    await view.rerender(<Onboarding />);
    router.fetcher.data = { ok: true };
    router.fetcher.state = "idle";
    await view.rerender(<Onboarding />);
    expect(view.container.querySelector("s-section")?.getAttribute("heading")).toBe(
      texts("it").onboarding.step3Heading,
    );
    vi.stubGlobal("FormData", originalFormData);
  });

  const step4Rules = { taxCode: "required_validated", pec: "optional_validated" } as const;
  const button = (container: HTMLElement, label: string) =>
    [...container.querySelectorAll("s-button")].find((item) => item.textContent === label);

  test.each([
    [
      "prova in corso",
      { entitlementKind: "trial", entitled: true, trialStatus: "active" },
      texts("it").onboarding.step4TrialHeading,
      texts("it").onboarding.step4TrialActive,
    ],
    [
      "piano attivo",
      { entitlementKind: "subscription", entitled: true, trialStatus: null },
      texts("it").plan.heading,
      texts("it").onboarding.step4PlanActive,
    ],
  ] as const)("con %s il passo 4 dichiara l'accesso e attiva", async (_, access, heading, body) => {
    const t = texts("it");
    router.loaderData = { ...onboardingData, ...access, step: 4, rules: step4Rules };
    const view = await mount(<Onboarding />);
    const step = view.container.querySelector<HTMLElement>(".onboarding-step")!;
    expect(step.querySelector("s-heading")?.textContent).toBe(heading);
    expect(step.textContent).toContain(body);
    expect(step.textContent).toContain(t.onboarding.step4Body);
    expect(button(view.container, t.onboarding.step4SeePlans)).toBeUndefined();
    expect(button(view.container, t.onboarding.step4StartTrial)).toBeUndefined();
    await click(button(view.container, t.onboarding.activate)!);
    expect(router.fetcher.submit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ intent: "activate" }),
      { method: "post" },
    );
  });

  test("a prova scaduta il passo 4 porta ai piani e permette di chiudere senza attivare", async () => {
    const t = texts("it");
    router.loaderData = {
      ...onboardingData,
      entitlementKind: "none",
      entitled: false,
      trialStatus: "expired",
      step: 4,
      rules: step4Rules,
    };
    const view = await mount(<Onboarding />);
    const step = view.container.querySelector<HTMLElement>(".onboarding-step")!;
    expect(step.textContent).toContain(t.plan.trialOver);
    expect(step.textContent).toContain(t.onboarding.step4Body);
    expect(button(view.container, t.onboarding.activate)).toBeUndefined();
    expect(button(view.container, t.onboarding.step4StartTrial)).toBeUndefined();

    await click(button(view.container, t.onboarding.step4SeePlans)!);
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith("/app", {
      state: { cfReady: "cf-ready:show-plans" },
      viewTransition: true,
    });

    await click(button(view.container, t.onboarding.finishWithout)!);
    expect(router.fetcher.submit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ intent: "finish" }),
      { method: "post" },
    );
  });

  test("Vedi i piani avvisa la Home che ha aperto la finestra, senza navigare il frame", async () => {
    const t = texts("it");
    const postMessage = vi.fn();
    vi.stubGlobal("opener", { postMessage });
    router.loaderData = { ...onboardingData, step: 4, rules: step4Rules };
    const view = await mount(<Onboarding />);
    const seePlans = button(view.container, t.onboarding.step4SeePlans)!;
    expect(
      [...view.container.querySelectorAll(".onboarding-step s-button")].map(
        (action) => action.textContent,
      ),
    ).toEqual([t.onboarding.step4StartTrial, t.onboarding.step4SeePlans]);
    expect(seePlans.hasAttribute("href")).toBe(false);

    await click(seePlans);

    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "cf-ready:show-plans" },
      window.location.origin,
    );
    expect(router.navigate).not.toHaveBeenCalled();
  });

  test("il passo 1 elenca i limiti e l'avanzamento resta sulla sola etichetta del passo", async () => {
    const t = texts("it");
    router.loaderData = onboardingData;
    const first = await mount(<Onboarding />);
    expect(
      [...first.container.querySelectorAll("s-unordered-list > s-list-item")].map(
        (item) => item.textContent,
      ),
    ).toEqual(t.onboarding.step1Limits);
    await first.unmount();

    router.loaderData = { ...onboardingData, step: 4 };
    const last = await mount(<Onboarding />);
    const progress = last.container.querySelector("s-progress")!.parentElement!;
    expect([...progress.querySelectorAll("s-text")].map((label) => label.textContent)).toEqual([
      "Passo 4 di 4",
    ]);
  });

  test("la modalità Mista descrive le capacità senza dichiarare controlli pendenti", async () => {
    for (const locale of ["it", "en"] as const) {
      router.loaderData = {
        ...onboardingData,
        locale,
        step: 4,
        labelState: { mode: "partial", address2Classification: "expected" },
      };
      const view = await mount(<Onboarding />);
      expect(view.container.textContent).toContain(texts(locale).onboarding.labelsMixedDescription);
      expect(view.container.textContent).toContain(
        locale === "it" ? "eventuali verifiche" : "any checks",
      );
      expect(view.container.textContent).not.toContain(
        locale === "it" ? "altre richiedono" : "others need",
      );
      await view.unmount();
    }
  });

  test("mantiene leggibile il valore completo nel riepilogo stretto", async () => {
    router.loaderData = {
      ...onboardingData,
      step: 4,
      rules: { taxCode: "required_validated", pec: "required_when_company" },
    };
    const view = await mount(<Onboarding />);
    const list = view.container.querySelector<HTMLElement>("s-query-container")!;
    list.style.display = "block";
    list.style.inlineSize = "320px";
    const value = view.container.querySelectorAll<HTMLElement>(".cf-status-list__value")[1];
    if (!value) throw new Error("valore PEC del riepilogo assente");

    expect(value.textContent).toBe(texts("it").home.pecRequiredForCompanies);
    expect(value.getBoundingClientRect().right - list.getBoundingClientRect().right).toBeLessThan(
      0.1,
    );
    expect(value.scrollWidth).toBeLessThanOrEqual(value.clientWidth);
    expect(value.querySelector('s-badge[tone="neutral"]')).not.toBeNull();
    await view.unmount();
  });

  test("attraversa i quattro passi e completa senza attivare", async () => {
    router.loaderData = onboardingData;
    const view = await mount(<Onboarding />);
    const next = () =>
      [...view.container.querySelectorAll("s-button")].find((button) =>
        button.textContent?.includes(texts("it").onboarding.next),
      );
    await click(next()!);
    expect(view.container.querySelector("s-section")?.getAttribute("heading")).toBe(
      texts("it").onboarding.step2Heading,
    );
    await click(
      [...view.container.querySelectorAll("s-button")].find((button) =>
        button.textContent?.includes(texts("it").onboarding.back),
      )!,
    );
    expect(view.container.querySelector("s-section")?.getAttribute("heading")).toBe(
      texts("it").onboarding.welcomeHeading,
    );

    router.loaderData = { ...onboardingData, step: 3 };
    await view.rerender(<Onboarding key="step-3" />);
    expect(view.container.querySelector("s-section")?.getAttribute("heading")).toBe(
      texts("it").onboarding.step3Heading,
    );
    expect(view.container.textContent).not.toContain(texts("it").rules.simulator.heading);

    router.loaderData = {
      ...onboardingData,
      step: 4,
      rules: { taxCode: "required_validated", pec: "optional_validated" },
    };
    await view.rerender(<Onboarding key="step-4" />);
    const finish = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").onboarding.finishWithout),
    );
    if (!finish) throw new Error("completamento assente");
    await click(finish);
    expect(router.fetcher.submit).toHaveBeenCalled();
  });

  test("la revisione torna direttamente alla Home senza registrare un completamento", async () => {
    router.loaderData = {
      ...onboardingData,
      step: 4,
      completed: true,
      rules: { taxCode: "required_validated", pec: "optional_validated" },
      entitled: true,
      entitlementKind: "subscription",
      enabled: true,
    };
    router.fetcher.data = { ok: false, errorCode: "generic" };
    const view = await mount(<Onboarding />);
    expect(view.container.querySelector('s-banner[tone="critical"]')).not.toBeNull();
    const complete = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").onboarding.goHome),
    );
    if (!complete) throw new Error("azione revisione assente");
    await click(complete);
    expect(router.navigate).toHaveBeenCalledWith("/app", {
      viewTransition: true,
    });
    expect(router.fetcher.submit).not.toHaveBeenCalled();
    expect(view.container.textContent).not.toContain(texts("it").onboarding.doneBody);
  });

  test("chiude l’onboarding senza chiedere una dichiarazione su Interno", async () => {
    router.loaderData = { ...onboardingData, step: 4 };
    const view = await mount(<Onboarding />);
    expect(view.container.querySelector('s-checkbox[name="address2"]')).toBeNull();
    const startTrial = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").onboarding.step4StartTrial),
    );
    if (!startTrial) throw new Error("avvio prova onboarding assente");
    await click(startTrial);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "start_trial" }),
      { method: "post" },
    );

    router.loaderData = {
      ...onboardingData,
      step: 4,
      rules: { taxCode: "required_validated", pec: "unmanaged" },
    };
    await view.rerender(<Onboarding key="managed-tax-code-step-4" />);
    const form = view.container.querySelector("form");
    if (!form) throw new Error("form onboarding assente");
    expect(form.querySelector('s-checkbox[name="address2"]')).toBeNull();
    const finish = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").onboarding.finishWithout),
    );
    if (!finish) throw new Error("completamento onboarding assente");
    await click(finish);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "finish",
      }),
      { method: "post" },
    );
  });

  test("un errore onboarding sconosciuto usa il fallback generico", async () => {
    router.loaderData = onboardingData;
    router.fetcher.data = { ok: false, errorCode: "future_error" };
    const view = await mount(<Onboarding />);
    expect(view.container.textContent).toContain(texts("it").errors.generic);
  });

  test("la revisione già salvata avanza senza riscrivere regole o progresso", async () => {
    router.loaderData = {
      ...onboardingData,
      step: 2,
      completed: true,
      rules: { taxCode: "optional_validated", pec: "unmanaged" },
    };
    const originalFormData = FormData;
    class UnchangedRulesFormData {
      get(name: string) {
        if (name === "taxCode") return "optional_validated";
        if (name === "pec") return "unmanaged";
        return null;
      }
    }
    vi.stubGlobal("FormData", UnchangedRulesFormData as unknown as typeof originalFormData);
    const view = await mount(<Onboarding />);
    const next = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").onboarding.next),
    );
    if (!next) throw new Error("avanzamento onboarding assente");
    await click(next);
    expect(view.container.querySelector("s-section")?.getAttribute("heading")).toBe(
      texts("it").onboarding.step3Heading,
    );
    expect(router.fetcher.submit).not.toHaveBeenCalled();
    vi.stubGlobal("FormData", originalFormData);
  });
});

describe("Conclusione dell'onboarding con prova attiva", () => {
  async function completeOnboarding(opener: { postMessage: () => void } | null = null) {
    vi.stubGlobal("opener", opener);
    router.loaderData = {
      ...onboardingData,
      step: 4,
      entitlementKind: "trial",
      entitled: true,
      trialStatus: "active",
      trialEndsAt: "2026-09-28",
      errorCode: null,
    };
    const view = await mount(<Onboarding />);
    const button = (label: string) => {
      const found = [...view.container.querySelectorAll("s-button")].find(
        (element) => element.textContent === label,
      );
      if (!found) throw new Error(`Pulsante assente: ${label}`);
      return found;
    };
    router.fetcher.submit.mockClear();
    await click(button(texts("it").onboarding.activate));
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "activate" },
      expect.objectContaining({ method: "post" }),
    );
    router.loaderData = { ...(router.loaderData as object), enabled: true, completed: true };
    router.fetcher.data = { ok: true };
    await view.rerender(<Onboarding />);
    expect(view.container.querySelector("s-section")?.getAttribute("heading")).toBe(
      texts("it").trialContinuity.activeHeading,
    );
    expect(router.navigate).not.toHaveBeenCalled();
    return button;
  }

  test("la conclusione torna alla home senza obbligare a scegliere un piano", async () => {
    const button = await completeOnboarding();
    await click(button(texts("it").trialContinuity.goHome));
    expect(router.navigate).toHaveBeenCalledWith("/app", { viewTransition: true });
    expect(router.fetcher.submit).toHaveBeenCalledTimes(1);
  });

  test("la conclusione nella App Window chiede alla home di chiudere la finestra", async () => {
    const postMessage = vi.fn();
    const button = await completeOnboarding({ postMessage });
    await click(button(texts("it").trialContinuity.goHome));
    expect(postMessage).toHaveBeenCalledWith(
      { type: "cf-ready:navigate-from-app-window", href: "/app" },
      window.location.origin,
    );
    expect(router.navigate).not.toHaveBeenCalled();
  });

  test("Scegli un piano riusa il listino della home senza avviare addebiti", async () => {
    const postMessage = vi.fn();
    const button = await completeOnboarding({ postMessage });
    await click(button(texts("it").trialContinuity.choosePlan));
    expect(postMessage).toHaveBeenCalledWith(
      { type: "cf-ready:show-plans" },
      window.location.origin,
    );
    expect(router.fetcher.submit).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
