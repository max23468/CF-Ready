import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../app/config";
import { en } from "../../app/i18n/en";
import { it } from "../../app/i18n/it";
import { performanceReporterScript } from "../../app/performance-report";
import { CustomerMessagesPreview } from "../../app/features/messages/CustomerMessagesPreview";
import { UncontrolledMessageTextArea } from "../../app/features/messages/UncontrolledMessageTextArea";
import { CheckoutSimulator } from "../../app/features/rules/CheckoutSimulator";
import { AutomaticLabelsConfirmModal } from "../../app/features/rules/AutomaticLabelsConfirmModal";
import type { CheckoutLabelSlot } from "../../app/checkout-labels/domain";
import { dispatch, render, type Rendered } from "./render";

const mounted: Rendered[] = [];

afterEach(async () => {
  for (const view of mounted.splice(0)) await view.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("componenti merchant nel browser", () => {
  test("tutti i formatter bilingui producono copy completo", () => {
    const formatterArguments: Record<string, unknown[]> = {
      "messages.counter": [42],
      "messages.resetConfirm": ["Italiano"],
      "setup.progress": [2, 4],
      "onboarding.stepOf": [3, 4],
      "plan.trial": ["10 settembre"],
      "plan.subscription": ["10 settembre"],
      "plan.trialEndsSoon": ["10 settembre"],
      "plan.trialLastDay": ["10 settembre"],
      "plan.firstCharge": ["10 settembre"],
      "plan.annualDescription": ["8,25 €"],
      "plan.nextCharge": ["10 settembre"],
      "plan.periodEnds": ["10 settembre"],
    };
    for (const messages of [it, en]) {
      for (const [path, args] of Object.entries(formatterArguments)) {
        const [section, key] = path.split(".");
        const formatter = (messages as Record<string, Record<string, unknown>>)[section][key];
        expect(typeof formatter).toBe("function");
        expect((formatter as (...values: unknown[]) => string)(...args).trim()).not.toBe("");
      }
    }
  });

  test("la conferma della gestione automatica cita le etichette tra virgolette (T7)", async () => {
    const slot = { name: "pec", family: "en" } as CheckoutLabelSlot;
    const view = await render(
      <AutomaticLabelsConfirmModal
        id="confirm"
        locale="it"
        writes={[{ slot, proposed: "PEC (optional)" }]}
        onConfirm={() => undefined}
      />,
    );
    expect(view.container.querySelector("s-list-item")?.textContent).toBe(
      "PEC · Inglese: «PEC (optional)»",
    );
    await view.unmount();
  });

  test("l'anteprima dichiara la lingua cliente senza simulare un alert reale", async () => {
    const view = await render(
      <CustomerMessagesPreview
        activeLocale="en"
        context="Contesto"
        heading="Anteprima"
        fieldLabel="Tax code"
        fieldLabelHeading="Etichetta"
        hint="Suggerimento"
        message="Messaggio"
        availability="Disponibilità"
        selectedLabel="Codice fiscale"
      />,
    );
    mounted.push(view);
    expect(
      view.container.querySelector('.customer-messages-preview__error[lang="en"]'),
    ).not.toBeNull();
    expect(view.container.querySelector('s-banner, [role="alert"]')).toBeNull();
    expect(view.container.querySelector("details")).toBeNull();
    expect(view.container.querySelector('s-icon[type="alert-circle"]')).toBeNull();
    expect(view.container.textContent?.match(/Anteprima/g)).toHaveLength(1);
    expect(view.container.querySelector("s-box")?.textContent).toContain("Suggerimento");
    expect(view.container.querySelector("s-badge")).toBeNull();
    // N-1: campo nativo in sola lettura, con l'etichetta del campo e il messaggio come errore.
    const field = view.container.querySelector<HTMLElement & { error: string; label: string }>(
      ".customer-messages-preview__error s-text-field",
    )!;
    expect(
      field.hasAttribute("readonly") || (field as unknown as { readOnly: boolean }).readOnly,
    ).toBe(true);
    expect(field.label ?? field.getAttribute("label")).toBe("Tax code");
    expect(field.error ?? field.getAttribute("error")).toBe("Messaggio");
  });

  test("la textarea resta non controllata e inoltra il focus", async () => {
    const onFocus = vi.fn();
    const view = await render(
      <UncontrolledMessageTextArea
        initialValue="Testo iniziale"
        label="Messaggio"
        name="it.taxCodeRequired"
        rows={3}
        details="12 / 200"
        error="Errore"
        onFocus={onFocus}
      />,
    );
    mounted.push(view);
    const field = view.container.querySelector("s-text-area") as HTMLElement & { value?: string };
    expect(field.value).toBe("Testo iniziale");
    await dispatch(field, new FocusEvent("focusin", { bubbles: true }));
    expect(onFocus).toHaveBeenCalledOnce();
  });

  test("il simulatore attraversa paesi, scenari, invio e pulizia", async () => {
    const view = await render(
      <CheckoutSimulator
        locale="it"
        rules={{ taxCode: "required_validated", pec: "required_validated" }}
        messages={DEFAULT_CONFIG.messages.it}
      />,
    );
    mounted.push(view);
    let selects = [...view.container.querySelectorAll("s-select")];
    const fields = [...view.container.querySelectorAll("s-text-field")];
    expect(selects).toHaveLength(5);
    expect(fields).toHaveLength(2);
    const language = view.container.querySelector('s-select[label="Lingua dell’anteprima"]')!;
    let delivery = view.container.querySelector('s-select[label="Paese di consegna"]')!;

    (language as HTMLElement & { value: string }).value = "en";
    await dispatch(language, new Event("change", { bubbles: true }));
    expect(view.container.textContent).toContain(en.rules.simulator.heading);
    (language as HTMLElement & { value: string }).value = "it";
    await dispatch(language, new Event("change", { bubbles: true }));

    selects = [...view.container.querySelectorAll("s-select")];
    delivery = view.container.querySelector('s-select[label="Paese di consegna"]')!;
    (delivery as HTMLElement & { value: string }).value = "unknown";
    await dispatch(delivery, new Event("change", { bubbles: true }));
    (delivery as HTMLElement & { value: string }).value = "FR";
    await dispatch(delivery, new Event("change", { bubbles: true }));
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain(
      "Regole non applicate",
    );

    (delivery as HTMLElement & { value: string }).value = "IT";
    await dispatch(delivery, new Event("change", { bubbles: true }));
    (selects[3] as HTMLElement & { value: string }).value = "CHECKOUT_COMPLETION";
    await dispatch(selects[3], new Event("change", { bubbles: true }));
    for (const checkbox of view.container.querySelectorAll("s-checkbox")) {
      (checkbox as HTMLElement & { checked: boolean }).checked = true;
      await dispatch(checkbox, new Event("change", { bubbles: true }));
    }
    (selects[4] as HTMLElement & { value: string }).value = "invalidTaxCode";
    await dispatch(selects[4], new Event("change", { bubbles: true }));
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain("blocca");

    (fields[0] as HTMLElement & { value: string }).value = "RSSMRA85T10A562S";
    await dispatch(fields[0], new Event("input", { bubbles: true }));
    const buttons = [...view.container.querySelectorAll("button")];
    await dispatch(buttons.at(-1)!, new MouseEvent("click", { bubbles: true }));
    (delivery as HTMLElement & { value: string }).value = "DE";
    await dispatch(delivery, new Event("change", { bubbles: true }));
    await dispatch(
      [...view.container.querySelectorAll("s-button")].find(
        (button) => button.textContent === it.rules.simulator.clear,
      )!,
      new MouseEvent("click", { bubbles: true }),
    );
    expect((delivery as HTMLElement & { value: string }).value).toBe("DE");
    expect(
      [...view.container.querySelectorAll("s-text-field")].map(
        (field) => (field as HTMLElement & { value?: string }).value ?? "",
      ),
    ).toEqual(["", ""]);
    expect(view.container.querySelector('[role="status"]')?.textContent).toBeTruthy();
  });

  test("il simulatore parte senza errori e mostra i required inline dopo Continua", async () => {
    const view = await render(
      <CheckoutSimulator
        locale="it"
        rules={{ taxCode: "required_validated", pec: "required_validated" }}
        messages={DEFAULT_CONFIG.messages.it}
      />,
    );
    mounted.push(view);
    const selects = [...view.container.querySelectorAll("s-select")];
    expect(selects).toHaveLength(5);
    expect(view.container.querySelectorAll("s-checkbox")).toHaveLength(4);
    const fields = [...view.container.querySelectorAll("s-text-field")];
    expect(fields.every((field) => field.getAttribute("error") === null)).toBe(true);
    await dispatch(
      view.container.querySelector("button.checkout-simulator__button--primary")!,
      new MouseEvent("click", { bubbles: true }),
    );
    expect(fields[0].getAttribute("error")).toBe(DEFAULT_CONFIG.messages.it.taxCodeRequired);
    expect(fields[1].getAttribute("error")).toBe(DEFAULT_CONFIG.messages.it.pecRequired);
  });

  test("il simulatore gestisce singoli campi e configurazione non gestita", async () => {
    const unmanaged = await render(
      <CheckoutSimulator
        locale="en"
        rules={{ taxCode: "unmanaged", pec: "unmanaged" }}
        messages={DEFAULT_CONFIG.messages.en}
      />,
    );
    mounted.push(unmanaged);
    expect(unmanaged.container.querySelectorAll("s-text-field")).toHaveLength(0);
    expect(unmanaged.container.textContent).toContain(en.checkout.nothing);

    const pecOnly = await render(
      <CheckoutSimulator
        locale="it"
        rules={{ taxCode: "unmanaged", pec: "optional_validated" }}
        messages={DEFAULT_CONFIG.messages.it}
      />,
    );
    mounted.push(pecOnly);
    const selects = [...pecOnly.container.querySelectorAll("s-select")];
    const field = pecOnly.container.querySelector("s-text-field") as HTMLElement & {
      value: string;
    };
    expect(field).not.toBeNull();
    (selects[1] as HTMLElement & { value: string }).value = "DE";
    await dispatch(selects[1], new Event("change", { bubbles: true }));
    field.value = "cliente@example.com";
    await dispatch(field, new Event("input", { bubbles: true }));
    expect(pecOnly.container.querySelector('[role="status"]')?.textContent).toBeTruthy();
  });

  test("il simulatore rende la PEC required quando Azienda è compilata", async () => {
    const view = await render(
      <CheckoutSimulator
        locale="it"
        rules={{ taxCode: "unmanaged", pec: "required_when_company" }}
        messages={DEFAULT_CONFIG.messages.it}
      />,
    );
    mounted.push(view);
    const fields = [...view.container.querySelectorAll("s-text-field")] as Array<
      HTMLElement & { value: string }
    >;
    expect(fields).toHaveLength(2);
    expect(fields[0].getAttribute("label")).toBe(it.rules.simulator.company);
    expect(fields[1].hasAttribute("required")).toBe(false);

    fields[0].value = "Acme S.r.l.";
    await dispatch(fields[0], new Event("input", { bubbles: true }));
    expect(fields[1].hasAttribute("required")).toBe(true);
    await dispatch(
      view.container.querySelector("button.checkout-simulator__button--primary")!,
      new MouseEvent("click", { bubbles: true }),
    );
    expect(fields[1].getAttribute("error")).toBe(DEFAULT_CONFIG.messages.it.pecRequired);
  });

  test("il simulatore spiega i campi obbligatori nascosti solo al completamento italiano", async () => {
    for (const locale of ["it", "en"] as const) {
      const copy = (locale === "it" ? it : en).rules.simulator;
      const view = await render(
        <CheckoutSimulator
          locale={locale}
          rules={{ taxCode: "required_validated", pec: "required_when_company" }}
          messages={DEFAULT_CONFIG.messages}
        />,
      );
      mounted.push(view);
      expect(view.container.textContent).not.toContain(copy.noFieldsShown);
      const change = async (selector: string, value: string | boolean) => {
        const field = view.container.querySelector(selector) as HTMLElement & {
          value: string;
          checked: boolean;
        };
        if (typeof value === "boolean") field.checked = value;
        else field.value = value;
        await dispatch(field, new Event("change", { bubbles: true }));
      };
      await change(`s-checkbox[label="${copy.taxCodePresent}"]`, false);
      expect(view.container.textContent).not.toContain(copy.noFieldsShown);
      await change(`s-checkbox[label="${copy.pecPresent}"]`, false);
      expect(view.container.textContent).toContain(copy.noFieldsShown);
      const company = view.container.querySelector("s-text-field") as HTMLElement & {
        value: string;
      };
      company.value = "Acme";
      await dispatch(company, new Event("input", { bubbles: true }));
      expect(view.container.querySelector(".checkout-simulator__missing-fields")).toBeNull();
      await change(`s-select[label="${copy.checkoutStep}"]`, "CHECKOUT_COMPLETION");
      const errors = view.container.querySelector(".checkout-simulator__missing-fields")!;
      expect(errors).not.toBeNull();
      expect(view.container.textContent).not.toContain(copy.noFieldsShown);
      expect(errors.textContent?.toLowerCase()).toContain(
        locale === "it" ? "codice fiscale" : "italian tax code",
      );
      expect(errors.textContent).toContain("PEC");
      expect(errors.textContent).toContain(copy.advanced);
      await change(`s-select[label="${copy.billingCountry}"]`, "FR");
      expect(view.container.querySelector(".checkout-simulator__missing-fields")).toBeNull();
      expect(view.container.textContent).toContain(copy.noFieldsShown);
      await change(`s-select[label="${copy.billingCountry}"]`, "IT");
      await change(`s-select[label="${copy.deliveryCountry}"]`, "unknown");
      expect(view.container.querySelector(".checkout-simulator__missing-fields")).toBeNull();
      await view.unmount();
      mounted.pop();
    }
  });

  test("il simulatore toglie l'obbligatorietà ai campi nei casi esclusi", async () => {
    const view = await render(
      <CheckoutSimulator
        locale="it"
        rules={{ taxCode: "required_validated", pec: "required_when_company" }}
        messages={DEFAULT_CONFIG.messages}
      />,
    );
    mounted.push(view);
    const fields = [...view.container.querySelectorAll("s-text-field")] as Array<
      HTMLElement & { value: string }
    >;
    fields[0].value = "Acme";
    await dispatch(fields[0], new Event("input", { bubbles: true }));
    expect(fields.slice(1).every((field) => field.hasAttribute("required"))).toBe(true);
    const billing = view.container.querySelector(
      's-select[label="Paese di fatturazione"]',
    ) as HTMLElement & { value: string };
    billing.value = "FR";
    await dispatch(billing, new Event("change", { bubbles: true }));
    expect(fields.slice(1).every((field) => !field.hasAttribute("required"))).toBe(true);
    billing.value = "IT";
    await dispatch(billing, new Event("change", { bubbles: true }));
    expect(fields.slice(1).every((field) => field.hasAttribute("required"))).toBe(true);
  });

  test("lo script inline si registra subito e invia via beacon soltanto campi tecnici", async () => {
    const onReport = vi.fn(async () => undefined);
    const beacon = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      {
        serverTiming: [
          { name: "shopify_snapshot", duration: 450 },
          { name: "shopify_snapshot", duration: 20.04 },
          { name: "auth", duration: -1 },
        ],
      } as unknown as PerformanceEntry,
    ]);
    vi.stubGlobal("shopify", { webVitals: { onReport } });

    new Function(performanceReporterScript({ route: "home", token: "firma" }))();
    expect(onReport).toHaveBeenCalledOnce();
    const callback = onReport.mock.calls[0][0] as (report: ShopifyWebVitalsReport) => void;
    callback({
      metrics: [
        { id: "v4-1", name: "LCP", value: 1200, country: "IT", target: "riservato" },
      ] as ShopifyWebVitalsMetric[],
    });

    expect(beacon).toHaveBeenCalledOnce();
    const [endpoint, blob] = beacon.mock.calls[0];
    expect(endpoint).toBe("/performance");
    expect((blob as Blob).type).toBe("application/json");
    expect(JSON.parse(await (blob as Blob).text())).toEqual({
      route: "home",
      token: "firma",
      serverTimings: { shopify_snapshot: 470 },
      metrics: [{ id: "v4-1", name: "LCP", value: 1200, country: "IT" }],
    });
  });

  test("lo script ripiega su fetch keepalive e ignora un trasporto fallito", async () => {
    const onReport = vi.fn(async () => undefined);
    vi.spyOn(navigator, "sendBeacon").mockReturnValue(false);
    const fetcher = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("shopify", { webVitals: { onReport } });

    new Function(performanceReporterScript({ route: "rules", token: "firma" }))();
    const callback = onReport.mock.calls[0][0] as (report: ShopifyWebVitalsReport) => void;
    expect(() => callback({ metrics: [] })).not.toThrow();
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledWith(
      "/performance",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
  });

  test("dentro una App Window lo script non sostituisce il callback della finestra principale", () => {
    const onReport = vi.fn(async () => undefined);
    vi.stubGlobal("shopify", {});

    new Function(performanceReporterScript({ route: "onboarding", token: "firma" }))();
    vi.stubGlobal("shopify", { webVitals: { onReport } });
    document.dispatchEvent(new Event("DOMContentLoaded"));

    expect(onReport).not.toHaveBeenCalled();
  });
});
