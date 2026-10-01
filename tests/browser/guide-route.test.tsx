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

    const select = view.container.querySelector("s-select") as HTMLElement & { value: string };
    select.value = "billing";
    await dispatch(select, new Event("change", { bubbles: true }));
    await click([...view.container.querySelectorAll("s-button")].at(-1)!);
    expect(writeText).toHaveBeenCalledOnce();
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      {
        intent: "diagnostics_copied",
        diagnostic_id: "123e4567-e89b-42d3-a456-426614174000",
      },
      { method: "post" },
    );

    writeText.mockRejectedValueOnce(new Error("clipboard negata"));
    await click([...view.container.querySelectorAll("s-button")].at(-1)!);
    expect(view.container.textContent).toContain(texts("it").support.diagnosticsCopyFailed);
  });
});
