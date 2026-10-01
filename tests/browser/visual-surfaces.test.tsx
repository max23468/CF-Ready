import { act } from "react";
import { beforeAll, expect, test } from "vitest";
import { page, server, userEvent } from "vitest/browser";
import { router, mount, homeData, confirmedHome, onboardingData } from "./route-support";
import { texts } from "../../app/i18n";
import HomePage from "../../app/features/home/HomePage";
import Guide from "../../app/routes/app.guide";
import CustomerMessages from "../../app/routes/app.messages";
import Onboarding from "../../app/routes/app.onboarding";
import CheckoutRules from "../../app/routes/app.rules";
import { DEFAULT_CONFIG } from "../../app/config";
import type { CheckoutLabelsMode } from "../../app/checkout-labels/domain";
import { CheckoutSimulator } from "../../app/features/rules/CheckoutSimulator";
import "../../app/app.css";
import "../../app/ui-motion.css";

// I test di interazione usano host non registrati. Qui serve il rendering reale:
// solo fixture sintetiche, nessuna autenticazione o chiamata allo store.
beforeAll(async () => {
  const script = document.createElement("script");
  script.src = "https://cdn.shopify.com/shopifycloud/polaris-1.js";
  document.head.append(script);
  await customElements.whenDefined("s-page");
  document.documentElement.lang = "it";
  const style = document.createElement("style");
  style.textContent =
    "*, *::before, *::after { animation: none !important; transition: none !important; } body { height: 100vh; overflow: auto; }";
  document.head.append(style);
}, 30000);

function expectNativeCards(container: HTMLElement) {
  expect(getComputedStyle(document.body).backgroundColor).toBe("rgb(241, 241, 241)");
  const sections = container.querySelectorAll("s-section");
  expect(sections.length).toBeGreaterThan(0);
  const rectangles: DOMRect[] = [];
  for (const section of sections) {
    const surfaces = Array.from(section.shadowRoot!.querySelectorAll<HTMLElement>("*"));
    const surface = surfaces.find(
      (surface) =>
        surface.getBoundingClientRect().width > 100 &&
        getComputedStyle(surface).backgroundColor === "rgb(255, 255, 255)",
    );
    expect(surface).toBeDefined();
    rectangles.push(surface!.getBoundingClientRect());
  }
  if (document.documentElement.clientWidth <= 600) {
    rectangles.sort((a, b) => a.top - b.top);
    for (const rectangle of rectangles) {
      expect(rectangle.left).toBeGreaterThanOrEqual(16);
      expect(rectangle.right).toBeLessThanOrEqual(document.documentElement.clientWidth - 16);
    }
    for (let index = 1; index < rectangles.length; index++) {
      expect(rectangles[index].top - rectangles[index - 1].bottom).toBe(16);
    }
  }
}

async function captureSurface(element: HTMLElement, path: string) {
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  await page.viewport(
    width,
    Math.max(height, Math.ceil(element.getBoundingClientRect().height) + 32),
  );
  await page.screenshot({ path });
  await page.viewport(width, height);
}

test("Polaris reale: Home stabile durante conferma rapida, lenta e fallita", async () => {
  const data = {
    ...homeData,
    validationEnabled: true,
    onboarding: "completed",
    complimentary: true,
    entitlement: { kind: "one_time", validThrough: null },
    rules: { taxCode: "required_validated", pec: "optional_validated" },
  };
  for (const width of [1280, 390, 320]) {
    await page.viewport(width, 844);
    let resolve!: (value: object) => void;
    const confirmed = new Promise<object>((done) => {
      resolve = done;
    });
    router.loaderData = confirmedHome(data, confirmed);
    const view = await mount(<HomePage />);
    const status = view.container.querySelector<HTMLElement>('div[role="status"]')!;
    const heading = view.container.querySelector<HTMLElement>("s-heading")!;
    const pendingRect = heading.getBoundingClientRect();
    expect(status.textContent).toContain(texts("it").home.verifying);
    await act(async () => resolve(data));
    await expect.poll(() => status.textContent).toContain(texts("it").home.badgeActive);
    expect(view.container.textContent).not.toContain(texts("it").home.verified);
    expect(view.container.querySelector(".home-verification")).toBeNull();
    expect(heading.getBoundingClientRect().height).toBe(pendingRect.height);
    expect(heading.getBoundingClientRect().top).toBe(pendingRect.top);
    expectNativeCards(view.container);
    const rulesGrid = view.container.querySelector("s-query-container > s-grid")!;
    const gridSurface = rulesGrid.shadowRoot!.querySelector<HTMLElement>(".grid")!;
    expect(getComputedStyle(gridSurface).gridTemplateColumns.split(" ")).toHaveLength(
      width === 320 ? 1 : 2,
    );
    for (const badge of view.container.querySelectorAll("s-badge")) {
      for (const element of badge.shadowRoot!.querySelectorAll<HTMLElement>("*")) {
        if (element.textContent === badge.textContent && element.clientWidth > 0) {
          expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth + 1);
        }
      }
    }
    expect(
      view.container.querySelector(`s-section[heading="${texts("it").plan.includedHeading}"]`),
    ).not.toBeNull();
    const cards = view.container.querySelectorAll<HTMLElement>('s-stack[slot="aside"] > s-section');
    expect(cards).toHaveLength(3);
    const cardRects = Array.from(cards, (card) =>
      Array.from(card.shadowRoot!.querySelectorAll<HTMLElement>("*"))
        .find(
          (surface) =>
            surface.getBoundingClientRect().width > 100 &&
            getComputedStyle(surface).backgroundColor === "rgb(255, 255, 255)",
        )!
        .getBoundingClientRect(),
    );
    for (let index = 1; index < cards.length; index++) {
      const gap = cardRects[index].top - cardRects[index - 1].bottom;
      expect(gap).toBe(16);
    }
    await captureSurface(
      view.container,
      `__screenshots__/visual/home-${server.browser}-${width}.png`,
    );
    router.loaderData = confirmedHome(data, Promise.reject(new Error("timeout")));
    await view.rerender(<HomePage />);
    await expect
      .poll(() => view.container.textContent)
      .toContain(texts("it").home.verificationFailed);
    expect(status.textContent).toContain(texts("it").home.badgeActive);
    await view.unmount();
  }
});

test("Polaris reale: FAQ con focus visibile e accessi rapidi", async () => {
  await page.viewport(390, 844);
  router.loaderData = {
    locale: "it",
    shopDomain: "demo.myshopify.com",
    version: "1.15.11",
    diagnosticId: "123e4567-e89b-42d3-a456-426614174000",
    diagnostics: {},
  };
  const view = await mount(<Guide />);
  expectNativeCards(view.container);
  const asideCards = view.container.querySelectorAll('s-stack[slot="aside"] > s-section');
  expect(asideCards[0].getAttribute("heading")).toBe(texts("it").support.heading);
  const summary = view.container.querySelector<HTMLElement>(".guide-faq__entry summary")!;
  expect(getComputedStyle(summary.querySelector(".guide-faq__question")!).fontWeight).toBe("600");
  expect(getComputedStyle(summary).listStyleType).toBe("disclosure-closed");
  await captureSurface(
    view.container,
    `__screenshots__/visual/guide-top-${server.browser}-390.png`,
  );
  await page.viewport(1280, 844);
  await captureSurface(
    view.container,
    `__screenshots__/visual/guide-top-${server.browser}-1280.png`,
  );
  await page.viewport(390, 844);
  summary.focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(summary.matches(":focus-visible")).toBe(true);
  expect(getComputedStyle(summary).outlineStyle).toBe("solid");
  expect(getComputedStyle(summary).outlineWidth).toBe("2px");
  expect(view.container.querySelector("#support")).not.toBeNull();
  const support = view.container.querySelector<HTMLElement>("#support")!;
  expect(support.getBoundingClientRect().height).toBeGreaterThan(100);
  expect(support.querySelector('s-button[icon="search"]')?.textContent).toBe(
    texts("it").guide.diagnosis.heading,
  );
  await page
    .getByRole("button", {
      name: texts("it").guide.diagnosis.heading,
      exact: true,
    })
    .click();
  expect(
    view.container.querySelector("#validation-diagnosis")!.getBoundingClientRect().top,
  ).toBeLessThan(844);
  await page.screenshot({
    path: `__screenshots__/visual/guide-${server.browser}-390.png`,
  });
});

test("Polaris reale: anteprima Messaggi visibile prima dei campi e riepilogo senza tagli", async () => {
  for (const width of [1280, 390, 320]) {
    await page.viewport(width, 844);
    router.loaderData = {
      locale: "it",
      configHash: "fixture",
      messages: DEFAULT_CONFIG.messages,
      rules: DEFAULT_CONFIG.rules,
    };
    const messages = await mount(<CustomerMessages />);
    expectNativeCards(messages.container);
    const preview = messages.container.querySelector<HTMLElement>(".customer-messages-preview")!;
    expect(preview.querySelector("summary")).toBeNull();
    expect(preview.textContent?.match(/Anteprima nel checkout/g)).toHaveLength(1);
    expect(preview.querySelector('s-icon[type="alert-circle"]')).not.toBeNull();
    const field = page
      .getByRole("textbox", {
        name: texts("it").messages.taxCodeRequired,
        exact: true,
      })
      .element();
    expect(field.getBoundingClientRect().height).toBeGreaterThan(20);
    expect(preview.getBoundingClientRect().top).toBeLessThan(field.getBoundingClientRect().top);
    expect(preview.getBoundingClientRect().top).toBeLessThan(500);
    await captureSurface(
      messages.container,
      `__screenshots__/visual/messages-${server.browser}-${width}.png`,
    );
    await act(async () => {
      await page
        .getByRole("combobox", { name: texts("it").messages.languageSelector })
        .selectOptions("en");
    });
    expect(
      messages.container.querySelector('.customer-messages-preview__error[lang="en"]')?.textContent,
    ).toContain(texts("en").messages.previewErrorHeading);
    expect(
      messages.container.querySelector('s-banner[tone="critical"], [role="alert"]'),
    ).toBeNull();
    await messages.unmount();
    router.loaderData = {
      ...onboardingData,
      step: 4,
      completed: true,
      enabled: true,
      entitled: true,
      entitlementKind: "one_time",
      labelState: {
        ...onboardingData.labelState,
        address2Classification: "expected",
      },
    };
    const onboarding = await mount(<Onboarding />);
    expectNativeCards(onboarding.container);
    if (width === 1280) {
      const row = onboarding.container.querySelector<HTMLElement>(".cf-onboarding-summary-row")!;
      const label = row.getBoundingClientRect();
      const value = row.querySelector(".cf-onboarding-summary-value")!.getBoundingClientRect();
      expect(getComputedStyle(row).gridTemplateColumns).toMatch(/^160px /);
      expect(value.left - label.left).toBe(172);
      expect(value.top).toBe(label.top);
    }
    for (const value of onboarding.container.querySelectorAll<HTMLElement>(
      ".cf-onboarding-summary-value",
    )) {
      expect(value.scrollWidth).toBeLessThanOrEqual(value.clientWidth);
      expect(value.querySelector("s-badge")).toBeNull();
    }
    expect(onboarding.container.textContent).not.toContain("puoi attivare");
    expect(onboarding.container.textContent).toContain(
      texts("it").rules.labels.addressStatus.expected,
    );
    await captureSurface(
      onboarding.container,
      `__screenshots__/visual/onboarding-${server.browser}-${width}.png`,
    );
    await onboarding.unmount();
  }
});

test("Polaris reale: Regole con card bianche sul fondo grigio desktop e mobile", async () => {
  for (const width of [1280, 390, 320]) {
    await page.viewport(width, 844);
    router.loaderData = {
      locale: "it",
      duplicateError: null,
      configHash: "fixture",
      rules: DEFAULT_CONFIG.rules,
      messages: DEFAULT_CONFIG.messages,
      configurationHistory: [],
      enabled: true,
      entitled: true,
      labelScopesGranted: true,
      labelState: {
        ...onboardingData.labelState,
        mode: "partial" satisfies CheckoutLabelsMode,
        lastSyncAt: "2026-10-01T06:00:00Z",
      },
      labelSnapshot: null,
      guidedConfirmations: [],
      labelLoadError: null,
      checkoutSettingsUrl: "https://admin.shopify.com/store/demo/settings/checkout",
      storefrontUrl: "https://demo.myshopify.com",
    };
    const view = await mount(<CheckoutRules />);
    expectNativeCards(view.container);
    const ruleCards = view.container.querySelectorAll(".rules-layout__fields > s-section");
    expect(ruleCards).toHaveLength(2);
    expect(ruleCards[0].querySelector('s-choice-list[name="taxCode"]')).not.toBeNull();
    expect(ruleCards[1].querySelector('s-choice-list[name="pec"]')).not.toBeNull();
    const technical = view.container.querySelector<HTMLDetailsElement>(
      ".checkout-labels-technical",
    )!;
    (technical.closest("details:not(.checkout-labels-technical)") as HTMLDetailsElement).open =
      true;
    technical.open = true;
    expect(technical.querySelector("s-badge")?.textContent).toBe(
      texts("it").rules.labels.modeValues.partial,
    );
    const body = technical.querySelector<HTMLElement>(".checkout-labels-disclosure__body")!;
    expect(parseFloat(getComputedStyle(body).paddingInlineStart)).toBeGreaterThanOrEqual(16);
    expect(parseFloat(getComputedStyle(body).paddingBlockEnd)).toBeGreaterThanOrEqual(16);
    const rows = [...body.querySelector('s-stack[direction="block"]')!.children];
    expect(rows).toHaveLength(3);
    // Gli host Polaris usano display: contents; si misurano le superfici nello shadow DOM.
    const rowRects = rows.map((row) =>
      [...row.shadowRoot!.querySelectorAll("*")]
        .map((element) => element.getBoundingClientRect())
        .find((rectangle) => rectangle.height > 0)!,
    );
    for (let index = 1; index < rows.length; index++) {
      expect(rowRects[index].top - rowRects[index - 1].bottom).toBeGreaterThanOrEqual(8);
    }
    expect(view.container.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
    await captureSurface(
      view.container,
      `__screenshots__/visual/rules-${server.browser}-${width}.png`,
    );
    await view.unmount();
  }
});

test("Polaris reale: simulatore stretto e focus tastiera leggibile", async () => {
  await page.viewport(320, 844);
  const view = await mount(
    <CheckoutSimulator
      locale="it"
      rules={DEFAULT_CONFIG.rules}
      messages={DEFAULT_CONFIG.messages}
    />,
  );
  const summaries = view.container.querySelectorAll("summary");
  expect(summaries).toHaveLength(2);
  for (const summary of summaries) {
    expect(getComputedStyle(summary).cursor).toBe("pointer");
  }
  const advanced = Array.from(view.container.querySelectorAll<HTMLDetailsElement>("details")).find(
    (details) => details.querySelector('s-select[label="Lingua dell’anteprima"]'),
  )!;
  expect(advanced.open).toBe(false);
  expect(advanced.querySelector('s-select[label="Lingua dell’anteprima"]')).not.toBeNull();
  await page.elementLocator(advanced.querySelector("summary")!).click();
  await act(async () => {
    await page
      .getByRole("combobox", {
        name: texts("it").rules.simulator.previewLanguage,
      })
      .selectOptions("en");
  });
  expect(view.container.textContent).toContain(texts("en").rules.simulator.privatePreview);
  for (const [label, expected] of [
    [texts("en").rules.simulator.deliveryCountry, "Italy"],
    [texts("en").rules.simulator.billingCountry, "Italy"],
    [texts("en").rules.simulator.checkoutStep, "Entering details"],
  ]) {
    const select = view.container
      .querySelector(`s-select[label="${label}"]`)!
      .shadowRoot!.querySelector("select")!;
    expect(select.selectedOptions[0].text).toBe(expected);
  }
  const button = view.container.querySelector<HTMLElement>(".checkout-simulator__button--primary")!;
  button.focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(button.matches(":focus-visible")).toBe(true);
  expect(getComputedStyle(button).outlineColor).toBe("rgb(0, 91, 211)");
  expect(getComputedStyle(button).outlineWidth).toBe("3px");
  expect(view.container.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
  await captureSurface(
    view.container,
    `__screenshots__/visual/simulator-${server.browser}-320.png`,
  );
});

test("Polaris reale: cambio passo ripristina focus e scorrimento mobile", async () => {
  await page.viewport(390, 844);
  router.loaderData = {
    ...onboardingData,
    step: 1,
    completed: true,
    rules: { taxCode: "required_validated", pec: "optional_validated" },
  };
  const view = await mount(<Onboarding />);
  for (const width of [390, 1280]) {
    await page.viewport(width, 844);
    await captureSurface(
      view.container,
      `__screenshots__/visual/onboarding-step1-${server.browser}-${width}.png`,
    );
  }
  await page.viewport(390, 844);
  await act(async () => {
    await page.getByRole("button", { name: texts("it").onboarding.next, exact: true }).click();
  });
  for (const width of [390, 1280]) {
    await page.viewport(width, 844);
    await captureSurface(
      view.container,
      `__screenshots__/visual/onboarding-step2-${server.browser}-${width}.png`,
    );
  }
  await page.viewport(390, 844);
  await act(async () => {
    await page.getByRole("button", { name: texts("it").onboarding.next, exact: true }).click();
  });
  const content = view.container.querySelector<HTMLElement>(".onboarding-step")!;
  expect(document.activeElement).toBe(content);
  expect(content.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
  expect(content.getBoundingClientRect().top).toBeLessThan(100);
  expect(content.textContent).toContain(texts("it").onboarding.step3Heading);
  expect(content.textContent).toContain(texts("it").messages.appearsNot);
  await captureSurface(
    view.container,
    `__screenshots__/visual/onboarding-step3-${server.browser}-390.png`,
  );
  await page.viewport(1280, 844);
  await captureSurface(
    view.container,
    `__screenshots__/visual/onboarding-step3-${server.browser}-1280.png`,
  );
  await page.viewport(390, 844);
  await act(async () => {
    await page.getByRole("button", { name: texts("it").onboarding.next, exact: true }).click();
  });
  await captureSurface(
    view.container,
    `__screenshots__/visual/onboarding-step4-${server.browser}-390.png`,
  );
  await page.viewport(1280, 844);
  await captureSurface(
    view.container,
    `__screenshots__/visual/onboarding-step4-${server.browser}-1280.png`,
  );
});
