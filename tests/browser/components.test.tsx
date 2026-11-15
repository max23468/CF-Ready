import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../app/config";
import { RevealBanner } from "../../app/ui/ui-feedback";
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

// Il reporter legge la rotta da `location` quando arriva il report.
async function atPath(pathname: string, run: () => void) {
  const original = window.location.href;
  window.history.replaceState(window.history.state, "", pathname);
  try {
    run();
  } finally {
    window.history.replaceState(window.history.state, "", original);
  }
}

afterEach(async () => {
  for (const view of mounted.splice(0)) await view.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("componenti merchant nel browser", () => {
  test("tutti i formatter bilingui interpolano i valori ricevuti", () => {
    const formatterArguments: Record<string, (string | number)[]> = {
      "messages.counter": [42],
      "messages.resetConfirm": ["Italiano"],
      "setup.progress": [2, 4],
      "onboarding.stepOf": [3, 4],
      "plan.trial": ["10 settembre"],
      "plan.subscription": ["10 settembre"],
      "plan.firstCharge": ["10 settembre"],
      "plan.nextCharge": ["10 settembre"],
      "plan.periodEnds": ["10 settembre"],
      "rules.labels.marketException": ["Italy"],
      "rules.labels.lastManualVerification": ["ora"],
    };
    for (const messages of [it, en]) {
      for (const [path, args] of Object.entries(formatterArguments)) {
        const formatter = path
          .split(".")
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], messages);
        expect(typeof formatter).toBe("function");
        const copy = (formatter as (...values: unknown[]) => string)(...args);
        for (const value of args) expect(copy, path).toContain(String(value));
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
        heading="Anteprima"
        fieldLabel="Tax code"
        fieldLabelHeading="Etichetta"
        message="Messaggio"
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
    expect(view.container.querySelector("s-box")?.textContent).toContain("Etichetta");
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

  test("il campo d'esempio resta largo come un campo del checkout anche in una card ampia", async () => {
    const view = await render(
      <div style={{ inlineSize: "900px" }}>
        <CustomerMessagesPreview
          activeLocale="it"
          heading="Esempio del messaggio"
          fieldLabel="Codice fiscale"
          message="Inserisci il Codice Fiscale per completare l'ordine."
          selectedLabel="Codice Fiscale obbligatorio"
        />
      </div>,
    );
    mounted.push(view);
    const preview = view.container.querySelector<HTMLElement>(".customer-messages-preview__error")!;
    expect(preview.getBoundingClientRect().width).toBeLessThanOrEqual(360);
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
    const field = view.container.querySelector("s-text-area")!;
    expect(field.value).toBe("Testo iniziale");
    await dispatch(field, new FocusEvent("focusin", { bubbles: true }));
    expect(onFocus).toHaveBeenCalledOnce();
  });

  test("il simulatore attraversa paesi, scenari, invio e pulizia", async () => {
    const view = await render(
      <CheckoutSimulator
        locale="it"
        rules={{ taxCode: "required_validated", pec: "required_validated" }}
        messages={DEFAULT_CONFIG.messages}
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
    selects[3].value = "CHECKOUT_COMPLETION";
    await dispatch(selects[3], new Event("change", { bubbles: true }));
    for (const checkbox of view.container.querySelectorAll("s-checkbox")) {
      checkbox.checked = true;
      await dispatch(checkbox, new Event("change", { bubbles: true }));
    }
    selects[4].value = "invalidTaxCode";
    await dispatch(selects[4], new Event("change", { bubbles: true }));
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain("blocca");

    fields[0].value = "RSSMRA85T10A562S";
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
      [...view.container.querySelectorAll("s-text-field")].map((field) => field.value ?? ""),
    ).toEqual(["", ""]);
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe(
      it.rules.simulator.outcomes.notApplied,
    );
  });

  test("il simulatore parte senza errori e mostra i required inline dopo Continua", async () => {
    const view = await render(
      <CheckoutSimulator
        locale="it"
        rules={{ taxCode: "required_validated", pec: "required_validated" }}
        messages={DEFAULT_CONFIG.messages}
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

  test("il simulatore mostra il formato errato solo dopo l'interazione", async () => {
    const view = await render(
      <CheckoutSimulator
        locale="it"
        rules={{ taxCode: "required_validated", pec: "optional_validated" }}
        messages={DEFAULT_CONFIG.messages}
      />,
    );
    mounted.push(view);
    const [taxCode, pec] = [...view.container.querySelectorAll("s-text-field")];
    const type = async (field: typeof taxCode, value: string) => {
      field.value = value;
      await dispatch(field, new Event("input", { bubbles: true }));
    };
    const status = view.container.querySelector('[role="status"]');

    // Durante la prima digitazione un valore incompleto non è un errore.
    await type(taxCode, "RSS");
    expect(taxCode.getAttribute("error")).toBeNull();
    await dispatch(taxCode, new FocusEvent("focusout", { bubbles: true }));
    expect(taxCode.getAttribute("error")).not.toBeNull();
    // Dopo l'uscita dal campo l'errore si toglie appena il valore diventa valido.
    await type(taxCode, "RSSMRA85T10A562S");
    expect(taxCode.getAttribute("error")).toBeNull();
    await type(taxCode, "RSS");
    expect(taxCode.getAttribute("error")).not.toBeNull();

    // La regione live resta lo stesso nodo mentre l'esito cambia.
    expect(view.container.querySelector('[role="status"]')).toBe(status);

    await type(pec, "cliente");
    expect(pec.getAttribute("error")).toBeNull();
    await dispatch(
      view.container.querySelector("button.checkout-simulator__button--primary")!,
      new MouseEvent("click", { bubbles: true }),
    );
    expect(pec.getAttribute("error")).not.toBeNull();

    // «Svuota» riparte da campi non toccati; uno scenario mostra subito il suo errore.
    await dispatch(
      [...view.container.querySelectorAll("s-button")].find(
        (button) => button.textContent === it.rules.simulator.clear,
      )!,
      new MouseEvent("click", { bubbles: true }),
    );
    await type(pec, "cliente");
    expect(pec.getAttribute("error")).toBeNull();
    const scenario = view.container.querySelector(
      `s-select[label="${it.rules.simulator.scenarioLabel}"]`,
    ) as HTMLElement & { value: string };
    scenario.value = "invalidTaxCode";
    await dispatch(scenario, new Event("change", { bubbles: true }));
    expect(taxCode.getAttribute("error")).not.toBeNull();
  });

  test("il simulatore gestisce singoli campi e configurazione non gestita", async () => {
    const unmanaged = await render(
      <CheckoutSimulator
        locale="en"
        rules={{ taxCode: "unmanaged", pec: "unmanaged" }}
        messages={DEFAULT_CONFIG.messages}
      />,
    );
    mounted.push(unmanaged);
    expect(unmanaged.container.querySelectorAll("s-text-field")).toHaveLength(0);
    expect(unmanaged.container.textContent).toContain(en.checkout.nothing);

    const pecOnly = await render(
      <CheckoutSimulator
        locale="it"
        rules={{ taxCode: "unmanaged", pec: "optional_validated" }}
        messages={DEFAULT_CONFIG.messages}
      />,
    );
    mounted.push(pecOnly);
    const selects = [...pecOnly.container.querySelectorAll("s-select")];
    const field = pecOnly.container.querySelector("s-text-field")!;
    expect(field).not.toBeNull();
    selects[1].value = "DE";
    await dispatch(selects[1], new Event("change", { bubbles: true }));
    field.value = "cliente@example.com";
    await dispatch(field, new Event("input", { bubbles: true }));
    expect(pecOnly.container.querySelector('[role="status"]')?.textContent).toBe(
      it.rules.simulator.outcomes.notApplied,
    );
  });

  test("il simulatore rende la PEC required quando Azienda è compilata", async () => {
    const view = await render(
      <CheckoutSimulator
        locale="it"
        rules={{ taxCode: "unmanaged", pec: "required_when_company" }}
        messages={DEFAULT_CONFIG.messages}
      />,
    );
    mounted.push(view);
    const fields = [...view.container.querySelectorAll("s-text-field")];
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
      const company = view.container.querySelector("s-text-field")!;
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
    const fields = [...view.container.querySelectorAll("s-text-field")];
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

  test("il banner entra quando lo scorrimento che lo porta in vista è concluso", async () => {
    let finishScroll!: () => void;
    const scrolled = new Promise<void>((resolve) => {
      finishScroll = resolve;
    });
    // Chrome 150+ restituisce una promessa da scrollIntoView; altrove `undefined`.
    const scroll = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockReturnValueOnce(scrolled as unknown as void)
      .mockReturnValueOnce(undefined);
    const banner = () => document.querySelectorAll(".cf-reveal-banner");

    const view = await render(<RevealBanner tone="critical">Errore</RevealBanner>);
    mounted.push(view);
    expect(scroll).toHaveBeenCalledOnce();
    expect(banner()[0].classList.contains("cf-motion-reveal")).toBe(false);
    await act(async () => finishScroll());
    expect(banner()[0].classList.contains("cf-motion-reveal")).toBe(true);

    const immediate = await render(<RevealBanner tone="warning">Avviso</RevealBanner>);
    mounted.push(immediate);
    await act(async () => undefined);
    expect(banner()[1].classList.contains("cf-motion-reveal")).toBe(true);
  });

  test("lo script inline si registra subito e invia via beacon soltanto campi tecnici", async () => {
    const onReport = vi.fn<typeof shopify.webVitals.onReport>(async () => undefined);
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
    vi.stubGlobal("fetchLater", undefined);

    new Function(performanceReporterScript({ route: "home", token: "firma" }))();
    expect(onReport).toHaveBeenCalledOnce();
    const callback = onReport.mock.calls[0][0]!;
    // `target` non fa parte del contratto: lo script deve scartarlo.
    const metric = { id: "v4-1", name: "LCP", value: 1200, country: "IT", target: "riservato" };
    await atPath("/app/", () => callback({ metrics: [metric] }));

    expect(beacon).toHaveBeenCalledOnce();
    const [endpoint, blob] = beacon.mock.calls[0];
    expect(endpoint).toBe("/performance");
    expect((blob as Blob).type).toBe("application/json");
    expect(JSON.parse(await (blob as Blob).text())).toEqual({
      route: "home",
      token: "firma",
      serverTimings: { shopify_snapshot: 470 },
      layoutShiftSource: null,
      metrics: [{ id: "v4-1", name: "LCP", value: 1200, country: "IT" }],
    });
  });

  // D-199: Chromium espone `layout-shift`; l'area arriva dal `data-layout-region` più vicino.
  test.skipIf(!PerformanceObserver.supportedEntryTypes?.includes("layout-shift"))(
    "lo script attribuisce lo spostamento più ampio all'area della pagina",
    async () => {
      const onReport = vi.fn<typeof shopify.webVitals.onReport>(async () => undefined);
      const beacon = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
      vi.stubGlobal("shopify", { webVitals: { onReport } });
      vi.stubGlobal("fetchLater", undefined);
      const host = document.createElement("div");
      host.innerHTML =
        '<div></div><div data-layout-region="plans"><p style="margin:0;height:70vh">Piani</p></div>';
      document.body.insertBefore(host, document.body.firstChild);
      // `layout-shift` confronta due frame: la posizione iniziale deve essere già stata dipinta.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      new Function(performanceReporterScript({ route: "home", token: "firma" }))();
      // Registrato dopo quello dello script, riceve la voce per secondo.
      const shifted = new Promise<void>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const sources = list
            .getEntries()
            .flatMap((entry) => (entry as unknown as { sources: { node: Node | null }[] }).sources);
          if (!sources.some((source) => source.node && host.contains(source.node))) return;
          observer.disconnect();
          resolve();
        });
        observer.observe({ type: "layout-shift" });
      });
      (host.firstElementChild as HTMLElement).style.height = "25vh";
      await shifted;
      const callback = onReport.mock.calls[0][0]!;
      callback({ metrics: [{ id: "v4-cls", name: "CLS", value: 0.3 }] });

      const [, blob] = beacon.mock.calls[0];
      expect(JSON.parse(await (blob as Blob).text()).layoutShiftSource).toBe("plans");
      host.remove();
    },
  );

  test("lo script ripiega su fetch keepalive e ignora un trasporto fallito", async () => {
    const onReport = vi.fn<typeof shopify.webVitals.onReport>(async () => undefined);
    vi.spyOn(navigator, "sendBeacon").mockReturnValue(false);
    const fetcher = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("shopify", { webVitals: { onReport } });
    vi.stubGlobal("fetchLater", undefined);

    new Function(performanceReporterScript({ route: "rules", token: "firma" }))();
    const callback = onReport.mock.calls[0][0]!;
    expect(() => callback({ metrics: [] })).not.toThrow();
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledWith(
      "/performance",
      expect.objectContaining({ method: "POST", keepalive: true, priority: "low" }),
    );
  });

  test("il campione INP porta i sottotempi dell'interazione peggiore e il file dello script", async () => {
    const onReport = vi.fn<typeof shopify.webVitals.onReport>(async () => undefined);
    const beacon = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const observers = new Map<string, (list: { getEntries(): unknown[] }) => void>();
    class FakeObserver {
      static supportedEntryTypes = ["event", "long-animation-frame"];
      constructor(private callback: (list: { getEntries(): unknown[] }) => void) {}
      observe(options: { type: string; durationThreshold?: number; buffered?: boolean }) {
        expect(options.buffered).toBe(true);
        if (options.type === "event") expect(options.durationThreshold).toBe(40);
        observers.set(options.type, this.callback);
      }
    }
    vi.stubGlobal("PerformanceObserver", FakeObserver);
    vi.stubGlobal("fetchLater", undefined);
    vi.stubGlobal("shopify", { webVitals: { onReport } });
    new Function(performanceReporterScript({ route: "rules", token: "firma" }))();
    const emit = (type: string, entries: unknown[]) =>
      observers.get(type)!({ getEntries: () => entries });

    // Il frame lungo arriva prima dell'interazione che contiene; quello successivo è estraneo.
    emit("long-animation-frame", [
      {
        startTime: 990,
        duration: 260,
        scripts: [
          { duration: 30, sourceURL: "https://cdn.shopify.com/shopifycloud/polaris.js" },
          { duration: 170, sourceURL: "https://app.cfready.it/assets/rules.js?shop=negozio#x" },
        ],
      },
      {
        startTime: 5000,
        duration: 90,
        scripts: [{ duration: 80, sourceURL: "https://x.test/a.js" }],
      },
    ]);
    emit("event", [
      { interactionId: 0, startTime: 10, duration: 400, processingStart: 20, processingEnd: 30 },
      {
        interactionId: 7,
        startTime: 980,
        duration: 248,
        processingStart: 1000.4,
        processingEnd: 1180,
      },
      {
        interactionId: 8,
        startTime: 4000,
        duration: 48,
        processingStart: 4002,
        processingEnd: 4010,
      },
    ]);

    await atPath("/app/rules", () =>
      onReport.mock.calls[0][0]!({
        metrics: [
          { id: "v4-inp", name: "INP", value: 248, country: "IT" },
          { id: "v4-lcp", name: "LCP", value: 900, country: "IT" },
        ],
      }),
    );
    const [, blob] = beacon.mock.calls[0];
    expect(JSON.parse(await (blob as Blob).text()).metrics).toEqual([
      {
        id: "v4-inp",
        name: "INP",
        value: 248,
        country: "IT",
        inputDelay: 20,
        processingDuration: 180,
        presentationDelay: 48,
        scriptSource: "https://app.cfready.it/assets/rules.js",
      },
      { id: "v4-lcp", name: "LCP", value: 900, country: "IT" },
    ]);
  });

  test("con fetchLater i report della stessa rotta partono insieme, con la rotta corrente", async () => {
    const onReport = vi.fn<typeof shopify.webVitals.onReport>(async () => undefined);
    const beacon = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { serverTiming: [{ name: "total", duration: 120 }] } as unknown as PerformanceEntry,
    ]);
    type Deferred = { body: unknown; signal: AbortSignal; activateAfter: number };
    const deferred: (Deferred & { result: { activated: boolean } })[] = [];
    const fetchLater = vi.fn((url: string, init: Deferred & { body: string }) => {
      expect(url).toBe("/performance");
      const result = { activated: false };
      deferred.push({ ...init, body: JSON.parse(init.body), result });
      return result;
    });
    vi.stubGlobal("fetchLater", fetchLater);
    vi.stubGlobal("shopify", { webVitals: { onReport } });
    new Function(performanceReporterScript({ route: "home", token: "firma" }))();
    const callback = onReport.mock.calls[0][0]!;
    const lcp = { id: "v4-lcp", name: "LCP", value: 900, country: "IT" };
    const fcp = { id: "v4-fcp", name: "FCP", value: 400, country: "IT" };
    const inp = { id: "v4-inp", name: "INP", value: 80, country: "IT" };

    await atPath("/app", () => {
      callback({ metrics: [lcp] });
      callback({ metrics: [fcp] });
    });
    // Il secondo report sostituisce il primo con un solo invio che li contiene entrambi.
    expect(deferred).toHaveLength(2);
    expect(deferred[0].signal.aborted).toBe(true);
    expect(deferred[1].signal.aborted).toBe(false);
    expect(deferred[1].activateAfter).toBeGreaterThan(0);
    expect(deferred[1].body).toEqual({
      route: "home",
      token: "firma",
      serverTimings: { total: 120 },
      layoutShiftSource: null,
      metrics: [lcp, fcp],
    });

    // Dopo una navigazione client il report porta la rotta corrente, senza le durate del
    // documento iniziale, e non annulla il lotto della rotta precedente.
    await atPath("/app/rules", () => callback({ metrics: [inp] }));
    expect(deferred[1].signal.aborted).toBe(false);
    expect(deferred[2].body).toMatchObject({ route: "rules", serverTimings: {}, metrics: [inp] });

    // Un lotto già partito non si ripete: il report successivo ne apre uno nuovo.
    deferred[2].result.activated = true;
    const cls = { id: "v4-cls", name: "CLS", value: 0.01, country: "IT" };
    await atPath("/app/rules", () => callback({ metrics: [cls] }));
    expect(deferred[3].body).toMatchObject({ route: "rules", metrics: [cls] });

    // Se fetchLater rifiuta la richiesta, il lotto parte subito con il beacon.
    fetchLater.mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const late = { id: "v4-cls-2", name: "CLS", value: 0.02, country: "IT" };
    await atPath("/app/rules", () => callback({ metrics: [late] }));
    expect(deferred[3].signal.aborted).toBe(true);
    const [, blob] = beacon.mock.calls[0];
    expect(JSON.parse(await (blob as Blob).text()).metrics).toEqual([cls, late]);
  });

  test("dentro una App Window lo script non sostituisce il callback della finestra principale", () => {
    const onReport = vi.fn<typeof shopify.webVitals.onReport>(async () => undefined);
    vi.stubGlobal("shopify", {});

    new Function(performanceReporterScript({ route: "onboarding", token: "firma" }))();
    vi.stubGlobal("shopify", { webVitals: { onReport } });
    document.dispatchEvent(new Event("DOMContentLoaded"));

    expect(onReport).not.toHaveBeenCalled();
  });
});
