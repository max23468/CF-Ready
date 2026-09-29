import { act } from "react";
import { beforeAll, expect, test } from "vitest";
import { page, server, userEvent } from "vitest/browser";
import { router, mount, homeData, confirmedHome, onboardingData } from "./route-support";
import { texts } from "../../app/i18n";
import HomePage from "../../app/features/home/HomePage";
import Guide from "../../app/routes/app.guide";
import CustomerMessages from "../../app/routes/app.messages";
import Onboarding from "../../app/routes/app.onboarding";
import { DEFAULT_CONFIG } from "../../app/config";
import { CheckoutSimulator } from "../../app/features/rules/CheckoutSimulator";

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
    "*, *::before, *::after { animation: none !important; transition: none !important; }";
  document.head.append(style);
}, 30000);

test("Polaris reale: Home stabile durante conferma rapida, lenta e fallita", async () => {
  const data = {
    ...homeData,
    validationEnabled: true,
    onboarding: "completed",
    complimentary: true,
    entitlement: { kind: "one_time", validThrough: null },
  };
  for (const width of [1280, 390, 320]) {
    await page.viewport(width, 844);
    let resolve!: (value: object) => void;
    const confirmed = new Promise<object>((done) => {
      resolve = done;
    });
    router.loaderData = confirmedHome(data, confirmed);
    const view = await mount(<HomePage />);
    const status = view.container.querySelector<HTMLElement>(".home-verification")!;
    const section = status.closest("s-section")!;
    const pendingHeight = section.getBoundingClientRect().height;
    expect(status.textContent).toContain(texts("it").home.verifying);
    await act(async () => resolve(data));
    await expect.poll(() => status.textContent).toContain(texts("it").home.verified);
    expect(section.getBoundingClientRect().height).toBe(pendingHeight);
    await page.screenshot({
      path: `__screenshots__/visual/home-${server.browser}-${width}.png`,
    });
    router.loaderData = confirmedHome(data, Promise.reject(new Error("timeout")));
    await view.rerender(<HomePage />);
    await expect.poll(() => status.textContent).toContain(texts("it").home.verificationUnavailable);
    expect(section.getBoundingClientRect().height).toBe(pendingHeight);
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
  const summary = view.container.querySelector<HTMLElement>(".guide-faq__entry summary")!;
  summary.focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(summary.matches(":focus-visible")).toBe(true);
  expect(getComputedStyle(summary).outlineStyle).toBe("solid");
  expect(getComputedStyle(summary).outlineWidth).toBe("2px");
  expect(view.container.querySelector('s-link[href="#support"]')).not.toBeNull();
  await page.screenshot({
    path: `__screenshots__/visual/guide-${server.browser}-390.png`,
  });
});

test("Polaris reale: campi Messaggi prima dell’anteprima e riepilogo mobile senza tagli", async () => {
  for (const width of [390, 320]) {
    await page.viewport(width, 844);
    router.loaderData = {
      locale: "it",
      configHash: "fixture",
      messages: DEFAULT_CONFIG.messages,
      rules: DEFAULT_CONFIG.rules,
    };
    const messages = await mount(<CustomerMessages />);
    const preview = messages.container.querySelector<HTMLDetailsElement>(
      ".customer-messages-preview",
    )!;
    expect(preview.open).toBe(false);
    expect(
      messages.container.querySelector("s-text-area")!.getBoundingClientRect().top,
    ).toBeLessThan(preview.getBoundingClientRect().top);
    expect(
      messages.container.querySelector("s-text-area")!.getBoundingClientRect().top,
    ).toBeLessThan(500);
    await page.screenshot({
      path: `__screenshots__/visual/messages-${server.browser}-${width}.png`,
    });
    await page
      .getByRole("combobox", { name: texts("it").messages.languageSelector })
      .selectOptions("en");
    await page.elementLocator(preview.querySelector("summary")!).click();
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

test("Polaris reale: simulatore stretto e focus tastiera leggibile", async () => {
  await page.viewport(320, 844);
  const view = await mount(
    <CheckoutSimulator
      locale="it"
      rules={DEFAULT_CONFIG.rules}
      messages={DEFAULT_CONFIG.messages}
    />,
  );
  const button = view.container.querySelector<HTMLElement>(".checkout-simulator__button--primary")!;
  button.focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(button.matches(":focus-visible")).toBe(true);
  expect(getComputedStyle(button).outlineColor).toBe("rgb(0, 91, 211)");
  expect(getComputedStyle(button).outlineWidth).toBe("3px");
  expect(view.container.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
  await page.screenshot({ path: `__screenshots__/visual/simulator-${server.browser}-320.png` });
});
