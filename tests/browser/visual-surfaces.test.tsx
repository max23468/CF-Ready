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
import { CheckoutSimulator } from "../../app/features/rules/CheckoutSimulator";
import "../../app/app.css";

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
    await page.screenshot({
      path: `__screenshots__/visual/home-${server.browser}-${width}.png`,
    });
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
  await page.screenshot({ path: `__screenshots__/visual/guide-top-${server.browser}-390.png` });
  await page.viewport(1280, 844);
  await page.screenshot({ path: `__screenshots__/visual/guide-top-${server.browser}-1280.png` });
  await page.viewport(390, 844);
  summary.focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(summary.matches(":focus-visible")).toBe(true);
  expect(getComputedStyle(summary).outlineStyle).toBe("solid");
  expect(getComputedStyle(summary).outlineWidth).toBe("2px");
  expect(view.container.querySelector("#support")).not.toBeNull();
  await page.getByRole("button", { name: texts("it").support.heading, exact: true }).click();
  const support = view.container.querySelector<HTMLElement>("#support")!;
  expect(support.getBoundingClientRect().height).toBeGreaterThan(100);
  await expect.poll(() => support.getBoundingClientRect().top).toBeLessThan(844);
  await page
    .getByRole("button", { name: texts("it").guide.diagnosis.heading, exact: true })
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
      .getByRole("textbox", { name: texts("it").messages.taxCodeRequired, exact: true })
      .element();
    expect(field.getBoundingClientRect().height).toBeGreaterThan(20);
    expect(preview.getBoundingClientRect().top).toBeLessThan(field.getBoundingClientRect().top);
    expect(preview.getBoundingClientRect().top).toBeLessThan(500);
    await page.screenshot({
      path: `__screenshots__/visual/messages-${server.browser}-${width}.png`,
    });
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
      labelState: { ...onboardingData.labelState, address2Classification: "expected" },
    };
    const onboarding = await mount(<Onboarding />);
    expectNativeCards(onboarding.container);
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
    await page.screenshot({
      path: `__screenshots__/visual/onboarding-${server.browser}-${width}.png`,
    });
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
      labelScopesGranted: false,
      labelState: onboardingData.labelState,
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
    expect(view.container.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
    await page.screenshot({
      path: `__screenshots__/visual/rules-${server.browser}-${width}.png`,
    });
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
  const advanced = view.container.querySelector<HTMLDetailsElement>("details")!;
  expect(advanced.open).toBe(false);
  expect(advanced.querySelector('s-select[label="Lingua dell’anteprima"]')).not.toBeNull();
  await page.elementLocator(advanced.querySelector("summary")!).click();
  await act(async () => {
    await page
      .getByRole("combobox", { name: texts("it").rules.simulator.previewLanguage })
      .selectOptions("en");
  });
  expect(view.container.textContent).toContain(texts("en").rules.simulator.privatePreview);
  const button = view.container.querySelector<HTMLElement>(".checkout-simulator__button--primary")!;
  button.focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(button.matches(":focus-visible")).toBe(true);
  expect(getComputedStyle(button).outlineColor).toBe("rgb(0, 91, 211)");
  expect(getComputedStyle(button).outlineWidth).toBe("3px");
  expect(view.container.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
  await page.screenshot({ path: `__screenshots__/visual/simulator-${server.browser}-320.png` });
});
