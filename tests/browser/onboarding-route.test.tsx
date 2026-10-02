import { router, mount, onboardingData, labelSlot } from "./route-support";
import { describe, expect, test, vi } from "vitest";

import { checkoutLabelCopy } from "../../app/checkout-labels/domain";
import { texts } from "../../app/i18n";
import onboardingCss from "../../app/routes/app.onboarding.css?raw";
import motionCss from "../../app/ui-motion.css?raw";
import { click, dispatch } from "./render";

import Onboarding from "../../app/routes/app.onboarding";

describe("Onboarding", () => {
  test("richiede i permessi opzionali e ignora un modulo regole incompleto", async () => {
    router.loaderData = { ...onboardingData, step: 2, labelScopesGranted: false };
    const view = await mount(<Onboarding />);
    const requestScopes = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").rules.labels.requestPermissions),
    );
    if (!requestScopes) throw new Error("richiesta permessi onboarding assente");
    await click(requestScopes);
    expect(shopify.scopes.request).toHaveBeenCalledWith([
      "write_translations",
      "read_locales",
      "read_markets",
    ]);
    expect(router.revalidator.revalidate).toHaveBeenCalledOnce();
    expect(router.fetcher.submit).not.toHaveBeenCalled();

    const originalFormData = FormData;
    class CompleteRulesFormData {
      get(name: string) {
        if (name === "taxCode") return "required_validated";
        if (name === "pec") return "optional_validated";
        return null;
      }
    }
    vi.stubGlobal("FormData", CompleteRulesFormData as unknown as typeof originalFormData);
    await dispatch(
      view.container.querySelector("s-choice")!,
      new Event("change", { bubbles: true }),
    );
    expect(view.container.textContent).toContain(
      checkoutLabelCopy("taxCode", "it", "required_validated"),
    );
    expect(view.container.textContent).toContain(
      checkoutLabelCopy("pec", "it", "optional_validated"),
    );

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

  test("cita tra virgolette le etichette proposte (T7)", async () => {
    router.loaderData = {
      ...onboardingData,
      step: 2,
      rules: { taxCode: "required_validated", pec: "required_when_company" },
    };
    const view = await mount(<Onboarding />);
    const taxCode = checkoutLabelCopy("taxCode", "it", "required_validated")!;
    const pec = checkoutLabelCopy("pec", "en", "required_when_company")!;
    expect(view.container.textContent).toContain(`IT · «${taxCode}»`);
    expect(view.container.textContent).toContain(`· «${pec}»`);
  });

  test("mostra l'errore se Shopify non completa la richiesta dei permessi", async () => {
    router.loaderData = { ...onboardingData, step: 2, labelScopesGranted: false };
    vi.mocked(shopify.scopes.request).mockRejectedValueOnce(new Error("scope_request_failed"));
    const view = await mount(<Onboarding />);
    const requestScopes = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").rules.labels.requestPermissions),
    );
    if (!requestScopes) throw new Error("richiesta permessi onboarding assente");

    await click(requestScopes);

    expect(view.container.querySelector('s-banner[tone="critical"]')).not.toBeNull();
    expect(router.revalidator.revalidate).not.toHaveBeenCalled();

    vi.mocked(shopify.scopes.request).mockResolvedValueOnce({ result: "declined-all" });
    await click(requestScopes);
    expect(router.revalidator.revalidate).not.toHaveBeenCalled();
  });

  test("configura la sincronizzazione automatica delle etichette dal secondo passo", async () => {
    router.loaderData = {
      ...onboardingData,
      step: 2,
      configHash: "hash",
      rules: { taxCode: "required_validated", pec: "optional_validated" },
      labelScopesGranted: true,
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
    const management = [...view.container.querySelectorAll("s-checkbox")].find((checkbox) =>
      checkbox.getAttribute("label")?.includes(texts("it").rules.labels.enable),
    ) as (HTMLElement & { checked: boolean }) | undefined;
    if (!management) throw new Error("gestione etichette onboarding assente");
    management.checked = true;
    await dispatch(management, new Event("change", { bubbles: true }));
    expect(
      [...view.container.querySelectorAll("s-checkbox")].some(
        (checkbox) => checkbox.getAttribute("label") === texts("it").rules.labels.enableConfirm,
      ),
    ).toBe(false);

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
    expect(router.fetcher.submit).not.toHaveBeenCalled();
    const confirmation = view.container.querySelector(
      's-modal[id="confirm-onboarding-checkout-label-management"]',
    );
    expect(confirmation?.textContent).toContain("Codice Fiscale · Italiano");
    expect(confirmation?.textContent).toContain("PEC · Inglese");
    await click(
      view.container.querySelector(
        's-modal[id="confirm-onboarding-checkout-label-management"] s-button[slot="primary-action"]',
      )!,
    );
    expect(router.fetcher.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        intent: "rules",
        configHash: "hash",
        labelsEnabled: "1",
        labelsConfirmed: "1",
        labelsRevision: "labels-r1",
      }),
      { method: "post" },
    );
    vi.stubGlobal("FormData", originalFormData);
  });

  test("salva la configurazione del campo Interno dal secondo passo", async () => {
    router.loaderData = { ...onboardingData, step: 2 };
    const view = await mount(<Onboarding />);
    const addressMode = [...view.container.querySelectorAll("s-select")].find(
      (select) => select.getAttribute("label") === texts("it").rules.labels.addressModeLabel,
    );
    if (!addressMode) throw new Error("configurazione Interno onboarding assente");

    expect(addressMode.querySelector('s-option[value="hidden"]')?.textContent).toBe(
      texts("it").rules.labels.addressHidden,
    );
    Object.defineProperty(addressMode, "value", { configurable: true, value: "hidden" });
    await dispatch(addressMode, new Event("change", { bubbles: true }));

    expect(router.fetcher.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        intent: "save_address2_form_mode",
        address2FormMode: "hidden",
      }),
      { method: "post" },
    );
  });

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
    expect(view.container.textContent).toContain(texts("it").onboarding.step3Heading);
    vi.stubGlobal("FormData", originalFormData);
  });

  test("copre accesso prova, piano, scaduto e attivazione", async () => {
    const variants = [
      { entitlementKind: "trial", entitled: true, trialStatus: "active", enabled: false },
      { entitlementKind: "subscription", entitled: true, trialStatus: null, enabled: false },
      { entitlementKind: "none", entitled: false, trialStatus: "expired", enabled: false },
    ] as const;
    for (const variant of variants) {
      router.loaderData = {
        ...onboardingData,
        ...variant,
        step: 4,
        rules: { taxCode: "required_validated", pec: "optional_validated" },
      };
      const variantKey = `${variant.entitlementKind}-${variant.trialStatus ?? "none"}`;
      const view = await mount(<Onboarding key={variantKey} />);
      const actions = [...view.container.querySelectorAll("s-button")];
      for (const label of [
        texts("it").onboarding.step4StartTrial,
        texts("it").onboarding.step4SeePlans,
        texts("it").onboarding.activate,
        texts("it").onboarding.finishWithout,
      ]) {
        const button = actions.find((candidate) => candidate.textContent?.includes(label));
        if (button) await click(button);
      }
    }
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "activate" }),
      { method: "post" },
    );
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
    const style = document.createElement("style");
    style.dataset.testOnboardingSummary = "true";
    style.textContent = `${motionCss}\n${onboardingCss}`;
    document.head.append(style);
    router.loaderData = {
      ...onboardingData,
      step: 4,
      rules: { taxCode: "required_validated", pec: "required_when_company" },
    };
    const view = await mount(<Onboarding />);
    const rows = view.container.querySelectorAll<HTMLElement>(".cf-onboarding-summary-row");
    const pecRow = rows[1];
    if (!pecRow) throw new Error("riga PEC del riepilogo assente");
    pecRow.style.inlineSize = "320px";

    const [, value] = [...pecRow.children] as HTMLElement[];
    const rowRect = pecRow.getBoundingClientRect();
    const valueRect = value.getBoundingClientRect();

    expect(valueRect.right - rowRect.right).toBeLessThan(0.1);
    expect(value.querySelector("s-badge")).toBeNull();
    expect(getComputedStyle(value).overflow).not.toBe("hidden");
    style.remove();
  });

  test("attraversa i quattro passi e completa senza attivare", async () => {
    router.loaderData = onboardingData;
    const view = await mount(<Onboarding />);
    const next = () =>
      [...view.container.querySelectorAll("s-button")].find((button) =>
        button.textContent?.includes(texts("it").onboarding.next),
      );
    await click(next()!);
    expect(view.container.textContent).toContain(texts("it").onboarding.step2Heading);
    await click(
      [...view.container.querySelectorAll("s-button")].find((button) =>
        button.textContent?.includes(texts("it").onboarding.back),
      )!,
    );
    expect(view.container.textContent).toContain(texts("it").onboarding.step1Heading);

    router.loaderData = { ...onboardingData, step: 3 };
    await view.rerender(<Onboarding key="step-3" />);
    expect(view.container.textContent).toContain(texts("it").onboarding.step3Heading);
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
    expect(router.navigate).toHaveBeenCalledWith("/app", { viewTransition: true });
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
    expect(view.container.textContent).toContain(texts("it").onboarding.step3Heading);
    expect(router.fetcher.submit).not.toHaveBeenCalled();
    vi.stubGlobal("FormData", originalFormData);
  });
});
