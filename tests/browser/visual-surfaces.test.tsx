import { act } from "react";
import { beforeAll, expect, inject, test } from "vitest";
import { page, server, userEvent } from "vitest/browser";
import { router, mount, homeData, confirmedHome, onboardingData, labelSlot } from "./route-support";
import { texts } from "../../app/i18n";
import HomePage from "../../app/features/home/HomePage";
import Guide from "../../app/routes/app.guide";
import CustomerMessages from "../../app/routes/app.messages";
import Onboarding from "../../app/routes/app.onboarding";
import CheckoutRules from "../../app/routes/app.rules";
import { DEFAULT_CONFIG } from "../../app/config";
import type { CheckoutLabelsMode } from "../../app/checkout-labels/domain";
import { CheckoutSimulator } from "../../app/features/rules/CheckoutSimulator";
import { RevealBanner } from "../../app/ui-feedback";
import { Disclosure } from "../../app/ui-disclosure";
import { polarisUrlForEnvironment } from "../../app/shopify-ui";
import { trialContinuityTexts } from "../../app/i18n/trial-continuity";
import { formatDate, formatMoney } from "../../app/i18n";
import "../../app/app.css";
import "../../app/ui-motion.css";

declare module "vitest" {
  export interface ProvidedContext {
    polarisEnvironment: string;
  }
}

const polarisV2 = inject("polarisEnvironment") === "development";
const screenshotPath = (path: string) =>
  path.replace("/visual/", polarisV2 ? "/visual-v2/" : "/visual/");

// I test di interazione usano host non registrati. Qui serve il rendering reale:
// solo fixture sintetiche, nessuna autenticazione o chiamata allo store.
beforeAll(async () => {
  const script = document.createElement("script");
  script.src = polarisUrlForEnvironment(polarisV2 ? "development" : "production");
  document.head.append(script);
  await customElements.whenDefined("s-page");
  document.documentElement.lang = "it";
  document.documentElement.dataset.polarisVersion = polarisV2 ? "2" : "1";
  const style = document.createElement("style");
  style.textContent =
    "*, *::before, *::after { animation: none !important; transition: none !important; } body { height: 100vh; overflow: auto; }";
  document.head.append(style);
}, 30000);

function expectNativeCards(container: HTMLElement) {
  if (!polarisV2) {
    expect(getComputedStyle(document.body).backgroundColor).toBe("rgb(241, 241, 241)");
  } else {
    // La v2 usa il fondo e la colonna laterale nativi dell'Admin Next.
    expect(getComputedStyle(document.body).backgroundColor).not.toBe("rgb(241, 241, 241)");
  }
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
  if (!polarisV2 && document.documentElement.clientWidth <= 600) {
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

// Gli host Polaris usano display: contents; si misurano le superfici nello shadow DOM.
function surfaceRect(element: Element) {
  const rectangles = [...(element.shadowRoot?.querySelectorAll("*") ?? [])]
    .map((child) => child.getBoundingClientRect())
    .filter((rectangle) => rectangle.width > 0 && rectangle.height > 0);
  if (rectangles.length === 0) return element.getBoundingClientRect();
  return {
    left: Math.min(...rectangles.map((rectangle) => rectangle.left)),
    right: Math.max(...rectangles.map((rectangle) => rectangle.right)),
    top: Math.min(...rectangles.map((rectangle) => rectangle.top)),
    bottom: Math.max(...rectangles.map((rectangle) => rectangle.bottom)),
  };
}

async function captureSurface(element: HTMLElement, path: string) {
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  await page.viewport(
    width,
    Math.max(height, Math.ceil(element.getBoundingClientRect().height) + 32),
  );
  await page.screenshot({ path: screenshotPath(path) });
  await page.viewport(width, height);
}

test("Polaris reale: Home stabile durante conferma rapida, lenta e fallita", async () => {
  const data = {
    ...homeData,
    validationEnabled: true,
    onboarding: "completed",
    complimentary: true,
    entitlement: { kind: "one_time", validThrough: null },
    rules: { taxCode: "required_validated", pec: "required_when_company" },
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
    // Il riepilogo sotto il badge non deve spostarsi quando lo stato si conferma.
    const summary = view.container.querySelector<HTMLElement>("s-section s-paragraph")!;
    const pendingRect = summary.getBoundingClientRect();
    // Conferma rapida: lo stato salvato resta a vista, senza lampo di "Verifica in corso…".
    expect(status.textContent).toContain(texts("it").home.badgeActive);
    await act(async () => resolve(data));
    await expect.poll(() => status.textContent).toContain(texts("it").home.badgeActive);
    expect(view.container.textContent).not.toContain(texts("it").home.verified);
    expect(view.container.querySelector(".home-verification")).toBeNull();
    expect(summary.getBoundingClientRect().height).toBe(pendingRect.height);
    expect(summary.getBoundingClientRect().top).toBe(pendingRect.top);
    expectNativeCards(view.container);
    const rulesGrid = view.container.querySelector("s-query-container > s-grid")!;
    const gridSurface = rulesGrid.shadowRoot!.querySelector<HTMLElement>(".grid")!;
    expect(getComputedStyle(gridSurface).gridTemplateColumns.split(" ")).toHaveLength(
      gridSurface.getBoundingClientRect().width > 200 ? 2 : 1,
    );
    // T5, P2-T4: anche la PEC obbligatoria per aziende è un badge neutro, senza troncamenti.
    const pecBadge = [...view.container.querySelectorAll("s-badge")].find(
      (badge) => badge.textContent === texts("it").home.pecRequiredForCompanies,
    );
    expect(pecBadge?.getAttribute("tone")).toBe("neutral");
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
      if (polarisV2) {
        expect(gap).toBeGreaterThanOrEqual(16);
      } else {
        expect(gap).toBe(16);
      }
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

test.each([
  ["it", 1280],
  ["it", 390],
  ["en", 1280],
  ["en", 390],
] as const)(
  "Polaris reale: gruppo 2, %s a %i px",
  async (locale, width) => {
    document.documentElement.lang = locale;
    const copy = texts(locale);
    await page.viewport(width, 844);
    const data = {
      ...homeData,
      locale,
      validationEnabled: true,
      onboarding: "completed",
      entitlement: { kind: "trial", validThrough: "2026-10-16" },
      trialStatus: "active",
      trialEndsAt: "2026-10-16",
      firstChargeAt: "2026-10-17",
      remaining: 13,
    };
    router.loaderData = confirmedHome(data);
    const home = await mount(<HomePage />);
    await expect
      .poll(() => home.container.querySelector("s-banner s-button")?.hasAttribute("disabled"))
      .toBe(false);
    const banner = home.container.querySelector("s-banner")!;
    expect(banner.querySelectorAll("s-paragraph")).toHaveLength(1);
    expect(banner.textContent).not.toContain(trialContinuityTexts(locale).approvalHelp);
    const plans = home.container.querySelector("#plans")!;
    expect(plans.textContent).toContain(copy.plan.firstCharge(formatDate("2026-10-17", locale)));
    expect(plans.textContent).toContain(copy.plan.oneTimeCharge);
    const prices = [...plans.querySelectorAll('s-heading[accessibilityRole="presentation"]')];
    expect(prices.map((price) => price.textContent)).toEqual(
      [data.plan.monthly, data.plan.annual, data.plan.one_time].map((price) =>
        formatMoney(price, locale),
      ),
    );
    for (const price of prices) {
      const number = surfaceRect(price);
      const period = surfaceRect(price.nextElementSibling!);
      expect(period.left).toBeGreaterThanOrEqual(number.right);
      expect(period.top).toBeLessThan(number.bottom);
      expect(period.right).toBeLessThanOrEqual(window.innerWidth);
    }
    if (width === 390)
      expect(surfaceRect(banner).bottom - surfaceRect(banner).top).toBeLessThan(180);
    await page.screenshot({
      path: screenshotPath(
        `__screenshots__/visual/group2-home-top-${locale}-${server.browser}-${width}.png`,
      ),
    });
    await page.screenshot({
      element: plans,
      path: screenshotPath(
        `__screenshots__/visual/group2-plans-${locale}-${server.browser}-${width}.png`,
      ),
    });
    window.scrollTo(0, 0);
    await captureSurface(
      home.container,
      `__screenshots__/visual/group2-home-${locale}-${server.browser}-${width}.png`,
    );
    await home.unmount();
    router.loaderData = {
      locale,
      shopDomain: "demo.myshopify.com",
      version: "fixture",
      diagnosticId: "123e4567-e89b-42d3-a456-426614174000",
      diagnostics: {},
    };
    const guide = await mount(<Guide />);
    const headingRange = document.createRange();
    headingRange.selectNodeContents(
      page.getByRole("heading", { name: copy.guide.faqHeading, exact: true }).element(),
    );
    const heading = headingRange.getBoundingClientRect();
    const action = surfaceRect(
      guide.container.querySelector('#faq s-button[slot="secondary-actions"]')!,
    );
    expect(heading.right).toBeLessThanOrEqual(window.innerWidth);
    expect(action.right).toBeLessThanOrEqual(window.innerWidth);
    expect(action.left >= heading.right || action.top >= heading.bottom).toBe(true);
    await act(async () => {
      await page.getByRole("button", { name: copy.guide.expandAll, exact: true }).click();
    });
    expect(guide.container.querySelectorAll("details:not([open])")).toHaveLength(0);
    await act(async () => {
      await page.getByRole("button", { name: copy.guide.collapseAll, exact: true }).click();
    });
    await page.screenshot({
      path: screenshotPath(
        `__screenshots__/visual/group2-guide-top-${locale}-${server.browser}-${width}.png`,
      ),
    });
    await captureSurface(
      guide.container,
      `__screenshots__/visual/group2-guide-${locale}-${server.browser}-${width}.png`,
    );
    await guide.unmount();
    for (const manual of [false, true]) {
      router.loaderData = {
        locale,
        duplicateError: null,
        configHash: "fixture",
        rules: manual ? { taxCode: "required_validated", pec: "unmanaged" } : DEFAULT_CONFIG.rules,
        messages: DEFAULT_CONFIG.messages,
        enabled: false,
        entitled: true,
        labelScopesGranted: true,
        labelState: {
          mode: manual ? "guided" : "off",
          managementEpoch: null,
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
          address2FormMode: null,
        },
        labelSnapshot: {
          revision: "fixture",
          locales: [
            { locale: "it", family: "it", name: "Italiano", primary: true, published: true },
          ],
          markets: [],
          issues: [],
          address2: { classification: "expected", hasMarketOverride: false },
          slots: [labelSlot({ name: "taxCode", capability: "guided" })],
        },
        guidedConfirmations: [],
        labelLoadError: null,
        checkoutSettingsUrl: "https://admin.shopify.com/store/demo/settings/checkout",
        storefrontUrl: "https://demo.myshopify.com",
      };
      const rules = await mount(<CheckoutRules />);
      const labels = rules.container.querySelector<HTMLElement>("#checkout-native-labels")!;
      const badge = labels.querySelector("summary s-badge")!;
      expect(badge.textContent).toBe(
        manual ? copy.rules.labels.statusManualRequired : copy.rules.labels.statusChoiceRequired,
      );
      expect(badge.getAttribute("tone")).toBe("warning");
      for (const element of badge.shadowRoot!.querySelectorAll<HTMLElement>("*")) {
        if (element.clientWidth > 0)
          expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth + 1);
      }
      await page.screenshot({
        element: labels,
        path: screenshotPath(
          `__screenshots__/visual/group2-labels-${manual ? "manual" : "choice"}-${locale}-${server.browser}-${width}.png`,
        ),
      });
      await captureSurface(
        rules.container,
        `__screenshots__/visual/group2-rules-${manual ? "manual" : "choice"}-${locale}-${server.browser}-${width}.png`,
      );
      await rules.unmount();
    }
  },
  30000,
);

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
  // V2-T2: intestazione di sezione nativa, come Home, Regole e Messaggi.
  expect(view.container.querySelector("#faq")!.getAttribute("heading")).toBe(
    texts("it").guide.faqHeading,
  );
  expect(
    page.getByRole("heading", { name: texts("it").guide.faqHeading, exact: true }).elements(),
  ).toHaveLength(1);
  const toggle = surfaceRect(view.container.querySelector("#faq s-button")!);
  expect(toggle.right).toBeLessThanOrEqual(window.innerWidth);
  expect(view.container.querySelector("#faq s-button")!.getAttribute("slot")).toBe(
    "secondary-actions",
  );
  expect(
    Number(getComputedStyle(summary.querySelector(".guide-faq__question")!).fontWeight),
  ).toBeLessThan(600);
  // G-B7: lo sfondo di hover non sporge oltre le linee divisorie.
  for (const entry of view.container.querySelectorAll<HTMLElement>(".guide-faq__entry")) {
    const box = entry.getBoundingClientRect();
    const target = entry.querySelector("summary")!.getBoundingClientRect();
    expect(target.left).toBeGreaterThanOrEqual(box.left);
    expect(target.right).toBeLessThanOrEqual(box.right);
  }
  // G-B6: sulle domande su più righe la seconda riga parte sotto la prima.
  await page.viewport(320, 844);
  const wrapped = [...view.container.querySelectorAll(".guide-faq__question")]
    .map((question) => {
      const range = document.createRange();
      range.selectNodeContents(question);
      return [...range.getClientRects()];
    })
    .find((lines) => new Set(lines.map((line) => Math.round(line.top))).size > 1)!;
  expect(wrapped).toBeDefined();
  expect(new Set(wrapped.map((line) => Math.round(line.left))).size).toBe(1);
  await page.viewport(390, 844);
  // P2-T9: chevron Polaris condiviso al posto del triangolo nativo del browser.
  expect(getComputedStyle(summary).listStyleType).toBe("none");
  expect(summary.querySelector('s-icon[type="chevron-down"]')).not.toBeNull();
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
  expect(getComputedStyle(summary).outlineStyle).not.toBe("none");
  expect(parseFloat(getComputedStyle(summary).outlineWidth)).toBeGreaterThan(0);
  expect(view.container.querySelector("#support")).not.toBeNull();
  const support = view.container.querySelector<HTMLElement>("#support")!;
  expect(support.getBoundingClientRect().height).toBeGreaterThan(100);
  expect(support.querySelector('s-button[icon="search"]')?.textContent).toBe(
    texts("it").guide.diagnosis.heading,
  );
  // G-B9: i bottoni della card Assistenza hanno la stessa larghezza.
  const widths = [...support.querySelectorAll("s-button")].map((button) =>
    Math.round(surfaceRect(button).right - surfaceRect(button).left),
  );
  expect(new Set(widths).size).toBe(1);
  // L'Admin embedded può coprire il bordo superiore: il salto deve lasciare visibile il titolo.
  const header = document.createElement("div");
  header.style.cssText = "position:fixed;inset:0 0 auto;height:80px;z-index:1000;background:white";
  document.body.append(header);
  await page
    .getByRole("button", {
      name: texts("it").guide.diagnosis.heading,
      exact: true,
    })
    .click();
  // G-B2: dopo il salto il titolo della sezione è in vista e la sezione ha il focus.
  const diagnosis = view.container.querySelector<HTMLElement>("#validation-diagnosis")!;
  expect(document.activeElement).toBe(diagnosis);
  await expect
    .poll(() => {
      const heading = diagnosis.querySelector(".guide-diagnosis__heading")!.getBoundingClientRect();
      return heading.top >= 80 && heading.bottom < 844;
    })
    .toBe(true);
  header.remove();
  await page.screenshot({
    path: screenshotPath(`__screenshots__/visual/guide-${server.browser}-390.png`),
  });
});

test("Polaris reale: messaggi multiriga interamente visibili e anteprima vicina al campo", async () => {
  await page.viewport(390, 844);
  for (const locale of ["it", "en"] as const) {
    router.loaderData = {
      locale,
      configHash: "fixture",
      messages: DEFAULT_CONFIG.messages,
      rules: { taxCode: "required_validated", pec: "required_validated" },
    };
    const view = await mount(<CustomerMessages />);
    const copy = texts(locale).messages;
    const textbox = page.getByRole("textbox", { name: copy.pecInvalid, exact: true });
    const input = textbox.element() as HTMLTextAreaElement;
    const host = view.container.querySelector(`s-text-area[name="${locale}.pecInvalid"]`)!;
    const local = host.parentElement!.querySelector<HTMLElement>(
      ".customer-messages-preview__local",
    )!;
    const value = "Riga di prova\n".repeat(12);
    await act(async () => {
      await textbox.fill(value);
    });
    await expect.poll(() => input.clientHeight >= input.scrollHeight - 1).toBe(true);
    expect(local.textContent).toContain(value);
    expect(getComputedStyle(local).display).toBe("block");
    await act(async () => {
      await textbox.fill("W".repeat(200));
    });
    await expect.poll(() => input.clientHeight >= input.scrollHeight - 1).toBe(true);
    await page.viewport(320, 844);
    await expect.poll(() => input.clientHeight >= input.scrollHeight - 1).toBe(true);
    await act(async () => {
      await textbox.fill("Testo breve");
    });
    await expect.poll(() => input.rows).toBe(2);
    await textbox.click();
    // L'anteprima si legge senza risalire al riquadro iniziale.
    expect(local.getBoundingClientRect().top).toBeGreaterThan(input.getBoundingClientRect().bottom);
    expect(local.getBoundingClientRect().bottom).toBeLessThan(window.innerHeight);
    await page.screenshot({
      path: screenshotPath(
        `__screenshots__/visual/messages-local-${locale}-${server.browser}-320.png`,
      ),
    });
    await page.viewport(1280, 844);
    await expect.poll(() => getComputedStyle(local).display).toBe("none");
    await view.unmount();
    await page.viewport(390, 844);
  }
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
    expect(preview.textContent?.match(/Esempio del messaggio/g)).toHaveLength(1);
    expect(preview.querySelector('s-icon[type="alert-circle"]')).toBeNull();
    const availability = preview.querySelector('s-icon[type="info"]')!.parentElement!;
    const iconBox = surfaceRect(availability.querySelector("s-icon")!);
    const textBox = surfaceRect(availability.querySelector("s-text")!);
    expect(textBox.left).toBeGreaterThanOrEqual(iconBox.right);
    expect(Math.abs(textBox.top - iconBox.top)).toBeLessThan(6);
    const field = page
      .getByRole("textbox", {
        name: texts("it").messages.taxCodeRequired,
        exact: true,
      })
      .element();
    expect(field.getBoundingClientRect().height).toBeGreaterThan(20);
    expect(preview.getBoundingClientRect().top).toBeLessThan(field.getBoundingClientRect().top);
    expect(preview.getBoundingClientRect().top).toBeLessThan(500);
    const it = texts("it").messages;
    // M1: la card dei campi ha un titolo.
    expect(
      messages.container.querySelector(`s-section[heading="${it.editorHeading}"]`),
    ).not.toBeNull();
    // M2: l'anteprima spiega come sceglie il messaggio; su desktop i campi stanno in due colonne.
    expect(preview.parentElement!.textContent).toContain(it.previewHint);
    const fieldTop = (name: string) =>
      page.getByRole("textbox", { name, exact: true }).element().getBoundingClientRect();
    if (width === 1280) {
      expect(fieldTop(it.pecRequired).top).toBe(fieldTop(it.taxCodeRequired).top);
      expect(fieldTop(it.pecRequired).left).toBeGreaterThan(fieldTop(it.taxCodeRequired).right);
    } else {
      expect(fieldTop(it.pecRequired).top).toBeGreaterThan(fieldTop(it.taxCodeInvalid).bottom);
    }
    // M3: con le regole predefinite il messaggio non è previsto e l'anteprima lo dice.
    expect(preview.textContent).toContain(it.previewNotShown);
    // M6: nessun badge di lingua nell'anteprima.
    expect(preview.textContent).not.toContain(it.italian);
    // M4: il contatore è sempre visibile, quindi il focus non sposta i campi sotto.
    const below = fieldTop(it.taxCodeInvalid).top + window.scrollY;
    expect(
      messages.container
        .querySelector('s-text-area[name="it.pecInvalid"]')!
        .getAttribute("details"),
    ).toBe(it.counter(DEFAULT_CONFIG.messages.it.pecInvalid.length));
    await page.getByRole("textbox", { name: it.taxCodeRequired, exact: true }).click();
    // WebKit arrotonda il bordo di focus Polaris a mezzo pixel; il difetto era di circa 20 px.
    expect(Math.abs(fieldTop(it.taxCodeInvalid).top + window.scrollY - below)).toBeLessThan(1);
    // M7, P2-T8: righe raggruppate per campo, ciascuna su una riga sola, badge neutri.
    const labels = [...messages.container.querySelectorAll<HTMLElement>(".cf-status-list__label")];
    const values = [...messages.container.querySelectorAll<HTMLElement>(".cf-status-list__value")];
    expect(labels.map((label) => label.textContent)).toEqual([
      it.shortLabels.taxCodeRequired,
      it.shortLabels.taxCodeInvalid,
      it.shortLabels.pecRequired,
      it.shortLabels.pecInvalid,
    ]);
    const heights = values.map((value) => Math.round(value.getBoundingClientRect().height));
    expect(new Set(heights).size).toBe(1);
    // Etichetta e badge della stessa riga condividono il centro verticale.
    labels.forEach((label, index) => {
      const labelRect = label.getBoundingClientRect();
      const valueRect = values[index].getBoundingClientRect();
      expect(
        Math.abs(labelRect.top + labelRect.height / 2 - valueRect.top - valueRect.height / 2),
      ).toBeLessThan(1);
    });
    expect(values[0].textContent).toContain(it.appearsNot);
    expect(
      values.every((value) => value.querySelector("s-badge")!.getAttribute("tone") === "neutral"),
    ).toBe(true);
    // M8: nella conferma la lingua è un nome comune, minuscolo.
    expect(
      messages.container.querySelector("s-modal#restore-en s-paragraph")!.textContent,
    ).toContain("messaggi in inglese");
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
    ).toContain(DEFAULT_CONFIG.messages.en.taxCodeRequired);
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
      const label = onboarding.container
        .querySelector(".cf-status-list__label")!
        .getBoundingClientRect();
      const value = onboarding.container
        .querySelector(".cf-status-list__value")!
        .getBoundingClientRect();
      expect(value.left).toBeGreaterThan(label.right);
      expect(Math.abs(value.top - label.top)).toBeLessThan(1);
    }
    for (const value of onboarding.container.querySelectorAll<HTMLElement>(
      ".cf-status-list__value",
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

test("Polaris reale: Regole con superfici native desktop e mobile", async () => {
  for (const width of [1280, 390, 320]) {
    await page.viewport(width, 844);
    router.loaderData = {
      locale: "it",
      duplicateError: null,
      configHash: "fixture",
      rules: DEFAULT_CONFIG.rules,
      messages: DEFAULT_CONFIG.messages,
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
    // R-B6: modalità, ultima lettura e conteggi sono righe nel pannello, non un pannello annidato.
    const technical = view.container.querySelector<HTMLElement>(".checkout-labels-technical")!;
    (technical.closest("details") as HTMLDetailsElement).open = true;
    expect(technical.closest("details")?.parentElement?.closest("details")).toBeNull();
    expect(technical.textContent).toContain(texts("it").rules.labels.modeValues.partial);
    const rows = [...technical.querySelectorAll("s-stack s-stack > s-text")];
    expect(rows).toHaveLength(3);
    const rowRects = rows.map(surfaceRect);
    for (let index = 1; index < rows.length; index++) {
      expect(rowRects[index].top - rowRects[index - 1].bottom).toBeGreaterThanOrEqual(4);
    }
    // R-B9: le card delle regole e "Etichette del checkout" hanno lo stesso spazio sopra il primo campo.
    const firstFieldOffset = (section: Element, field: Element) =>
      surfaceRect(field).top - surfaceRect(section).top;
    const labelsSection = view.container.querySelector(".rules-layout__labels s-section")!;
    const ruleOffset = firstFieldOffset(ruleCards[0], ruleCards[0].querySelector("s-choice-list")!);
    expect(firstFieldOffset(ruleCards[1], ruleCards[1].querySelector("s-choice-list")!)).toBe(
      ruleOffset,
    );
    expect(firstFieldOffset(labelsSection, labelsSection.querySelector("s-select")!)).toBe(
      ruleOffset,
    );
    expect(view.container.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
    await captureSurface(
      view.container,
      `__screenshots__/visual/rules-${server.browser}-${width}.png`,
    );
    await view.unmount();
  }
});

test("Polaris reale: gruppo 1, etichette e messaggi IT/EN desktop e 390 px", async () => {
  for (const locale of ["it", "en"] as const) {
    for (const width of [1280, 390]) {
      await page.viewport(width, 844);
      const rules = { taxCode: "required_validated", pec: "required_when_company" } as const;
      router.loaderData = {
        ...onboardingData,
        locale,
        rules,
        configHash: "fixture",
        duplicateError: null,
        labelScopesGranted: true,
        labelLoadError: null,
        guidedConfirmations: [],
        labelState: {
          ...onboardingData.labelState,
          mode: "guided",
          decision: "pending",
          address2FormMode: "optional",
          address2Decision: "pending",
        },
        labelSnapshot: {
          revision: "fixture",
          locales: [{ locale, primary: true, published: true }],
          markets: [
            {
              id: "gid://shopify/Market/1",
              name: "Italy",
              defaultLocale: locale,
              locales: [locale],
              resolution: "ambiguous",
            },
          ],
          issues: [],
          address2: { classification: "expected", hasMarketOverride: false },
          slots: [
            labelSlot({
              name: "taxCode",
              key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
              locale,
              family: locale,
              currentValue: "Codice fiscale (opzionale)",
            }),
            labelSlot({
              name: "pec",
              key: "shopify.checkout.localized_fields.additional_information.tax_email_it",
              locale,
              family: locale,
              currentValue: "PEC (opzionale)",
            }),
            labelSlot({ locale, family: locale, currentValue: "Interno" }),
          ],
        },
        checkoutSettingsUrl: "https://admin.shopify.com/store/demo/settings/checkout",
        storefrontUrl: "https://demo.myshopify.com",
      };
      const labels = await mount(<CheckoutRules />);
      for (const disclosure of labels.container.querySelectorAll<HTMLDetailsElement>(
        ".rules-layout__labels details",
      ))
        disclosure.open = true;
      for (const badge of labels.container.querySelectorAll(".checkout-labels-title s-badge")) {
        for (const element of badge.shadowRoot!.querySelectorAll<HTMLElement>("*")) {
          if (element.textContent === badge.textContent && element.clientWidth > 0) {
            expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth + 1);
          }
        }
      }
      expect(labels.container.querySelector(".checkout-label-context")).not.toBeNull();
      for (const context of labels.container.querySelectorAll<HTMLElement>(
        ".checkout-label-context",
      )) {
        expect(context.scrollWidth).toBeLessThanOrEqual(context.clientWidth + 1);
        const limit = context.getBoundingClientRect().right;
        for (const element of context.querySelectorAll("s-text, s-badge, s-ordered-list")) {
          expect(surfaceRect(element).right).toBeLessThanOrEqual(limit + 1);
        }
      }
      expect(labels.container.scrollWidth).toBeLessThanOrEqual(width);
      await captureSurface(
        labels.container,
        `__screenshots__/visual/gruppo1-labels-${locale}-${server.browser}-${width}.png`,
      );
      await labels.unmount();

      router.loaderData = {
        locale,
        configHash: "fixture",
        rules,
        messages: DEFAULT_CONFIG.messages,
      };
      const messages = await mount(<CustomerMessages />);
      const availability = messages.container.querySelector('s-icon[type="info"]')!.parentElement!;
      const iconBox = surfaceRect(availability.querySelector("s-icon")!);
      const textBox = surfaceRect(availability.querySelector("s-text")!);
      expect(textBox.left).toBeGreaterThanOrEqual(iconBox.right);
      expect(Math.abs(textBox.top - iconBox.top)).toBeLessThan(6);
      expect(messages.container.textContent).toContain(texts(locale).messages.previewHint);
      await captureSurface(
        messages.container,
        `__screenshots__/visual/gruppo1-messages-${locale}-${server.browser}-${width}.png`,
      );
      await messages.unmount();

      router.loaderData = { ...onboardingData, locale, rules, step: 3 };
      const onboarding = await mount(<Onboarding />);
      expect(
        onboarding.container.querySelectorAll(".customer-messages-preview__error"),
      ).toHaveLength(4);
      expect(onboarding.container.textContent).toContain(texts(locale).messages.previewHint);
      expect(
        onboarding.container.querySelector('.onboarding-message s-icon[type="alert-circle"]'),
      ).toBeNull();
      await captureSurface(
        onboarding.container,
        `__screenshots__/visual/gruppo1-onboarding-${locale}-${server.browser}-${width}.png`,
      );
      await onboarding.unmount();

      router.loaderData = {
        locale,
        shopDomain: "demo.myshopify.com",
        version: "2.0.2",
        diagnosticId: "123e4567-e89b-42d3-a456-426614174000",
        diagnostics: {},
      };
      const guide = await mount(<Guide />);
      for (const disclosure of guide.container.querySelectorAll<HTMLDetailsElement>(
        ".guide-faq__entry",
      ))
        disclosure.open = true;
      expect(guide.container.querySelector(".guide-faq__entries s-divider")).not.toBeNull();
      expect(guide.container.scrollWidth).toBeLessThanOrEqual(width);
      await captureSurface(
        guide.container,
        `__screenshots__/visual/gruppo1-guide-${locale}-${server.browser}-${width}.png`,
      );
      await guide.unmount();
    }
  }
}, 30000);

test("Polaris reale: il banner di esito resta separato dalle card che seguono", async () => {
  await page.viewport(1280, 844);
  const view = await mount(
    <s-page heading="Regole">
      <RevealBanner tone="warning">{texts("it").rules.labelsSaved}</RevealBanner>
      <s-section heading="Card">
        <s-paragraph>Contenuto</s-paragraph>
      </s-section>
    </s-page>,
  );
  const banner = surfaceRect(view.container.querySelector("s-banner")!);
  const card = surfaceRect(view.container.querySelector("s-section")!);
  expect(card.top - banner.bottom).toBeGreaterThanOrEqual(16);
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
  const simulatorLanguage = view.container.querySelector("s-query-container > div")!;
  expect(simulatorLanguage.getAttribute("lang")).toBe("it");
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
  expect(view.container.textContent).toContain(texts("en").rules.simulator.heading);
  expect(simulatorLanguage.getAttribute("lang")).toBe("en");
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
  // R-B1: la riga scenario e "Continua" hanno gli stessi bordi dei campi sopra.
  const simulator = texts("en").rules.simulator;
  const delivery = surfaceRect(
    view.container.querySelector(`s-select[label="${simulator.deliveryCountry}"]`)!,
  );
  const billing = surfaceRect(
    view.container.querySelector(`s-select[label="${simulator.billingCountry}"]`)!,
  );
  const scenario = surfaceRect(
    view.container.querySelector(".checkout-simulator__scenario s-select")!,
  );
  expect(scenario.left).toBe(delivery.left);
  expect(
    surfaceRect(view.container.querySelector(".checkout-simulator__button--primary")!).right,
  ).toBe(billing.right);
  // R-S1: l'esito sta subito sopra "Continua", allineato al bottone, e non più nell'intestazione.
  const button = view.container.querySelector<HTMLElement>(".checkout-simulator__button--primary")!;
  const outcome = surfaceRect(
    view.container.querySelector(".checkout-simulator__outcome s-badge")!,
  );
  expect(
    view.container.querySelector("s-query-container s-heading")!.closest("s-grid")!.textContent,
  ).toBe(simulator.heading);
  expect(outcome.left).toBe(surfaceRect(button).left);
  expect(surfaceRect(button).top - outcome.bottom).toBeGreaterThanOrEqual(0);
  expect(surfaceRect(button).top - outcome.bottom).toBeLessThanOrEqual(12);
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
  await act(async () => {
    await page
      .getByRole("combobox", { name: texts("en").rules.simulator.previewLanguage })
      .selectOptions("it");
  });
  expect(simulatorLanguage.getAttribute("lang")).toBe("it");
  expect(view.container.textContent).toContain(texts("it").rules.simulator.heading);
});

test("Polaris reale: Continua porta in vista e mette a fuoco il primo campo in errore", async () => {
  await page.viewport(390, 360);
  const view = await mount(
    <CheckoutSimulator
      locale="it"
      rules={{ taxCode: "required_validated", pec: "required_validated" }}
      messages={DEFAULT_CONFIG.messages}
    />,
  );
  const [taxCode] = view.container.querySelectorAll("s-text-field");
  const button = view.container.querySelector<HTMLElement>(".checkout-simulator__button--primary")!;
  button.scrollIntoView({ block: "end" });
  await page.elementLocator(button).click();
  // R-S2: lo spostamento dovuto agli errori porta l'utente sul campo da correggere.
  await expect.poll(() => document.activeElement).toBe(taxCode);
  await expect
    .poll(() => {
      const field = surfaceRect(taxCode);
      return field.top >= 0 && field.bottom <= window.innerHeight;
    })
    .toBe(true);
  expect(view.container.querySelector(".checkout-simulator__outcome")!.textContent).toBe(
    texts("it").rules.simulator.outcomes.blocked,
  );
});

test("Polaris reale: onboarding stretto, avanzamento visivo e passo 3 a blocchi", async () => {
  await page.viewport(1280, 844);
  const it = texts("it");
  router.loaderData = { ...onboardingData, step: 1 };
  const view = await mount(<Onboarding />);
  // O1: pagina stretta nativa, righe di testo più corte.
  const card = surfaceRect(view.container.querySelector("s-section")!);
  expect(card.right - card.left).toBeLessThan(800);
  // O5: barra di avanzamento oltre al testo "Passo 1 di 4".
  const progress = view.container.querySelector("s-progress")!;
  expect(progress.getAttribute("value")).toBe("1");
  expect(progress.getAttribute("max")).toBe("4");
  // O4, N-3: solo il marchio piccolo accanto al titolo di benvenuto, senza avatar né fondo.
  expect(view.container.querySelectorAll(".onboarding-step s-image")).toHaveLength(1);
  expect(view.container.querySelector("s-avatar")).toBeNull();
  const welcome = [...view.container.querySelectorAll(".onboarding-step s-heading")].find(
    (heading) => heading.textContent === it.onboarding.welcomeHeading,
  )!;
  const mark = welcome.closest("s-grid")!.querySelector('s-image[src="/cf-ready-mark.svg"]')!;
  expect(mark).not.toBeNull();
  expect(surfaceRect(mark).right - surfaceRect(mark).left).toBeLessThanOrEqual(32);
  await view.unmount();

  // O7: con i permessi concessi non resta la frase tecnica.
  router.loaderData = { ...onboardingData, step: 2, labelScopesGranted: true };
  const step2 = await mount(<Onboarding />);
  expect(step2.container.textContent).not.toContain("permessi per confrontare le etichette");
  // Il titolo di Codice Fiscale sta vicino alle sue opzioni, come nelle card di Regole.
  const taxHeading = [...step2.container.querySelectorAll(".onboarding-step s-heading")].find(
    (heading) => heading.textContent === it.rules.taxCodeLabel,
  )!;
  const choices = step2.container.querySelector(".onboarding-step s-choice-list")!;
  // Distanza dal titolo al primo radio, come nelle card di Regole (prima 16 px di griglia).
  const radio = [choices, ...choices.querySelectorAll("s-choice")]
    .flatMap((element) => [...(element.shadowRoot?.querySelectorAll("*") ?? [])])
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.width < 40)
    .sort((a, b) => a.top - b.top)[0];
  expect(radio.top - surfaceRect(taxHeading).bottom).toBeLessThanOrEqual(12);
  await step2.unmount();

  // O2, O3: ogni messaggio è un blocco con etichetta e anteprima, separato dagli altri.
  router.loaderData = { ...onboardingData, step: 3 };
  const step3 = await mount(<Onboarding />);
  const blocks = [...step3.container.querySelectorAll<HTMLElement>(".onboarding-message")];
  expect(blocks).toHaveLength(4);
  for (const block of blocks) {
    expect(block.querySelector(".customer-messages-preview__error")).not.toBeNull();
  }
  const inside =
    blocks[0].querySelector(".customer-messages-preview__error")!.getBoundingClientRect().top -
    surfaceRect(blocks[0].querySelector("s-badge")!).bottom;
  const between = blocks[1].getBoundingClientRect().top - blocks[0].getBoundingClientRect().bottom;
  expect(between).toBeGreaterThan(inside);
  await step3.unmount();

  // EN2: a 1200 px il riepilogo inglese sta su una riga e i valori restano allineati.
  await page.viewport(1200, 844);
  router.loaderData = {
    ...onboardingData,
    locale: "en",
    step: 4,
    completed: true,
    enabled: true,
    entitled: true,
    entitlementKind: "one_time",
    labelState: { ...onboardingData.labelState, address2Classification: "expected" },
  };
  const step4 = await mount(<Onboarding />);
  const rows = [...step4.container.querySelectorAll<HTMLElement>(".cf-status-list__label")];
  expect(rows.length).toBeGreaterThan(2);
  for (const label of rows) {
    const range = document.createRange();
    range.selectNodeContents(label);
    expect(new Set([...range.getClientRects()].map((line) => Math.round(line.top))).size).toBe(1);
  }
  const lefts = [...step4.container.querySelectorAll<HTMLElement>(".cf-status-list__value")].map(
    (value) => Math.round(value.getBoundingClientRect().left),
  );
  expect(new Set(lefts).size).toBe(1);
  await captureSurface(
    step4.container,
    `__screenshots__/visual/onboarding-step4-en-${server.browser}-1200.png`,
  );
  await step4.unmount();
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
  // Da tastiera Chrome mostrerebbe il contorno sul contenitore che riceve il focus.
  (
    page
      .getByRole("button", { name: texts("it").onboarding.next, exact: true })
      .element() as HTMLElement
  ).focus();
  await act(async () => {
    await userEvent.keyboard("{Enter}");
  });
  const step4 = view.container.querySelector<HTMLElement>(".onboarding-step")!;
  expect(step4.textContent).toContain(texts("it").onboarding.step4Heading);
  expect(document.activeElement).toBe(step4);
  expect(getComputedStyle(step4).outlineStyle).toBe("none");
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

// Bordo sinistro della prima card della colonna principale, misurato sulla superficie bianca.
function firstMainCardLeft(container: HTMLElement) {
  const section = [...container.querySelectorAll("s-section")].find(
    (candidate) => !candidate.closest('[slot="aside"]'),
  )!;
  const surface = [...section.shadowRoot!.querySelectorAll<HTMLElement>("*")].find(
    (element) =>
      element.getBoundingClientRect().width > 100 &&
      getComputedStyle(element).backgroundColor === "rgb(255, 255, 255)",
  )!;
  return surface.getBoundingClientRect().left;
}

// Un caso per lingua e larghezza: con l'instrumentazione coverage un caso unico supera il timeout.
test.each([
  ["it", 1440],
  ["it", 1054],
  ["it", 500],
  ["en", 1440],
  ["en", 1054],
  ["en", 500],
] as const)(
  "Polaris reale: P2, stesso impianto di pagina e logo unico, %s a %i px",
  async (locale, width) => {
    await page.viewport(width, 900);
    const lefts: Record<string, number> = {};

    const homeFixture = {
      ...homeData,
      locale,
      onboarding: "completed",
      rules: { taxCode: "required_validated", pec: "required_when_company" },
    };
    router.loaderData = confirmedHome(homeFixture);
    const home = await mount(<HomePage />);
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
    lefts.home = firstMainCardLeft(home.container);
    // P2-T4: le regole configurate sono valori, non esiti.
    const ruleBadges = [...home.container.querySelectorAll(".cf-status-list__value s-badge")];
    expect(ruleBadges).toHaveLength(3);
    expect(ruleBadges.every((badge) => badge.getAttribute("tone") === "neutral")).toBe(true);
    // P2-T5: lockup a 128 px, allineato al testo della colonna laterale.
    const lockup = home.container.querySelector('s-image[src="/cf-ready-lockup.svg"]')!;
    const lockupRect = surfaceRect(lockup);
    expect(Math.round(lockupRect.right - lockupRect.left)).toBe(128);
    const asideText = surfaceRect(home.container.querySelector('[slot="aside"] s-paragraph')!);
    expect(Math.abs(lockupRect.left - asideText.left)).toBeLessThan(1);
    await captureSurface(
      home.container,
      `__screenshots__/visual/p2-home-${locale}-${server.browser}-${width}.png`,
    );
    await home.unmount();

    router.loaderData = {
      locale,
      duplicateError: null,
      configHash: "fixture",
      rules: { taxCode: "required_validated", pec: "optional_validated" },
      messages: DEFAULT_CONFIG.messages,
      enabled: true,
      entitled: true,
      labelScopesGranted: true,
      labelState: onboardingData.labelState,
      labelSnapshot: null,
      guidedConfirmations: [],
      labelLoadError: null,
      checkoutSettingsUrl: "https://admin.shopify.com/store/demo/settings/checkout",
      storefrontUrl: "https://demo.myshopify.com",
    };
    const rules = await mount(<CheckoutRules />);
    lefts.rules = firstMainCardLeft(rules.container);
    // P2-T1: il simulatore sta nella colonna laterale nativa, accanto o sotto le regole.
    const simulator = rules.container.querySelector<HTMLElement>("#simulatore")!;
    expect(simulator.closest('[slot="aside"]')).not.toBeNull();
    const labels = rules.container.querySelector<HTMLElement>(".rules-layout__labels")!;
    if (width >= 1054) {
      expect(simulator.getBoundingClientRect().left).toBeGreaterThan(
        labels.getBoundingClientRect().right,
      );
    } else {
      expect(simulator.getBoundingClientRect().top).toBeGreaterThan(
        labels.getBoundingClientRect().bottom,
      );
    }
    expect(rules.container.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
    // N-3: marchio senza fondo, niente avatar.
    expect(rules.container.querySelector("s-avatar")).toBeNull();
    expect(rules.container.querySelector('s-image[src="/cf-ready-mark.svg"]')).not.toBeNull();
    await captureSurface(
      rules.container,
      `__screenshots__/visual/p2-rules-${locale}-${server.browser}-${width}.png`,
    );
    await rules.unmount();

    router.loaderData = {
      locale,
      configHash: "fixture",
      messages: DEFAULT_CONFIG.messages,
      rules: DEFAULT_CONFIG.rules,
    };
    const messages = await mount(<CustomerMessages />);
    lefts.messages = firstMainCardLeft(messages.container);
    await captureSurface(
      messages.container,
      `__screenshots__/visual/p2-messages-${locale}-${server.browser}-${width}.png`,
    );
    await messages.unmount();

    router.loaderData = {
      locale,
      shopDomain: "demo.myshopify.com",
      version: "2.0.5",
      diagnosticId: "123e4567-e89b-42d3-a456-426614174000",
      diagnostics: {},
    };
    const guide = await mount(<Guide />);
    lefts.guide = firstMainCardLeft(guide.container);
    const guideLockup = guide.container.querySelector('s-image[src="/cf-ready-lockup.svg"]')!;
    const guideLockupRect = surfaceRect(guideLockup);
    expect(Math.round(guideLockupRect.right - guideLockupRect.left)).toBe(128);
    await captureSurface(
      guide.container,
      `__screenshots__/visual/p2-guide-${locale}-${server.browser}-${width}.png`,
    );
    await guide.unmount();

    // P2-T1: passando da una pagina all'altra il bordo sinistro non si sposta.
    for (const left of Object.values(lefts)) expect(Math.abs(left - lefts.home)).toBeLessThan(1);
  },
  30000,
);

test("Polaris reale: P2-T9, chevron nativo allineato anche nel disclosure annidato", async () => {
  await page.viewport(1054, 900);
  const view = await mount(
    <div style={{ inlineSize: "480px" }}>
      <Disclosure panel summary={<s-heading>Testi del checkout</s-heading>}>
        <Disclosure summary={<s-text type="strong">Come completare la verifica manuale</s-text>}>
          <s-paragraph>Passi della procedura.</s-paragraph>
        </Disclosure>
      </Disclosure>
    </div>,
  );
  const [outer, inner] = [...view.container.querySelectorAll("details")];
  const iconRight = (details: HTMLDetailsElement) =>
    [
      ...details
        .querySelector(":scope > summary")!
        .querySelectorAll<HTMLElement>(".cf-disclosure__icon"),
    ]
      .find((icon) => getComputedStyle(icon).display !== "none")!
      .getBoundingClientRect().right;
  const closedHeight = outer.querySelector("summary")!.getBoundingClientRect().height;
  await act(async () => {
    outer.open = true;
    inner.open = true;
  });
  expect(outer.querySelector("summary")!.getBoundingClientRect().height).toBe(closedHeight);
  expect(Math.abs(iconRight(outer) - iconRight(inner))).toBeLessThan(1);
  expect(
    outer.querySelector(":scope > summary .cf-disclosure__icon--open s-icon")!.getAttribute("type"),
  ).toBe("chevron-up");
  await view.unmount();
});
