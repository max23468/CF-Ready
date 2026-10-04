import { router, mount, labelSlot } from "./route-support";
import { describe, expect, test, vi } from "vitest";

import { DEFAULT_CONFIG } from "../../app/config";
import { checkoutLabelSlotId } from "../../app/checkout-labels/domain";
import { texts } from "../../app/i18n";

import { click, dispatch } from "./render";

import CheckoutRules from "../../app/routes/app.rules";

describe("Regole", () => {
  test("senza campi gestiti dice una volta sola che il checkout resta invariato", async () => {
    router.loaderData = { ...rulesData, rules: { taxCode: "unmanaged", pec: "unmanaged" } };
    const view = await mount(<CheckoutRules />);
    // P2-T7: lo dice il simulatore, non anche la sezione che lo contiene.
    expect(view.container.textContent!.split(texts("it").checkout.nothing).length - 1).toBe(1);
  });

  test("mostra subito la pagina e differisce la rilettura delle etichette", async () => {
    router.loaderData = {
      ...rulesData,
      labelScopesGranted: null,
      labelSnapshot: null,
    };
    const view = await mount(<CheckoutRules />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.loading);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      {
        intent: "load_checkout_labels",
        taxCode: "optional_validated",
        pec: "required_validated",
      },
      { method: "post" },
    );

    await view.rerender(<CheckoutRules />);
    expect(router.fetcher.submit).toHaveBeenCalledOnce();
    router.loaderData = { ...router.loaderData };
    await view.rerender(<CheckoutRules />);
    expect(router.fetcher.submit).toHaveBeenCalledTimes(2);
  });

  test("il readback di Salva aggiorna regole e revisione etichette senza una nuova scoperta", async () => {
    router.loaderData = {
      ...rulesData,
      labelScopesGranted: null,
      labelState: { ...rulesData.labelState, mode: "automatic" },
    };
    router.fetcher.data = {
      ok: true,
      loaded: {
        scopeGranted: true,
        snapshot: {
          revision: "old",
          slots: [],
          locales: [],
          markets: [],
          issues: [],
          address2: { classification: "unknown", hasMarketOverride: false },
        },
        state: { ...rulesData.labelState, mode: "automatic" },
        guidedConfirmations: [],
        errorCode: null,
      },
    };
    const view = await mount(<CheckoutRules />);
    router.fetcher.submit.mockClear();
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    const verified = {
      ...rulesData,
      configHash: "verified",
      labelScopesGranted: true,
      labelState: { ...rulesData.labelState, mode: "automatic" },
      labelSnapshot: {
        revision: "new",
        slots: [],
        locales: [],
        markets: [],
        issues: [],
        address2: { classification: "unknown", hasMarketOverride: false },
      },
    };
    router.actionData = { ok: true, saved: verified };
    await view.rerender(<CheckoutRules />);
    expect(router.fetcher.submit).not.toHaveBeenCalled();
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    expect(router.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        configHash: "verified",
        labelsRevision: "new",
        labelsEnabled: "1",
      }),
      { method: "post" },
    );

    // La rilettura esplicita continua ad aggiornare lo snapshot dopo il successo.
    router.fetcher.data = {
      ok: true,
      loaded: {
        ...router.fetcher.data.loaded,
        snapshot: { ...verified.labelSnapshot, revision: "refreshed" },
      },
    };
    await view.rerender(<CheckoutRules />);
    router.actionData = { ok: false, errorCode: "generic" };
    await view.rerender(<CheckoutRules />);
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    expect(router.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ labelsRevision: "refreshed" }),
      { method: "post" },
    );
  });

  test("dalla Guida porta in vista il simulatore e gli dà il focus", async () => {
    router.loaderData = rulesData;
    router.location = { pathname: "/app/rules", hash: "#simulatore", state: null };
    const view = await mount(<CheckoutRules />);
    // G-B4: "Riproduci il caso nel simulatore" arriva qui con l'ancora.
    const simulator = view.container.querySelector<HTMLElement>("#simulatore")!;
    expect(simulator.querySelector("s-query-container")).not.toBeNull();
    expect(document.activeElement).toBe(simulator);
    // Le etichette arrivano dopo e allungano la pagina: il simulatore torna in vista.
    simulator.scrollIntoView = vi.fn();
    router.fetcher.state = "loading";
    await view.rerender(<CheckoutRules />);
    router.fetcher.state = "idle";
    await view.rerender(<CheckoutRules />);
    expect(simulator.scrollIntoView).toHaveBeenCalled();
  });

  test("mostra la modalità Azienda soltanto per la PEC", async () => {
    router.loaderData = rulesData;
    const view = await mount(<CheckoutRules />);
    const taxCodeChoices = view.container.querySelectorAll(
      's-choice-list[name="taxCode"] s-choice',
    );
    const pecChoices = view.container.querySelectorAll('s-choice-list[name="pec"] s-choice');
    const ruleHeadings = [
      ...view.container.querySelectorAll(".rules-layout__fields > s-section"),
    ].map((section) => section.getAttribute("heading"));
    expect(ruleHeadings).toEqual(
      expect.arrayContaining([texts("it").rules.taxCodeLabel, texts("it").rules.pecLabel]),
    );

    expect(taxCodeChoices).toHaveLength(3);
    expect(pecChoices).toHaveLength(4);
    expect(
      [...taxCodeChoices].some(
        (choice) => choice.getAttribute("value") === "required_when_company",
      ),
    ).toBe(false);
    expect(
      [...pecChoices].some((choice) => choice.getAttribute("value") === "required_when_company"),
    ).toBe(true);
  });

  test("riapplica una regola locale conservando le altre impostazioni remote", async () => {
    router.loaderData = rulesData;
    const view = await mount(<CheckoutRules />);
    const original = FormData;
    class EditedFormData {
      get(name: string) {
        return name === "taxCode"
          ? "required_validated"
          : name === "pec"
            ? "required_validated"
            : null;
      }
    }
    vi.stubGlobal("FormData", EditedFormData as unknown as typeof original);
    await dispatch(
      view.container.querySelector("s-choice-list")!,
      new Event("change", { bubbles: true }),
    );
    vi.stubGlobal("FormData", original);
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    router.loaderData = {
      ...rulesData,
      configHash: "remote",
      rules: { taxCode: "unmanaged", pec: "optional_validated" },
    };
    router.actionData = { ok: false, errorCode: "config_conflict" };
    await view.rerender(<CheckoutRules />);
    expect(view.container.textContent).toContain(texts("it").conflict.heading);
    await click(
      [...view.container.querySelectorAll("s-button")].find(
        (button) => button.textContent === texts("it").conflict.reapply,
      )!,
    );
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    expect(router.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        configHash: "remote",
        taxCode: "required_validated",
        pec: "optional_validated",
      }),
      { method: "post" },
    );
  });

  const rulesData = {
    locale: "it",
    duplicateError: null,
    configHash: "hash",
    rules: { taxCode: "optional_validated", pec: "required_validated" },
    messages: DEFAULT_CONFIG.messages,
    enabled: true,
    entitled: true,
    labelScopesGranted: false,
    labelState: {
      mode: "off",
      managementEpoch: null,
      enabledAt: null,
      lastSyncAt: null,
      lastErrorCode: null,
      decision: "pending",
      acceptedRevision: null,
      reviewedAt: null,
      address2Classification: "unknown",
      address2HasMarketOverride: false,
      address2ExternalChangeAt: null,
      address2Decision: "pending",
      address2ReviewedAt: null,
      address2FormMode: null,
    },
    labelSnapshot: null,
    guidedConfirmations: [],
    labelLoadError: null,
    checkoutSettingsUrl: "https://admin.shopify.com/store/demo/settings/checkout",
    storefrontUrl: "https://demo.myshopify.com",
  } as const;

  test.each(["it", "en"] as const)(
    "%s: distingue scelta iniziale e verifica manuale",
    async (locale) => {
      const copy = texts(locale).rules.labels;
      const snapshot = {
        revision: "fixture",
        locales: [{ locale: "it", family: "it", name: "Italiano", primary: true, published: true }],
        markets: [],
        issues: [],
        address2: { classification: "expected", hasMarketOverride: false },
        slots: [labelSlot({ name: "taxCode", capability: "guided" })],
      };
      router.loaderData = {
        ...rulesData,
        locale,
        rules: { taxCode: "unmanaged", pec: "unmanaged" },
        labelScopesGranted: true,
        labelSnapshot: snapshot,
      };
      const view = await mount(<CheckoutRules />);
      const badge = () => view.container.querySelector("#checkout-native-labels summary s-badge")!;
      expect(badge().textContent).toBe(copy.statusChoiceRequired);
      expect(badge().getAttribute("tone")).toBe("warning");
      const technical = () => view.container.querySelector(".checkout-labels-technical")!;
      expect(technical().textContent).toContain(copy.modeValues.off);
      router.loaderData = {
        ...router.loaderData,
        rules: { taxCode: "required_validated", pec: "unmanaged" },
        labelState: { ...rulesData.labelState, mode: "guided" },
      };
      await view.rerender(<CheckoutRules key="manual-review" />);
      expect(badge().textContent).toBe(copy.statusManualRequired);
      expect(badge().getAttribute("tone")).toBe("warning");
      // R-8: la modalità guidata non ripete il conteggio delle verifiche, già nel riepilogo.
      expect(technical().textContent).toContain(copy.modeValues.guided);
      expect(technical().textContent).not.toContain(copy.automaticCountLabel);
      router.loaderData = {
        ...router.loaderData,
        rules: { taxCode: "unmanaged", pec: "unmanaged" },
        labelState: { ...rulesData.labelState, mode: "off", decision: "accepted" },
      };
      await view.rerender(<CheckoutRules key="kept-native-labels" />);
      expect(badge().textContent).toBe(copy.statusKept);
      expect(view.container.querySelectorAll("#checkout-native-labels s-badge")).toHaveLength(1);
    },
  );

  test("modifica la bozza, salva, annulla e invia il form", async () => {
    router.loaderData = rulesData;
    const view = await mount(<CheckoutRules />);
    const originalFormData = FormData;
    class RulesFormData {
      get(name: string) {
        if (name === "taxCode") return "required_validated";
        if (name === "pec") return "unmanaged";
        return null;
      }
    }
    vi.stubGlobal("FormData", RulesFormData as unknown as typeof originalFormData);
    await dispatch(
      view.container.querySelector("s-choice-list")!,
      new Event("change", { bubbles: true }),
    );
    expect(view.container.textContent).toContain(texts("it").common.unsavedNavigation);
    const buttons = [...view.container.querySelectorAll("button")];
    await click(buttons[1]);
    expect(view.container.textContent).not.toContain(texts("it").common.unsavedNavigation);
    await click(buttons[0]);
    await dispatch(
      view.container.querySelector("form")!,
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(router.submit).toHaveBeenCalled();
    vi.stubGlobal("FormData", originalFormData);
  });

  test("mostra duplicati, errori e conferma di salvataggio", async () => {
    router.loaderData = { ...rulesData, duplicateError: "duplicate_validations_active" };
    const view = await mount(<CheckoutRules />);
    expect(view.container.querySelector('s-banner[tone="critical"]')).not.toBeNull();

    router.loaderData = rulesData;
    router.actionData = { ok: false, errorCode: "generic" };
    await view.rerender(<CheckoutRules />);
    expect(view.container.querySelector('s-banner[tone="critical"]')).not.toBeNull();

    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    router.loaderData = { ...rulesData, configHash: "saved-hash" };
    router.actionData = { ok: true };
    await view.rerender(<CheckoutRules />);
    expect(shopify.toast.show).toHaveBeenCalledWith(texts("it").rules.saved);
  });

  test("mostra il conflitto senza riproporre la vecchia dichiarazione di Interno", async () => {
    router.loaderData = rulesData;
    router.actionData = { ok: false, errorCode: "config_conflict" };
    const view = await mount(<CheckoutRules />);
    expect(view.container.textContent).toContain(texts("it").conflict.heading);
    expect(view.container.querySelector('s-checkbox[name="address2"]')).toBeNull();
  });

  test("salva con hash assente senza riscrivere la vecchia dichiarazione", async () => {
    router.loaderData = {
      ...rulesData,
      configHash: null,
    };
    router.actionData = { ok: false, errorCode: "future_error" };
    const view = await mount(<CheckoutRules />);
    expect(view.container.textContent).toContain(texts("it").errors.generic);
    expect(view.container.querySelector('s-checkbox[name="address2"]')).toBeNull();

    const save = view.container.querySelector('ui-save-bar button[variant="primary"]');
    if (!save) throw new Error("salvataggio Regole assente");
    await click(save);
    expect(router.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        configHash: "",
      }),
      { method: "post" },
    );
    expect(router.submit.mock.calls.at(-1)?.[0]).not.toHaveProperty("address2");
  });

  test("registra la scelta di mantenere le etichette native", async () => {
    router.loaderData = rulesData;

    const view = await mount(<CheckoutRules />);
    const keep = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").rules.labels.keepNative,
    );
    if (!keep) throw new Error("scelta sulle etichette native assente");
    await click(keep);

    const [body, options] = router.fetcher.submit.mock.calls.at(-1)!;
    expect(options).toEqual({ method: "post" });
    expect(body).toBeInstanceOf(FormData);
    expect(Object.fromEntries((body as FormData).entries())).toEqual({
      intent: "accept_checkout_labels",
      labelsRevision: "",
    });

    router.loaderData = {
      ...rulesData,
      labelState: { ...rulesData.labelState, decision: "accepted" },
    };
    await view.rerender(<CheckoutRules key="labels-kept" />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.keepNativeAccepted);
    // Punto 8: una scelta neutra non è un successo.
    expect(
      [...view.container.querySelectorAll("s-badge")]
        .find((badge) => badge.textContent === texts("it").rules.labels.keepNativeAccepted)!
        .getAttribute("tone"),
    ).toBe("neutral");

    router.loaderData = {
      ...rulesData,
      labelScopesGranted: true,
      labelState: { ...rulesData.labelState, mode: "off", decision: "accepted" },
      labelSnapshot: null,
    };
    await view.rerender(<CheckoutRules key="labels-kept-with-scopes" />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.nativeSummaryKept);
  });

  test("mostra e aziona etichette native, override e ripristino di Interno", async () => {
    const snapshot = {
      locales: [
        { locale: "it", family: "it", name: "Italiano", primary: true, published: true },
        { locale: "en", family: "en", name: "English", primary: false, published: false },
      ],
      markets: [
        {
          id: "gid://shopify/Market/1",
          name: "Italia",
          defaultLocale: "it",
          locales: ["it", "en"],
          resolution: "ambiguous",
        },
        {
          id: "gid://shopify/Market/2",
          name: "Europa",
          defaultLocale: "it",
          locales: ["it"],
          resolution: "inherited",
        },
      ],
      issues: [],
      revision: "labels-r1",
      address2: { classification: "fiscal_conflict", hasMarketOverride: true },
      slots: [
        labelSlot({
          name: "taxCode",
          key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
          capability: "automatic",
          currentValue: "Codice fiscale (facoltativo)",
        }),
        labelSlot({
          name: "pec",
          key: "shopify.checkout.localized_fields.additional_information.tax_email_it",
          locale: "en",
          family: "en",
          currentValue: "Certified email address (PEC)",
        }),
        labelSlot({
          name: "taxCode",
          key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
          kind: "market_translation",
          marketId: "gid://shopify/Market/1",
          marketName: "Italia",
          currentValue: "Codice fiscale (facoltativo)",
        }),
        labelSlot({
          name: "pec",
          key: "shopify.checkout.localized_fields.additional_information.tax_email_it",
          kind: "market_translation",
          marketId: "gid://shopify/Market/2",
          marketName: "Europa",
          currentValue: "PEC Europa",
        }),
        labelSlot({ name: "address2", kind: "source", currentValue: "Codice fiscale" }),
        labelSlot({ name: "address2", currentValue: "Codice fiscale" }),
        labelSlot({
          name: "optionalAddress2",
          key: "shopify.checkout.contact.optional_address2_label",
          locale: "en",
          family: "en",
          kind: "market_translation",
          marketId: "gid://shopify/Market/1",
          marketName: "Italia",
          currentValue: "Tax code",
        }),
      ],
    } as const;
    router.loaderData = {
      ...rulesData,
      labelScopesGranted: true,
      labelState: {
        ...rulesData.labelState,
        mode: "automatic",
        lastSyncAt: "2026-09-08T12:00:00Z",
        address2Classification: "fiscal_conflict",
        address2FormMode: "required",
      },
      labelSnapshot: snapshot,
      labelLoadError: "checkout_labels_readback_failed",
    };
    router.fetcher.data = { ok: false, errorCode: "checkout_labels_conflict" };
    const view = await mount(<CheckoutRules />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.marketAmbiguous);
    expect(view.container.querySelectorAll('s-banner[tone="critical"]')).not.toHaveLength(0);
    const labelsArea = view.container.querySelector(".rules-layout__labels");
    const fieldsArea = view.container.querySelector(".rules-layout__fields");
    const disclosures = labelsArea?.querySelectorAll(
      "details.checkout-labels-disclosure:not(.checkout-label-instructions)",
    );
    expect(labelsArea?.parentElement?.lastElementChild).toBe(labelsArea);
    expect(labelsArea?.parentElement?.classList.contains("rules-layout-container")).toBe(true);
    // Le etichette stanno sotto la griglia di regole e simulatore, a 16 px.
    expect(
      labelsArea!.getBoundingClientRect().top -
        view.container.querySelector(".rules-layout")!.getBoundingClientRect().bottom,
    ).toBe(16);
    expect(labelsArea!.getBoundingClientRect().top).toBeGreaterThan(
      fieldsArea!.getBoundingClientRect().bottom,
    );
    expect(disclosures).toHaveLength(2);
    expect([...disclosures!].every((disclosure) => !disclosure.hasAttribute("open"))).toBe(true);
    expect(disclosures?.[0].textContent).toContain(texts("it").rules.labels.addressHeading);
    expect(disclosures?.[1].textContent).toContain(texts("it").rules.labels.nativeHeading);
    // R-B6, R-8: modalità, ultima lettura e conteggio automatico sono righe etichetta-valore,
    // non un pannello annidato.
    const technical = disclosures?.[1].querySelector(".checkout-labels-technical");
    expect(technical?.closest("details")).toBe(disclosures?.[1]);
    expect(technical?.querySelectorAll(".cf-status-list__label")).toHaveLength(3);
    expect(technical?.textContent).toContain(texts("it").rules.labels.automaticCountLabel);
    expect(technical?.textContent).toContain(texts("it").rules.labels.refresh);
    // R-7: un solo badge di stato nel pannello, nel titolo.
    expect(disclosures?.[1].querySelectorAll(".checkout-label-context s-badge")).toHaveLength(0);
    // N-2: confronto in tabella nativa, una riga per campo.
    expect(disclosures?.[1].querySelectorAll("s-table-body s-table-row").length).toBeLessThan(8);
    expect(disclosures?.[1].textContent).toContain(
      texts("it").rules.labels.marketCheckIncluded(["Italia"]),
    );
    // C-3: con mercati non confermati da Shopify non si afferma che tutti usano lo stesso testo.
    expect(disclosures?.[1].textContent).not.toContain(texts("it").rules.labels.allMarketsSame);
    expect(disclosures?.[1].textContent).not.toContain(
      texts("it").rules.labels.marketException("Italia"),
    );
    expect(disclosures?.[1].textContent).toContain("Cerca e filtra i risultati");
    expect(disclosures?.[1].textContent).toContain("Tax credential it");
    expect(disclosures?.[1].textContent).toContain("Tax email it");
    // R-9: la procedura sta in una modale nativa aperta da un bottone, non in un disclosure annidato.
    expect(disclosures?.[1].querySelectorAll("details")).toHaveLength(0);
    const instructions = disclosures?.[1].querySelectorAll('s-modal[id^="manual-labels-"]');
    if (!instructions?.length) throw new Error("istruzioni guidate assenti");
    const firstInstructions = instructions[0];
    expect(firstInstructions.getAttribute("heading")).toBe(texts("it").rules.labels.manualHeading);
    expect(firstInstructions.id).toMatch(/^manual-labels-[A-Za-z0-9_-]+$/);
    const openInstructions = disclosures?.[1].querySelector(
      `s-button[commandFor="${firstInstructions.id}"][command="--show"]`,
    );
    expect(openInstructions?.textContent).toBe(texts("it").rules.labels.manualHeading);
    expect(firstInstructions.querySelector("s-ordered-list")).not.toBeNull();

    const guidedConfirmations = [...view.container.querySelectorAll("s-button")].filter(
      (button) => button.textContent === texts("it").rules.labels.confirmGuided,
    );
    expect(guidedConfirmations.length).toBeGreaterThan(0);
    expect(guidedConfirmations.length).toBeLessThan(snapshot.slots.length);
    await click(guidedConfirmations[0]);

    expect(disclosures?.[0].querySelector("s-select")).not.toBeNull();
    // Decisione del 4 ottobre: l'aiuto del campo Interno è un solo paragrafo.
    const addressHelp = [...disclosures![0].querySelectorAll("s-paragraph")].filter((paragraph) =>
      paragraph.textContent?.includes(texts("it").rules.labels.addressModeHelp),
    );
    expect(addressHelp).toHaveLength(1);
    expect(addressHelp[0].textContent).toContain(texts("it").rules.labels.addressLimit);
    // Punto 7: anche le etichette del campo Interno sono tra virgolette.
    expect(disclosures?.[0].querySelector("s-table-body s-table-row")?.textContent).toMatch(/«.+»/);
    // R-6: con una sola lingua il campo Interno non ripete «Predefinito per questa lingua».
    expect(disclosures?.[0].textContent).not.toContain(texts("it").rules.labels.generalText);

    const restore = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").rules.labels.restoreAddress),
    );
    const keep = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").rules.labels.keepAddress),
    );
    if (!restore || !keep) throw new Error("azioni etichette assenti");
    await click(restore);
    expect(router.fetcher.submit).not.toHaveBeenCalledWith(
      expect.objectContaining({ intent: "restore_address2_labels" }),
      { method: "post" },
    );
    await click(
      view.container.querySelector(
        's-modal[id="restore-address2-it"] s-button[slot="primary-action"]',
      )!,
    );
    await click(keep);
    const addressMode = disclosures?.[0].querySelector("s-select") as HTMLElement & {
      value: string;
    };
    addressMode.value = "optional";
    await dispatch(addressMode, new Event("change", { bubbles: true }));
    const submissions = router.fetcher.submit.mock.calls.map(([body]) =>
      body instanceof FormData ? Object.fromEntries(body.entries()) : body,
    );
    expect(submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          intent: "confirm_guided_labels",
          labelsRevision: "labels-r1",
          slotId: expect.any(String),
        }),
        expect.objectContaining({
          intent: "restore_address2_labels",
          labelsRevision: "labels-r1",
          slotId: expect.any(String),
        }),
        { intent: "accept_address2_labels", labelsRevision: "labels-r1" },
        expect.objectContaining({
          intent: "save_address2_form_mode",
          address2FormMode: "optional",
        }),
      ]),
    );

    const language = labelsArea?.querySelector("s-select") as HTMLElement & { value: string };
    expect([...language.querySelectorAll("s-option")].map((option) => option.textContent)).toEqual([
      "Italiano",
      "Inglese",
    ]);
    expect(language.querySelector('s-option[value="it"]')?.hasAttribute("selected")).toBe(true);
    language.value = "en";
    await dispatch(language, new Event("change", { bubbles: true }));
    expect(language.value).toBe("en");
    const refresh = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").rules.labels.refresh,
    );
    if (!refresh) throw new Error("rilettura etichette assente");
    await click(refresh);
    const refreshSubmission = router.fetcher.submit.mock.calls
      .map(([body]) => (body instanceof FormData ? Object.fromEntries(body.entries()) : body))
      .findLast((body) => body.intent === "refresh_checkout_labels");
    expect(refreshSubmission).toEqual(
      expect.objectContaining({
        intent: "refresh_checkout_labels",
        labelsRevision: "labels-r1",
        taxCode: rulesData.rules.taxCode,
        pec: rulesData.rules.pec,
      }),
    );
    expect(router.revalidator.revalidate).not.toHaveBeenCalled();

    router.loaderData = {
      ...router.loaderData,
      guidedConfirmations: snapshot.slots
        .filter(
          (slot) =>
            slot.capability !== "automatic" && (slot.name === "taxCode" || slot.name === "pec"),
        )
        .map((slot) => ({
          slotId: checkoutLabelSlotId(slot),
          confirmedAt: "2026-09-13T01:09:00Z",
        })),
    };
    await view.rerender(<CheckoutRules key="confirmed-ambiguous-markets" />);
    expect(view.container.textContent).not.toContain(texts("it").rules.labels.marketAmbiguous);

    router.loaderData = {
      ...rulesData,
      rules: { taxCode: "unmanaged", pec: "unmanaged" },
      labelScopesGranted: true,
      labelState: rulesData.labelState,
      labelSnapshot: {
        ...snapshot,
        markets: snapshot.markets.map((market) => ({ ...market, resolution: "direct" as const })),
      },
    };
    await view.rerender(<CheckoutRules key="direct-unmanaged-labels" />);
    expect(view.container.textContent).not.toContain(texts("it").rules.labels.marketAmbiguous);

    router.fetcher.data = undefined;
    router.loaderData = {
      ...rulesData,
      rules: { ...rulesData.rules, taxCode: "required_validated" },
      labelScopesGranted: true,
      labelState: rulesData.labelState,
      labelSnapshot: snapshot,
    };
    await view.rerender(<CheckoutRules key="first-label-write" />);
    const keepNative = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").rules.labels.keepNative,
    );
    if (!keepNative) throw new Error("scelta sulle etichette native con scope assente");
    await click(keepNative);
    expect(router.fetcher.submit).toHaveBeenLastCalledWith(expect.any(FormData), {
      method: "post",
    });
    const management = [...view.container.querySelectorAll("s-checkbox")].find((checkbox) =>
      checkbox.getAttribute("label")?.includes(texts("it").rules.labels.enable),
    ) as (HTMLElement & { checked: boolean }) | undefined;
    if (!management) throw new Error("controllo gestione etichette assente");
    management.checked = true;
    await dispatch(management, new Event("change", { bubbles: true }));
    const submissionsBeforeConfirmation = router.submit.mock.calls.length;
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    expect(router.submit).toHaveBeenCalledTimes(submissionsBeforeConfirmation);
    await click(
      view.container.querySelector(
        's-modal[id="confirm-checkout-label-management"] s-button[slot="primary-action"]',
      )!,
    );
    expect(router.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ labelsEnabled: "1", labelsConfirmed: "1" }),
      { method: "post" },
    );

    router.loaderData = { ...rulesData, labelScopesGranted: true, labelSnapshot: null };
    await view.rerender(<CheckoutRules key="labels-without-snapshot" />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.noSnapshot);

    for (const address2Classification of ["nonstandard", "expected"] as const) {
      router.loaderData = {
        ...rulesData,
        labelScopesGranted: true,
        labelState: { ...rulesData.labelState, address2Classification },
        labelSnapshot: {
          ...snapshot,
          address2: { classification: address2Classification, hasMarketOverride: false },
        },
      };
      await view.rerender(<CheckoutRules key={address2Classification} />);
    }

    router.loaderData = {
      ...rulesData,
      locale: "en",
      labelScopesGranted: true,
      labelState: {
        ...rulesData.labelState,
        mode: "guided",
        lastSyncAt: "2026-09-08T12:00:00Z",
      },
      labelSnapshot: {
        ...snapshot,
        slots: snapshot.slots
          .filter((slot) => slot.marketId === null)
          .map((slot) => ({ ...slot, capability: "guided" as const })),
      },
      guidedConfirmations: [
        {
          slotId: JSON.stringify([
            "gid://shopify/OnlineStoreThemeLocaleContent/1",
            "shopify.checkout.localized_fields.additional_information.tax_credential_it",
            "it",
            null,
            "global_translation",
          ]),
          confirmedAt: "2026-09-08T12:00:00Z",
        },
      ],
    };
    await view.rerender(<CheckoutRules key="guided-english" />);
    const previewLanguage = [...view.container.querySelectorAll("s-select")].find(
      (select) => select.getAttribute("label") === texts("en").rules.simulator.previewLanguage,
    ) as HTMLElement & {
      value: string;
    };
    previewLanguage.value = "it";
    await dispatch(previewLanguage, new Event("change", { bubbles: true }));

    router.actionData = { ok: true, labelsErrorCode: "checkout_labels_partial_sync" };
    router.loaderData = {
      ...rulesData,
      labelScopesGranted: true,
      labelSnapshot: {
        ...snapshot,
        slots: [
          labelSlot({
            name: "address2",
            kind: "global_translation",
            capability: "automatic",
          }),
        ],
      },
    };
    await view.rerender(<CheckoutRules key="labels-partial" />);
    expect(view.container.querySelector('s-banner[tone="warning"]')).not.toBeNull();

    router.actionData = undefined;
    router.loaderData = {
      ...rulesData,
      labelScopesGranted: true,
      labelState: { ...rulesData.labelState, address2FormMode: "hidden" },
      labelSnapshot: snapshot,
    };
    await view.rerender(<CheckoutRules key="address2-hidden" />);
    const hiddenAddress = view.container.querySelector("details.checkout-labels-disclosure")!;
    expect(hiddenAddress.textContent).toContain(texts("it").rules.labels.addressHiddenSummary);
    expect(hiddenAddress.querySelector(".checkout-label-contexts")).toBeNull();
  });

  test("copre la variante facoltativa, i testi conformi e l'interfaccia inglese", async () => {
    const taxCode = labelSlot({
      name: "taxCode",
      key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
      capability: "guided",
      currentValue: "Codice fiscale (facoltativo)",
    });
    const taxCodeMarket = labelSlot({
      name: "taxCode",
      key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
      capability: "guided",
      kind: "market_translation",
      marketId: "gid://shopify/Market/1",
      marketName: null,
      currentValue: "Codice fiscale (facoltativo)",
    });
    const taxCodeEnglish = labelSlot({
      name: "taxCode",
      key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
      locale: "en",
      family: "en",
      capability: "guided",
      currentValue: "Tax code (optional)",
    });
    const taxCodeEnglishMarket = labelSlot({
      name: "taxCode",
      key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
      locale: "en",
      family: "en",
      capability: "guided",
      kind: "market_translation",
      marketId: "gid://shopify/Market/1",
      marketName: "Italia",
      currentValue: "Italian tax code (optional)",
    });
    const optionalAddress = labelSlot({
      name: "optionalAddress2",
      key: "shopify.checkout.contact.optional_address2_label",
      currentValue: "Interno, scala, ecc. (facoltativo)",
      sourceValue: "Interno, scala, ecc. (facoltativo)",
    });
    const snapshot = {
      locales: [
        { locale: "it", family: "it", name: "Italiano", primary: false, published: false },
        { locale: "en", family: "en", name: "English", primary: true, published: true },
      ],
      markets: [
        {
          id: "gid://shopify/Market/1",
          name: "Italia",
          defaultLocale: "it",
          locales: ["it", "en"],
          resolution: "direct",
        },
      ],
      issues: [],
      revision: "labels-optional",
      address2: { classification: "expected", hasMarketOverride: false },
      slots: [taxCode, taxCodeMarket, taxCodeEnglish, taxCodeEnglishMarket, optionalAddress],
    } as const;
    router.loaderData = {
      ...rulesData,
      labelScopesGranted: true,
      labelState: {
        ...rulesData.labelState,
        mode: "guided",
        decision: "accepted",
        address2FormMode: "optional",
      },
      labelSnapshot: snapshot,
      guidedConfirmations: [taxCode, taxCodeMarket].map((slot, index) => ({
        slotId: checkoutLabelSlotId(slot),
        confirmedAt: `2026-09-09T12:0${index}:00Z`,
      })),
    };
    const view = await mount(<CheckoutRules />);
    // L'inglese ha una verifica in sospeso: "Lingua delle etichette" lo seleziona da solo (R-H4).
    const language = view.container
      .querySelector(".rules-layout__labels")
      ?.querySelector("s-select") as HTMLElement & { value: string };
    expect(language.getAttribute("value")).toBe("en");
    language.value = "it";
    await dispatch(language, new Event("change", { bubbles: true }));
    expect(view.container.textContent).toContain(texts("it").rules.labels.allMarketsSame);
    expect(view.container.textContent).toContain("Ultima conferma manuale nel checkout:");
    expect(view.container.textContent).toContain(texts("it").rules.labels.addressStatus.expected);
    // R-B7: nessuna etichetta fiscale in Interno è un esito neutro, non un successo.
    const addressBadge = [
      ...view.container.querySelectorAll(".checkout-labels-title s-badge"),
    ].find((badge) => badge.textContent === texts("it").rules.labels.addressStatus.expected);
    expect(addressBadge?.getAttribute("tone")).toBe("neutral");
    // R-B4: le note del contesto sono frasi separate, senza puntini di unione.
    const notes = [...view.container.querySelectorAll(".checkout-label-context s-text")].map(
      (note) => note.textContent,
    );
    expect(notes).toContain(texts("it").rules.labels.allMarketsSame);
    expect(notes.some((note) => note?.includes(" · "))).toBe(false);
    // R-7: lo stato complessivo sta nel titolo del pannello, non su ogni lingua.
    expect(
      view.container.querySelector('.checkout-label-context s-badge[tone="success"]'),
    ).toBeNull();
    expect(texts("en").rules.labels.marketException("Italy")).toBe(
      "Customization for the Italy market",
    );
    expect(texts("en").rules.labels.lastManualVerification("now")).toBe(
      "Last manual confirmation in checkout: now",
    );

    router.loaderData = {
      ...router.loaderData,
      labelSnapshot: {
        ...snapshot,
        slots: [
          taxCode,
          taxCodeMarket,
          labelSlot({
            name: "optionalAddress2",
            key: "shopify.checkout.contact.optional_address2_label",
            kind: "source",
            currentValue: "Piano e porta",
          }),
          labelSlot({
            name: "optionalAddress2",
            key: "shopify.checkout.contact.optional_address2_label",
            currentValue: "Piano e porta",
          }),
        ],
        address2: { classification: "nonstandard", hasMarketOverride: false },
      },
    };
    await view.rerender(<CheckoutRules key="optional-nonstandard" />);
    expect(view.container.textContent).toContain(
      texts("it").rules.labels.addressStatus.nonstandard,
    );
    expect(view.container.textContent).toContain(texts("it").rules.labels.sourceManual);

    router.loaderData = {
      ...rulesData,
      rules: { ...rulesData.rules, taxCode: "unmanaged" },
      labelScopesGranted: true,
      labelState: {
        ...rulesData.labelState,
        mode: "guided",
        address2FormMode: "optional",
      },
      labelSnapshot: {
        ...snapshot,
        slots: [
          taxCode,
          { ...taxCodeMarket, currentValue: "CF Italia", marketName: "Italia" },
          labelSlot({
            name: "optionalAddress2",
            key: "shopify.checkout.contact.optional_address2_label",
            currentValue: null,
            inheritedValue: null,
            sourceValue: null,
          }),
          labelSlot({
            name: "optionalAddress2",
            key: "shopify.checkout.contact.optional_address2_label",
            kind: "market_translation",
            marketId: "gid://shopify/Market/1",
            marketName: "Italia",
            currentValue: "Piano e porta",
          }),
        ],
        address2: { classification: "nonstandard", hasMarketOverride: true },
      },
      guidedConfirmations: [],
    };
    await view.rerender(<CheckoutRules key="optional-market-exceptions" />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.notAvailable);
    expect(view.container.textContent).toContain("Italia");

    router.loaderData = {
      ...rulesData,
      locale: "en",
      labelScopesGranted: false,
      labelState: { ...rulesData.labelState, address2FormMode: "required" },
      labelSnapshot: snapshot,
    };
    await view.rerender(<CheckoutRules key="english-without-scopes" />);
    expect(view.container.textContent).toContain(texts("en").rules.labels.english);
    expect(texts("it").rules.labels.lastManualVerification("ora")).toBe(
      "Ultima conferma manuale nel checkout: ora",
    );

    router.navigation = { state: "submitting" };
    await view.rerender(<CheckoutRules key="busy-label-confirmation" />);
    const submissions = router.submit.mock.calls.length;
    await click(
      view.container.querySelector(
        's-modal[id="confirm-checkout-label-management"] s-button[slot="primary-action"]',
      )!,
    );
    expect(router.submit).toHaveBeenCalledTimes(submissions);
  });

  test("rilegge Shopify e abilita la conferma quando le etichette coincidono", async () => {
    const mismatched = labelSlot({
      name: "taxCode",
      key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
      kind: "source",
      capability: "read_only",
      currentValue: "Codice fiscale personalizzato",
    });
    router.loaderData = {
      ...rulesData,
      rules: { taxCode: "optional_validated", pec: "unmanaged" },
      labelScopesGranted: true,
      labelState: {
        ...rulesData.labelState,
        mode: "guided",
        address2FormMode: "required",
      },
      labelSnapshot: {
        locales: [{ locale: "it", family: "it", name: "Italiano", primary: true, published: true }],
        markets: [],
        issues: [],
        revision: "labels-before-readback",
        address2: { classification: "unknown", hasMarketOverride: false },
        slots: [mismatched],
      },
    };
    const view = await mount(<CheckoutRules />);
    const confirmation = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").rules.labels.confirmGuided,
    );
    expect(confirmation?.hasAttribute("disabled")).toBe(true);
    expect(view.container.textContent).toContain("Cerca e filtra i risultati");
    expect(view.container.textContent).toContain(texts("it").rules.labels.manualMismatch);
    const nativeDisclosure = view.container.querySelectorAll(
      "details.checkout-labels-disclosure:not(.checkout-label-instructions)",
    )[1];
    await click(nativeDisclosure.querySelector("summary")!);
    expect(nativeDisclosure.hasAttribute("open")).toBe(true);

    const refresh = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").rules.labels.refresh,
    );
    if (!refresh) throw new Error("rilettura Shopify assente");
    await click(refresh);
    const refreshForm = router.fetcher.submit.mock.calls.at(-1)?.[0] as FormData;
    expect(Object.fromEntries(refreshForm.entries())).toEqual({
      intent: "refresh_checkout_labels",
      labelsRevision: "labels-before-readback",
      taxCode: "optional_validated",
      pec: "unmanaged",
    });
    expect(router.revalidator.revalidate).not.toHaveBeenCalled();

    router.fetcher.formData = refreshForm;
    router.fetcher.state = "submitting";
    await view.rerender(<CheckoutRules />);
    const refreshingButton = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").rules.labels.refresh,
    );
    expect(refreshingButton?.hasAttribute("loading")).toBe(true);

    router.fetcher.formData = undefined;
    router.fetcher.state = "idle";
    router.fetcher.data = {
      ok: true,
      refreshed: {
        snapshot: {
          ...router.loaderData.labelSnapshot,
          revision: "labels-after-readback",
          slots: [{ ...mismatched, currentValue: "codice fiscale (facoltativo)" }],
        },
        state: router.loaderData.labelState,
        guidedConfirmations: [],
      },
    };
    await view.rerender(<CheckoutRules />);
    expect(shopify.toast.show).toHaveBeenCalledWith(texts("it").rules.labels.refreshComplete);
    expect(nativeDisclosure.hasAttribute("open")).toBe(true);
    const enabledConfirmation = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").rules.labels.confirmGuided,
    );
    expect(enabledConfirmation?.hasAttribute("disabled")).toBe(false);

    router.fetcher.data = undefined;
    router.loaderData = {
      ...router.loaderData,
      labelSnapshot: {
        ...router.loaderData.labelSnapshot,
        revision: "labels-after-readback",
        slots: [{ ...mismatched, currentValue: "codice fiscale (facoltativo)" }],
      },
    };

    const marketMismatch = {
      ...mismatched,
      kind: "market_translation" as const,
      marketId: "gid://shopify/Market/1",
      marketName: "Italia",
      currentValue: "CF Italia",
      inheritedValue: "codice fiscale (facoltativo)",
    };
    router.loaderData = {
      ...router.loaderData,
      labelSnapshot: {
        ...router.loaderData.labelSnapshot,
        markets: [
          {
            id: "gid://shopify/Market/1",
            name: "Italia",
            defaultLocale: "it",
            locales: ["it"],
            resolution: "ambiguous" as const,
          },
        ],
        revision: "labels-market-override",
        slots: [{ ...mismatched, currentValue: "codice fiscale (facoltativo)" }, marketMismatch],
      },
      guidedConfirmations: [],
    };
    await view.rerender(<CheckoutRules key="labels-market-override" />);
    expect(view.container.textContent).toContain("Adatta un mercato");
    expect(view.container.textContent).toContain("Checkout and system");
    expect(view.container.textContent).toContain("Filtra campi");
    expect(view.container.textContent).toContain(texts("it").rules.labels.checkoutCheckRequired);
    expect(texts("en").rules.labels.marketCheckIncluded(["Italy"])).toContain("Italy");
    expect(texts("en").rules.labels.nativeSummaryNeedsReview(1, ["English"])).toBe(
      "One checkout in English needs verification.",
    );
    expect(texts("en").rules.labels.nativeSummaryNeedsReview(2, ["Italian", "English"])).toBe(
      "2 checkouts in Italian and English need verification.",
    );
    expect(texts("en").rules.labels.manualSteps("English", null, true, []).join(" ")).toContain(
      "Search and filter results",
    );
    expect(
      texts("en").rules.labels.manualSteps("English", null, true, ["Italy"]).join(" "),
    ).toContain("Adapt a market");
    expect(
      texts("en").rules.labels.manualSteps("English", null, true, ["Italy"]).join(" "),
    ).toContain("Set Italy as the delivery country");
    expect(
      texts("it").rules.labels.manualSteps("Italiano", null, true, ["Italia"]).join(" "),
    ).toContain("Apri uno alla volta Italia");
    expect(texts("en").rules.labels.manualSteps("English", "Italy", false, []).join(" ")).toContain(
      "Italy",
    );
    expect(texts("en").rules.labels.manualSteps("English", null, false, []).join(" ")).toContain(
      "Translate for all markets",
    );
    expect(texts("it").rules.labels.manualSteps("Inglese", null, false, []).join(" ")).toContain(
      "Successivo",
    );
    const editorLinks = [...view.container.querySelectorAll("s-link")].filter(
      (link) => link.textContent === texts("it").rules.labels.openCheckoutContentEditor,
    );
    expect(editorLinks.length).toBeGreaterThan(0);
    expect(
      editorLinks.every((link) => link.getAttribute("href") === rulesData.checkoutSettingsUrl),
    ).toBe(true);
  });

  test("richiede gli scope delle etichette dalle Regole", async () => {
    router.loaderData = {
      ...rulesData,
      rules: { taxCode: "unmanaged", pec: "unmanaged" },
      labelScopesGranted: false,
    };
    const view = await mount(<CheckoutRules />);
    const disclosures = view.container.querySelectorAll(
      ".rules-layout__labels details.checkout-labels-disclosure:not(.checkout-label-instructions)",
    );
    expect(disclosures).toHaveLength(1);
    expect(disclosures[0].hasAttribute("open")).toBe(false);
    const language = view.container.querySelector(".rules-layout__labels s-select")!;
    expect(language.nextElementSibling?.textContent).toContain(
      texts("it").rules.labels.permissionsHeading,
    );
    expect(language.nextElementSibling?.querySelector(".checkout-label-context")).toBeNull();
    const summary = disclosures[0].querySelector("summary")!;
    const collapsedSummaryHeight = summary.getBoundingClientRect().height;
    const collapsedBorder = getComputedStyle(disclosures[0]).borderTopWidth;
    expect(disclosures[0].parentElement?.tagName).toBe("S-BOX");
    expect(disclosures[0].parentElement?.getAttribute("borderWidth")).toBe("base");
    await click(summary);
    expect(disclosures[0].hasAttribute("open")).toBe(true);
    expect(summary.getBoundingClientRect().height).toBe(collapsedSummaryHeight);
    expect(getComputedStyle(disclosures[0]).borderTopWidth).toBe(collapsedBorder);
    const requestScopes = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").rules.labels.requestPermissions),
    );
    if (!requestScopes) throw new Error("richiesta permessi Regole assente");
    // Punto 9: le due scelte stanno affiancate, non impilate con larghezze diverse.
    expect(requestScopes.parentElement!.getAttribute("direction")).toBe("inline");
    await click(requestScopes);
    expect(shopify.scopes.request).toHaveBeenCalledWith([
      "write_translations",
      "read_locales",
      "read_markets",
    ]);
    expect(router.revalidator.revalidate).not.toHaveBeenCalled();
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      {
        intent: "load_checkout_labels",
        taxCode: "unmanaged",
        pec: "unmanaged",
      },
      { method: "post" },
    );
    expect(router.navigate).not.toHaveBeenCalled();
  });

  test("gestisce l'errore dei permessi e gli stati sintetici delle etichette", async () => {
    router.loaderData = {
      ...rulesData,
      rules: { taxCode: "unmanaged", pec: "unmanaged" },
      labelScopesGranted: false,
    };
    vi.mocked(shopify.scopes.request).mockRejectedValueOnce(new Error("scope_request_failed"));
    const view = await mount(<CheckoutRules />);
    const requestScopes = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").rules.labels.requestPermissions),
    );
    if (!requestScopes) throw new Error("richiesta permessi Regole assente");

    await click(requestScopes);
    expect(view.container.querySelector('s-banner[tone="critical"]')).not.toBeNull();
    expect(router.revalidator.revalidate).not.toHaveBeenCalled();

    vi.mocked(shopify.scopes.request).mockResolvedValueOnce({ result: "declined-all" });
    await click(requestScopes);
    expect(router.revalidator.revalidate).not.toHaveBeenCalled();

    const healthySnapshot = {
      locales: [{ locale: "it", family: "it", name: "Italiano", primary: false, published: true }],
      markets: [],
      issues: [],
      revision: "labels-healthy",
      address2: { classification: "expected", hasMarketOverride: false },
      slots: [
        labelSlot({
          name: "taxCode",
          locale: "it",
          family: "it",
          capability: "automatic",
          currentValue: null,
          sourceValue: null,
        }),
      ],
    } as const;
    router.loaderData = {
      ...rulesData,
      rules: { taxCode: "optional_validated", pec: "unmanaged" },
      labelScopesGranted: true,
      labelState: { ...rulesData.labelState, mode: "automatic" },
      labelSnapshot: healthySnapshot,
    };
    await view.rerender(<CheckoutRules key="labels-healthy" />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.statusUpToDate);
    expect(view.container.textContent).toContain(texts("it").rules.labels.notAvailable);

    router.loaderData = {
      ...router.loaderData,
      labelState: {
        ...rulesData.labelState,
        mode: "automatic",
        lastErrorCode: "checkout_labels_partial_sync",
      },
    };
    await view.rerender(<CheckoutRules key="labels-error" />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.nativeSummaryError);
    // Punto 4: un errore salvato si spiega e non si presenta come verifica manuale.
    expect(view.container.textContent).toContain(texts("it").errors.checkout_labels_partial_sync);
    expect(view.container.textContent).toContain(texts("it").rules.labels.statusError);

    router.loaderData = {
      ...router.loaderData,
      labelState: {
        ...rulesData.labelState,
        mode: "guided",
        lastErrorCode: "checkout_labels_confirmation_pending",
      },
    };
    await view.rerender(<CheckoutRules key="labels-pending" />);
    expect(view.container.textContent).not.toContain(texts("it").rules.labels.nativeSummaryError);
  });
});

describe("Regole: salvataggio ed etichette (audit §5.1)", () => {
  const baseData = {
    locale: "it",
    duplicateError: null,
    configHash: "hash",
    rules: { taxCode: "optional_validated", pec: "required_validated" },
    messages: DEFAULT_CONFIG.messages,
    enabled: true,
    entitled: true,
    labelScopesGranted: true,
    labelState: {
      mode: "partial",
      managementEpoch: "epoch",
      enabledAt: null,
      lastSyncAt: null,
      lastErrorCode: null,
      decision: "pending",
      acceptedRevision: null,
      reviewedAt: null,
      address2Classification: "expected",
      address2HasMarketOverride: false,
      address2ExternalChangeAt: null,
      address2Decision: "pending",
      address2ReviewedAt: null,
      address2FormMode: "required",
    },
    labelSnapshot: null as unknown,
    guidedConfirmations: [] as Array<{ slotId: string; confirmedAt: string }>,
    labelLoadError: null,
    checkoutSettingsUrl: "https://admin.shopify.com/store/demo/settings/checkout",
    storefrontUrl: "https://demo.myshopify.com",
  };
  const snapshot = (revision: string, slots: unknown[] = []) => ({
    revision,
    locales: [
      { locale: "it", family: "it", name: "Italiano", primary: true, published: true },
      { locale: "en", family: "en", name: "English", primary: false, published: true },
    ],
    markets: [],
    slots,
    issues: [],
    address2: { classification: "expected", hasMarketOverride: false },
  });
  const pecSlot = (family: "it" | "en", currentValue: string) =>
    labelSlot({
      name: "pec",
      key: "shopify.checkout.contact.tax_email_it_label",
      locale: family,
      family,
      kind: family === "it" ? "source" : "global_translation",
      capability: "guided",
      currentValue,
      sourceValue: "PEC",
    });

  async function editRules(view: Awaited<ReturnType<typeof mount>>) {
    const original = FormData;
    class EditedFormData {
      get(name: string) {
        return name === "taxCode" ? "required_validated" : name === "pec" ? "unmanaged" : null;
      }
    }
    vi.stubGlobal("FormData", EditedFormData as unknown as typeof original);
    await dispatch(
      view.container.querySelector("s-choice-list")!,
      new Event("change", { bubbles: true }),
    );
    vi.stubGlobal("FormData", original);
  }

  test("dopo un conflitto delle etichette rilegge Shopify e conserva la bozza", async () => {
    router.loaderData = { ...baseData, labelScopesGranted: null };
    router.fetcher.data = {
      ok: true,
      loaded: {
        scopeGranted: true,
        snapshot: snapshot("labels-r1"),
        state: baseData.labelState,
        guidedConfirmations: [],
        errorCode: null,
      },
    };
    const view = await mount(<CheckoutRules />);
    expect(router.fetcher.submit).toHaveBeenCalledOnce();
    await editRules(view);
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    expect(router.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ taxCode: "required_validated", labelsRevision: "labels-r1" }),
      { method: "post" },
    );

    router.actionData = { ok: false, errorCode: "checkout_labels_conflict" };
    await view.rerender(<CheckoutRules />);
    expect(router.fetcher.submit).toHaveBeenCalledTimes(2);
    expect(router.fetcher.submit).toHaveBeenLastCalledWith(
      { intent: "load_checkout_labels", taxCode: "optional_validated", pec: "required_validated" },
      { method: "post" },
    );
    expect(view.container.textContent).toContain(texts("it").rules.labelsConflict);
    expect(view.container.textContent).not.toContain(texts("it").errors.checkout_labels_conflict);

    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    expect(router.submit).toHaveBeenCalledTimes(2);
    expect(router.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ taxCode: "required_validated", pec: "unmanaged" }),
      { method: "post" },
    );
  });

  test("durante la rilettura delle etichette i pannelli restano aperti", async () => {
    router.loaderData = { ...baseData, labelScopesGranted: null };
    router.fetcher.data = {
      ok: true,
      loaded: {
        scopeGranted: true,
        snapshot: snapshot("labels-r1"),
        state: baseData.labelState,
        guidedConfirmations: [],
        errorCode: null,
      },
    };
    const view = await mount(<CheckoutRules />);
    const panel = view.container.querySelector("details.checkout-labels-disclosure");
    expect(panel).not.toBeNull();
    router.fetcher.state = "submitting";
    router.loaderData = { ...router.loaderData! };
    await view.rerender(<CheckoutRules />);
    expect(view.container.textContent).not.toContain(texts("it").rules.labels.loading);
    expect(view.container.querySelector("details.checkout-labels-disclosure")).toBe(panel);
  });

  test("conferma il salvataggio del campo Interno con un toast", async () => {
    router.loaderData = { ...baseData, labelSnapshot: snapshot("labels-r1") };
    const view = await mount(<CheckoutRules />);
    const addressMode = [...view.container.querySelectorAll("s-select")].find(
      (select) => select.getAttribute("label") === texts("it").rules.labels.addressModeLabel,
    ) as HTMLElement & { value: string };
    addressMode.value = "optional";
    await dispatch(addressMode, new Event("change", { bubbles: true }));
    router.fetcher.data = { ok: true };
    await view.rerender(<CheckoutRules />);
    expect(shopify.toast.show).toHaveBeenCalledWith(texts("it").rules.labels.addressModeSaved);
  });

  test("indica la lingua da verificare e la seleziona da sola", async () => {
    router.loaderData = {
      ...baseData,
      labelSnapshot: snapshot("labels-r1", [pecSlot("it", "PEC"), pecSlot("en", "PEC")]),
      guidedConfirmations: [
        {
          slotId: checkoutLabelSlotId(pecSlot("it", "PEC") as never),
          confirmedAt: "2026-09-08T12:00:00Z",
        },
      ],
    };
    const view = await mount(<CheckoutRules />);
    expect(view.container.textContent).toContain(
      texts("it").rules.labels.nativeSummaryNeedsReview(1, ["inglese"]),
    );
    expect(texts("it").rules.labels.nativeSummaryNeedsReview(1, ["inglese"])).toBe(
      "Un checkout in inglese richiede una verifica.",
    );
    const language = [...view.container.querySelectorAll("s-select")].find(
      (select) => select.getAttribute("label") === texts("it").rules.labels.language,
    );
    expect(language?.getAttribute("value")).toBe("en");
  });

  test("il banner delle etichette porta a Testi del checkout", async () => {
    router.loaderData = { ...baseData, labelSnapshot: snapshot("labels-r1") };
    router.actionData = { ok: true, labelsErrorCode: "checkout_labels_confirmation_pending" };
    const view = await mount(<CheckoutRules />);
    const show = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").rules.showLabels,
    );
    const native = view.container.querySelector<HTMLDetailsElement>("#checkout-native-labels");
    expect(native?.open).toBe(false);
    // Il focus non deve interrompere lo scorrimento verso la sezione (che finiva a metà schermo).
    const focus = vi.spyOn(native!.querySelector("summary")!, "focus");
    await click(show!);
    expect(native?.open).toBe(true);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  test("le lingue da verificare seguono un ordine fisso, non quello dello store", async () => {
    router.loaderData = {
      ...baseData,
      // Su Numisleo l'inglese viene prima nelle lingue dello store.
      labelSnapshot: {
        ...snapshot("labels-r1", [pecSlot("en", "PEC"), pecSlot("it", "PEC")]),
        locales: [
          { locale: "en", family: "en", name: "English", primary: false, published: true },
          { locale: "it", family: "it", name: "Italiano", primary: true, published: true },
        ],
      },
      guidedConfirmations: [],
    };
    const view = await mount(<CheckoutRules />);
    expect(view.container.textContent).toContain(
      texts("it").rules.labels.nativeSummaryNeedsReview(2, ["italiano", "inglese"]),
    );
  });

  test("durante il salvataggio Salva mostra il caricamento", async () => {
    router.loaderData = { ...baseData, labelSnapshot: snapshot("labels-r1") };
    router.navigation = { state: "submitting" };
    const view = await mount(<CheckoutRules />);
    expect(
      view.container
        .querySelector('ui-save-bar button[variant="primary"]')!
        .hasAttribute("loading"),
    ).toBe(true);
  });

  test("avvisa delle conseguenze quando si toglie la gestione automatica", async () => {
    router.loaderData = { ...baseData, labelSnapshot: snapshot("labels-r1") };
    const view = await mount(<CheckoutRules />);
    const checkbox = view.container.querySelector(
      ".rules-layout__labels s-checkbox",
    ) as HTMLElement & {
      checked: boolean;
    };
    expect(checkbox.getAttribute("details")).toBeNull();
    checkbox.checked = false;
    await dispatch(checkbox, new Event("change", { bubbles: true }));
    // R-13: l'avviso è l'aiuto della casella, non un banner annidato nel pannello.
    expect(checkbox.getAttribute("details")).toBe(texts("it").rules.labels.disableWarning);
    expect(
      view.container.querySelectorAll('.rules-layout__labels s-banner[tone="warning"]'),
    ).toHaveLength(0);
  });
});
