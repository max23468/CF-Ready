import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../app/config";
import { en } from "../../app/i18n/en";
import { it } from "../../app/i18n/it";
import { PerformanceReporter } from "../../app/PerformanceReporter";
import { CustomerMessagesPreview } from "../../app/features/messages/CustomerMessagesPreview";
import { UncontrolledMessageTextArea } from "../../app/features/messages/UncontrolledMessageTextArea";
import { CheckoutSimulator } from "../../app/features/rules/CheckoutSimulator";
import { dispatch, render, type Rendered } from "./render";

const mounted: Rendered[] = [];

afterEach(async () => {
  for (const view of mounted.splice(0)) await view.unmount();
  vi.unstubAllGlobals();
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
      "plan.nextCharge": ["10 settembre"],
      "plan.periodEnds": ["10 settembre"],
      "plan.netCost": ["10,00 €"],
      "plan.creditEstimate": ["5,00 €"],
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

  test("l'anteprima cambia lingua attraverso il Web Component Polaris", async () => {
    const onLocaleChange = vi.fn();
    const view = await render(
      <CustomerMessagesPreview
        activeLocale="it"
        context="Contesto"
        errorHeading="Errore"
        heading="Anteprima"
        languageLabel="Lingua"
        languages={{ it: "Italiano", en: "English" }}
        message="Messaggio"
        onLocaleChange={onLocaleChange}
        selectedHeading="Selezionato"
        selectedLabel="Codice fiscale"
      />,
    );
    mounted.push(view);
    const select = view.container.querySelector("s-select");
    if (!select) throw new Error("selettore lingua assente");
    (select as HTMLElement & { value: string }).value = "en";
    await dispatch(select, new Event("change", { bubbles: true }));
    expect(onLocaleChange).toHaveBeenCalledWith("en");
    expect(view.container.textContent).toContain("Messaggio");
  });

  test("la textarea resta non controllata e inoltra focus e blur", async () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const view = await render(
      <UncontrolledMessageTextArea
        initialValue="Testo iniziale"
        label="Messaggio"
        name="it.taxCodeRequired"
        rows={3}
        details="12 / 200"
        error="Errore"
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );
    mounted.push(view);
    const field = view.container.querySelector("s-text-area") as HTMLElement & { value?: string };
    expect(field.value).toBe("Testo iniziale");
    await dispatch(field, new FocusEvent("focusin", { bubbles: true }));
    await dispatch(field, new FocusEvent("focusout", { bubbles: true }));
    expect(onFocus).toHaveBeenCalledOnce();
    expect(onBlur).toHaveBeenCalledOnce();
  });

  test("il simulatore attraversa paesi, scenari, invio e pulizia", async () => {
    const view = await render(
      <CheckoutSimulator
        locale="it"
        rules={{ taxCode: "required_validated", pec: "required_validated" }}
        errorDisplay="inline"
        messages={DEFAULT_CONFIG.messages.it}
      />,
    );
    mounted.push(view);
    const selects = [...view.container.querySelectorAll("s-select")];
    const fields = [...view.container.querySelectorAll("s-text-field")];
    expect(selects).toHaveLength(3);
    expect(fields).toHaveLength(2);

    (selects[0] as HTMLElement & { value: string }).value = "FR";
    await dispatch(selects[0], new Event("change", { bubbles: true }));
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain(
      "Regole non applicate",
    );

    (selects[0] as HTMLElement & { value: string }).value = "IT";
    await dispatch(selects[0], new Event("change", { bubbles: true }));
    (selects[2] as HTMLElement & { value: string }).value = "invalidTaxCode";
    await dispatch(selects[2], new Event("change", { bubbles: true }));
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain("blocca");

    (fields[0] as HTMLElement & { value: string }).value = "RSSMRA85T10A562S";
    await dispatch(fields[0], new Event("input", { bubbles: true }));
    const buttons = [...view.container.querySelectorAll("button")];
    await dispatch(buttons.at(-1)!, new MouseEvent("click", { bubbles: true }));
    await dispatch(buttons[0], new MouseEvent("click", { bubbles: true }));
    expect(view.container.querySelector('[role="status"]')?.textContent).toBeTruthy();
  });

  test("il simulatore gestisce singoli campi e configurazione non gestita", async () => {
    const unmanaged = await render(
      <CheckoutSimulator
        locale="en"
        rules={{ taxCode: "unmanaged", pec: "unmanaged" }}
        errorDisplay="inline"
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
        errorDisplay="preventive"
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

  test("il reporter registra e rimuove il callback Web Vitals", async () => {
    const onReport = vi.fn(async () => undefined);
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("shopify", { webVitals: { onReport } });
    const view = await render(<PerformanceReporter />);
    mounted.push(view);
    expect(onReport).toHaveBeenCalledOnce();
    const callback = onReport.mock.calls[0][0];
    await callback({ metrics: [{ id: "v4-1", name: "LCP", value: 1200 }] });
    expect(fetcher).toHaveBeenCalledWith(
      "/app/performance",
      expect.objectContaining({ method: "POST" }),
    );
    await view.unmount();
    mounted.pop();
    expect(onReport).toHaveBeenLastCalledWith(null);
  });

  test("il reporter non fa nulla quando Web Vitals non è disponibile", async () => {
    vi.stubGlobal("shopify", {});
    const view = await render(<PerformanceReporter />);
    mounted.push(view);
    expect(view.container.innerHTML).toBe("");
  });
});
