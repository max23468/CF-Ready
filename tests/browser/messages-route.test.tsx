import { router, mount, labelSlot } from "./route-support";
import { describe, expect, test } from "vitest";

import { DEFAULT_CONFIG } from "../../app/config";

import { texts } from "../../app/i18n";

import { click, dispatch } from "./render";

import CustomerMessages from "../../app/routes/app.messages";

describe("Messaggi", () => {
  test("l'anteprima dice sempre se il messaggio compare, così l'altezza non cambia", async () => {
    // Prima la nota compariva solo per i messaggi "non previsti" e spostava i campi sotto.
    router.loaderData = {
      locale: "it",
      configHash: "hash",
      messages: DEFAULT_CONFIG.messages,
      rules: { taxCode: "required_validated", pec: "optional_validated" },
    };
    const view = await mount(<CustomerMessages />);
    const preview = view.container.querySelector(".customer-messages-preview")!;
    expect(preview.textContent).toContain(texts("it").messages.previewShown);
    expect(preview.textContent).not.toContain(texts("it").messages.previewNotShown);
  });

  test("mostra tutte le righe esplicite di un messaggio valido", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "hash",
      messages: DEFAULT_CONFIG.messages,
      rules: DEFAULT_CONFIG.rules,
    };
    const view = await mount(<CustomerMessages />);
    const field = view.container.querySelector(
      's-text-area[name="it.pecInvalid"]',
    ) as HTMLElement & { value: string };
    Object.assign(field, { name: "it.pecInvalid", value: "Riga di prova\n".repeat(12) });
    await dispatch(field, new Event("input", { bubbles: true }));
    expect(Number(field.getAttribute("rows"))).toBeGreaterThanOrEqual(13);
    expect(field.getAttribute("error")).toBeNull();
  });

  test("carica l'anteprima delle etichette dopo il primo render", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "hash",
      messages: DEFAULT_CONFIG.messages,
      rules: DEFAULT_CONFIG.rules,
      labelSnapshot: null,
    };
    await mount(<CustomerMessages />);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      {
        intent: "load_checkout_labels",
        taxCode: "unmanaged",
        pec: "unmanaged",
      },
      { method: "post", action: "/app/rules" },
    );
  });

  test("usa nel simulatore l'etichetta osservata per la lingua corrente", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "hash",
      messages: DEFAULT_CONFIG.messages,
      rules: { taxCode: "required_validated", pec: "optional_validated" },
      labelSnapshot: {
        slots: [
          labelSlot({
            name: "taxCode",
            key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
            kind: "source",
            currentValue: "Codice fiscale corrente",
          }),
          labelSlot({
            name: "taxCode",
            key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
            locale: "en",
            family: "en",
            kind: "global_translation",
            currentValue: null,
            inheritedValue: "Current tax code",
          }),
        ],
      },
    };
    const view = await mount(<CustomerMessages />);
    expect(view.container.textContent).toContain(texts("it").messages.previewCurrentFieldLabel);
    expect(view.container.textContent).toContain("Codice fiscale corrente");

    const language = view.container.querySelector("s-select") as HTMLElement & { value: string };
    language.value = "en";
    await dispatch(language, new Event("change", { bubbles: true }));
    expect(
      view.container.querySelector('.customer-messages-preview__error[lang="en"]')?.textContent,
    ).toContain(texts("en").messages.previewErrorHeading);
    expect(
      view.container.querySelector(".customer-messages-preview__error")?.textContent,
    ).not.toContain(texts("it").messages.previewErrorHeading);
    expect(
      view.container
        .querySelector("s-text-area")!
        .compareDocumentPosition(view.container.querySelector(".customer-messages-preview")!) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(view.container.textContent).toContain("Current tax code");
  });

  test("il salvataggio normalizzato chiude la bozza senza lasciare spazi nei campi", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "old",
      messages: DEFAULT_CONFIG.messages,
      rules: DEFAULT_CONFIG.rules,
    };
    const view = await mount(<CustomerMessages />);
    const field = view.container.querySelector("s-text-area") as HTMLElement & {
      name: string;
      value: string;
    };
    field.name = "fr.taxCodeRequired";
    await dispatch(field, new Event("input", { bubbles: true }));
    field.name = "it.unknown";
    await dispatch(field, new Event("input", { bubbles: true }));
    field.name = "it.taxCodeRequired";
    field.value = "Messaggio normalizzato ";
    await dispatch(field, new Event("input", { bubbles: true }));
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    router.loaderData = {
      ...(router.loaderData as object),
      configHash: "new",
      messages: {
        ...DEFAULT_CONFIG.messages,
        it: { ...DEFAULT_CONFIG.messages.it, taxCodeRequired: "Messaggio normalizzato" },
      },
    };
    router.actionData = { ok: true };
    await view.rerender(<CustomerMessages />);
    expect(
      (view.container.querySelector("s-text-area") as HTMLElement & { value: string }).value,
    ).toBe("Messaggio normalizzato");
    expect(shopify.toast.show).toHaveBeenCalledWith(texts("it").messages.saved);
    expect(shopify.saveBar.hide).toHaveBeenCalled();
  });

  test("un conflitto conserva la bozza e riapplica solo i campi modificati", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "old",
      messages: DEFAULT_CONFIG.messages,
      rules: DEFAULT_CONFIG.rules,
    };
    const view = await mount(<CustomerMessages />);
    const field = view.container.querySelector("s-text-area") as HTMLElement & {
      name: string;
      value: string;
    };
    field.name = "it.taxCodeRequired";
    field.value = "La mia modifica";
    await dispatch(field, new Event("input", { bubbles: true }));
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    router.loaderData = {
      ...(router.loaderData as object),
      configHash: "remote",
      messages: {
        ...DEFAULT_CONFIG.messages,
        it: {
          ...DEFAULT_CONFIG.messages.it,
          taxCodeRequired: "Modifica concorrente",
          pecInvalid: "Nuovo testo remoto",
        },
      },
    };
    router.actionData = { ok: false, errorCode: "config_conflict" };
    await view.rerender(<CustomerMessages />);
    expect(view.container.textContent).toContain("Modifica concorrente");
    expect(view.container.textContent).toContain("La mia modifica");
    // Punti 10 e 11: titoli leggibili e conflitto come avviso che si porta in vista.
    expect(view.container.textContent).toContain(
      `${texts("it").messages.taxCodeRequired} (italiano)`,
    );
    expect(view.container.textContent).not.toContain("IT · ");
    expect(
      view.container.querySelector('.cf-reveal-banner s-banner[tone="warning"]'),
    ).not.toBeNull();
    expect(
      view.container
        .querySelector('ui-save-bar button[variant="primary"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
    await click(
      [...view.container.querySelectorAll("s-button")].find(
        (button) => button.textContent === texts("it").conflict.reapply,
      )!,
    );
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    expect(router.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        configHash: "remote",
        "it.taxCodeRequired": "La mia modifica",
        "it.pecInvalid": "Nuovo testo remoto",
      }),
      { method: "post" },
    );
  });

  test("conserva la digitazione successiva all'invio mentre accetta il testo salvato", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "old",
      messages: DEFAULT_CONFIG.messages,
      rules: DEFAULT_CONFIG.rules,
    };
    const view = await mount(<CustomerMessages />);
    const field = view.container.querySelector("s-text-area") as HTMLElement & {
      name: string;
      value: string;
    };
    field.name = "it.taxCodeRequired";
    field.value = "Prima versione ";
    await dispatch(field, new Event("input", { bubbles: true }));
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    field.value = "Seconda versione";
    await dispatch(field, new Event("input", { bubbles: true }));
    router.loaderData = {
      ...(router.loaderData as object),
      configHash: "new",
      messages: {
        ...DEFAULT_CONFIG.messages,
        it: { ...DEFAULT_CONFIG.messages.it, taxCodeRequired: "Prima versione" },
      },
    };
    router.actionData = { ok: true };
    await view.rerender(<CustomerMessages />);
    expect(
      (view.container.querySelector("s-text-area") as HTMLElement & { value: string }).value,
    ).toBe("Seconda versione");
    expect(view.container.querySelector("s-text-area")).toBe(field);
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    expect(router.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ configHash: "new", "it.taxCodeRequired": "Seconda versione" }),
      { method: "post" },
    );
  });

  test("modifica, cambia lingua, annulla, ripristina e salva", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "hash",
      messages: DEFAULT_CONFIG.messages,
      rules: DEFAULT_CONFIG.rules,
    };
    const view = await mount(<CustomerMessages />);
    const form = view.container.querySelector("form");
    const field = view.container.querySelector("s-text-area") as HTMLElement & {
      name: string;
      value: string;
    };
    field.name = "it.taxCodeRequired";
    field.value = "Nuovo messaggio";
    await dispatch(field, new Event("input", { bubbles: true }));
    expect(form).toBeTruthy();

    const language = view.container.querySelector("s-select") as HTMLElement & { value: string };
    language.value = "en";
    await dispatch(language, new Event("change", { bubbles: true }));
    const buttons = [...view.container.querySelectorAll("button")];
    await click(buttons[1]);
    await click(buttons[0]);
    expect(router.submit).toHaveBeenCalled();

    const restore = [...view.container.querySelectorAll('s-button[slot="primary-action"]')].at(-1);
    if (!restore) throw new Error("ripristino assente");
    await click(restore);
    expect(view.container.querySelectorAll("s-text-area")).toHaveLength(4);
  });

  test("mostra errori di campo e di scrittura e conferma il salvataggio", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "hash",
      messages: {
        ...DEFAULT_CONFIG.messages,
        it: { ...DEFAULT_CONFIG.messages.it, taxCodeRequired: "x".repeat(201) },
      },
      rules: { taxCode: "required_validated", pec: "optional_validated" },
    };
    router.actionData = {
      ok: false,
      problem: { locale: "it", key: "pecInvalid", kind: "empty" },
    };
    const view = await mount(<CustomerMessages />);
    const fields = [...view.container.querySelectorAll("s-text-area")];
    expect(fields).toHaveLength(4);
    await dispatch(fields[0], new FocusEvent("focusin", { bubbles: true }));
    await dispatch(fields[0], new FocusEvent("focusout", { bubbles: true }));

    router.actionData = { ok: false, errorCode: "validation_write_failed" };
    await view.rerender(<CustomerMessages />);
    expect(view.container.querySelector('s-banner[tone="critical"]')).not.toBeNull();

    router.actionData = { ok: true };
    await view.rerender(<CustomerMessages />);
    expect(shopify.toast.show).toHaveBeenCalledWith(texts("it").messages.saved);
  });
});
