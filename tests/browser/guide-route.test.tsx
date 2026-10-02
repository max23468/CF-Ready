import { router, mount } from "./route-support";
import { describe, expect, test, vi } from "vitest";

import { texts } from "../../app/i18n";

import { click, dispatch } from "./render";

import Guide from "../../app/routes/app.guide";

describe("Guida", () => {
  test("la diagnosi distingue stato appena verificato, errore e controlli manuali", async () => {
    router.loaderData = {
      locale: "it",
      shopDomain: "demo.myshopify.com",
      version: "1.2.2",
      diagnosticId: "123e4567-e89b-42d3-a456-426614174000",
      diagnostics: { lastSyncAt: "2026-09-05T00:00:00Z", errorCode: "generic" },
    };
    const view = await mount(<Guide />);
    expect(view.container.textContent).toContain(texts("it").guide.diagnosis.notChecked);
    await click(
      [...view.container.querySelectorAll("s-button")].find(
        (button) => button.textContent === texts("it").guide.diagnosis.refresh,
      )!,
    );
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "check_validation" },
      { method: "post" },
    );
    for (const active of [true, false]) {
      router.fetcher.data = {
        ok: true,
        check: {
          checkedAt: "2026-09-05T00:01:00Z",
          enabled: active,
          entitled: active,
          configured: active,
          errorCode: null,
        },
      };
      await view.rerender(<Guide />);
      expect(view.container.textContent).toContain(
        active ? texts("it").guide.diagnosis.enabled : texts("it").guide.diagnosis.disabled,
      );
    }
    router.fetcher.data = {
      ok: true,
      check: {
        checkedAt: "2026-09-05T00:01:00Z",
        enabled: true,
        entitled: true,
        configured: true,
        errorCode: "billing_read_failed",
      },
    };
    await view.rerender(<Guide />);
    expect(view.container.textContent).not.toContain(texts("it").guide.diagnosis.entitled);
    router.fetcher.data = { ok: false };
    await view.rerender(<Guide />);
    expect(view.container.textContent).toContain(texts("it").guide.diagnosis.failed);
    expect(view.container.textContent).not.toContain(texts("it").guide.diagnosis.checkedAt);
  });

  test("la diagnosi mostra esiti leggibili con icone e porta al simulatore", async () => {
    router.loaderData = {
      locale: "it",
      shopDomain: "demo.myshopify.com",
      version: "1.15.20",
      diagnosticId: "123e4567-e89b-42d3-a456-426614174000",
      diagnostics: {},
    };
    const view = await mount(<Guide />);
    const it = texts("it");
    // G-B4: il link porta al simulatore, non in cima a Regole.
    expect(
      [...view.container.querySelectorAll("s-link")]
        .find((link) => link.textContent === it.guide.diagnosis.simulate)!
        .getAttribute("href"),
    ).toBe("/app/rules#simulatore");
    router.fetcher.data = {
      ok: true,
      check: {
        checkedAt: "2026-09-05T00:01:00Z",
        timeZone: "Europe/Rome",
        enabled: true,
        entitled: true,
        configured: true,
        errorCode: null,
        checkoutLabelsStatus: "synced",
        address2Classification: "fiscal_conflict",
        address2Decision: "accepted",
      },
    };
    await view.rerender(<Guide />);
    // G-B1: niente valori interni né il termine inglese "Validation".
    const text = view.container.querySelector("#validation-diagnosis")!.textContent!;
    expect(text).not.toMatch(/synced|fiscal_conflict|accepted|Validation/);
    expect(text).toContain(it.guide.diagnosis.labelsStatus.synced);
    expect(text).toContain(it.rules.labels.addressSummary.fiscal_conflict);
    expect(text).toContain(it.guide.diagnosis.address2Decision.accepted);
    const icons = [...view.container.querySelectorAll("#validation-diagnosis s-icon")];
    expect(icons.map((icon) => icon.getAttribute("tone"))).toEqual([
      "success",
      "success",
      "success",
      "success",
      "success",
    ]);
    router.fetcher.data = {
      ok: true,
      check: {
        ...(router.fetcher.data as { check: object }).check,
        checkoutLabelsStatus: "action_required",
        address2Decision: "pending",
      },
    };
    await view.rerender(<Guide />);
    expect(
      [...view.container.querySelectorAll("#validation-diagnosis s-icon")]
        .slice(3)
        .map((icon) => icon.getAttribute("tone")),
    ).toEqual(["warning", "warning"]);
  });

  test("la card Assistenza segue testo, argomento, invio e lascia il salto in fondo", async () => {
    router.loaderData = {
      locale: "it",
      shopDomain: "demo.myshopify.com",
      version: "1.15.20",
      diagnosticId: "123e4567-e89b-42d3-a456-426614174000",
      diagnostics: { entitlementKind: "complimentary" },
    };
    const view = await mount(<Guide />);
    const it = texts("it");
    // G-B9, G-N1: spiegazione prima dei comandi, salto alla diagnosi in fondo.
    const support = view.container.querySelector("#support")!;
    const order = [
      it.support.body,
      it.support.privacyNote,
      it.support.chooseCategory,
      it.support.requestSupport,
      it.support.copyDiagnostics,
      it.guide.diagnosis.heading,
    ].map((label) =>
      [...support.querySelectorAll("*")].findIndex(
        (element) => element.textContent === label || element.getAttribute("label") === label,
      ),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const button of support.querySelectorAll("s-button")) {
      expect(button.getAttribute("inlineSize") ?? button.getAttribute("inline-size")).toBe("fill");
    }
    // G-B2: il salto porta il focus alla sezione di arrivo.
    await click(
      [...support.querySelectorAll("s-button")].find(
        (button) => button.textContent === it.guide.diagnosis.heading,
      )!,
    );
    expect(document.activeElement?.id).toBe("validation-diagnosis");
    // G-B8: con piano omaggio la FAQ su prova e pagamenti non parla di 14 giorni.
    const faq = view.container.querySelector("#faq")!.textContent!;
    expect(faq).toContain(it.guide.complimentaryBillingAnswer);
    expect(faq).not.toContain("14 giorni");
  });

  test("espande FAQ, cambia categoria e registra copia riuscita o fallita", async () => {
    router.loaderData = {
      locale: "it",
      shopDomain: "demo.myshopify.com",
      version: "1.1.4",
      diagnosticId: "123e4567-e89b-42d3-a456-426614174000",
      diagnostics: { validationStatus: "active", billingStatus: "active" },
    };
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const view = await mount(<Guide />);
    const faqEntries = [
      ...view.container.querySelectorAll<HTMLDetailsElement>(".guide-faq__entry"),
    ];
    expect(faqEntries).toHaveLength(14);
    expect(
      [...view.container.querySelectorAll("s-button")].some((button) =>
        button.textContent?.includes(texts("it").support.heading),
      ),
    ).toBe(false);
    expect(view.container.querySelector("#support")).not.toBeNull();
    expect(
      [...view.container.querySelectorAll("#support s-button")].some((button) =>
        button.textContent?.includes(texts("it").guide.diagnosis.heading),
      ),
    ).toBe(true);
    expect(texts("en").guide.groups.map((group) => group.entries.length)).toEqual([5, 5, 4]);
    expect(faqEntries.every((entry) => !entry.open)).toBe(true);
    const buttons = [...view.container.querySelectorAll("#faq s-button")];
    expect(buttons[0].textContent).toBe(texts("it").guide.expandAll);
    for (const entry of faqEntries) entry.open = true;
    await dispatch(faqEntries.at(-1)!, new Event("toggle"));
    expect(buttons[0].textContent).toBe(texts("it").guide.collapseAll);
    await click(buttons[0]);
    expect(faqEntries.every((entry) => !entry.open)).toBe(true);
    await click(buttons[0]);
    expect(faqEntries.every((entry) => entry.open)).toBe(true);
    expect(buttons[0].textContent).toBe(texts("it").guide.collapseAll);
    await click(buttons[0]);
    expect(faqEntries.every((entry) => !entry.open)).toBe(true);

    const copyButton = () =>
      [...view.container.querySelectorAll("s-button")].find(
        (button) => button.textContent === texts("it").support.copyDiagnostics,
      )!;
    const select = view.container.querySelector("s-select") as HTMLElement & { value: string };
    select.value = "billing";
    await dispatch(select, new Event("change", { bubbles: true }));
    await click(copyButton());
    expect(writeText).toHaveBeenCalledOnce();
    expect(shopify.toast.show).toHaveBeenCalledWith(texts("it").support.diagnosticsCopied);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      {
        intent: "diagnostics_copied",
        diagnostic_id: "123e4567-e89b-42d3-a456-426614174000",
      },
      { method: "post" },
    );

    writeText.mockRejectedValueOnce(new Error("clipboard negata"));
    await click(copyButton());
    expect(view.container.textContent).toContain(texts("it").support.diagnosticsCopyFailed);
  });
});
