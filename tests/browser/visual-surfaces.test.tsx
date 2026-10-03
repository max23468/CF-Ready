import { act } from "react";
import { beforeAll, expect, inject, test } from "vitest";
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
import { RevealBanner } from "../../app/ui-feedback";
import { polarisUrlForEnvironment } from "../../app/shopify-ui";
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
      gridSurface.getBoundingClientRect().width > 300 ? 2 : 1,
    );
    // T5: anche la PEC obbligatoria per aziende è un badge azzurro, senza troncamenti.
    const pecBadge = [...view.container.querySelectorAll("s-badge")].find(
      (badge) => badge.textContent === texts("it").home.pecRequiredForCompanies,
    );
    expect(pecBadge?.getAttribute("tone")).toBe("info");
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
  // G-B5: titolo nativo e domande senza grassetto; "Espandi tutte" a destra del titolo.
  const faqHeading = view.container.querySelector("#faq s-heading")!;
  expect(faqHeading.textContent).toBe(texts("it").guide.faqHeading);
  expect(
    page.getByRole("heading", { name: texts("it").guide.faqHeading, exact: true }).elements(),
  ).toHaveLength(1);
  const toggle = surfaceRect(view.container.querySelector("#faq s-button")!);
  const headingBox = surfaceRect(faqHeading);
  expect(toggle.left).toBeGreaterThan(headingBox.right);
  expect(toggle.top).toBeLessThan(headingBox.bottom);
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
  // Freccia condivisa al posto del triangolo nativo del browser.
  expect(getComputedStyle(summary).listStyleType).toBe("none");
  expect(getComputedStyle(summary, "::after").content).toBe('""');
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
    // M7: righe raggruppate per campo, ciascuna su una riga sola.
    const rows = [...messages.container.querySelectorAll<HTMLElement>(".cf-data-row")];
    expect(rows.map((row) => row.querySelector("s-text")!.textContent)).toEqual([
      it.shortLabels.taxCodeRequired,
      it.shortLabels.taxCodeInvalid,
      it.shortLabels.pecRequired,
      it.shortLabels.pecInvalid,
    ]);
    const heights = rows.map((row) => Math.round(row.getBoundingClientRect().height));
    expect(new Set(heights).size).toBe(1);
    expect(rows[0].textContent).toContain(it.appearsNot);
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
      expect(value.left).toBeGreaterThan(label.left);
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
  // O4: icona piccola accanto al titolo di benvenuto, niente logo grande sopra.
  expect(view.container.querySelector(".onboarding-step s-image")).toBeNull();
  const welcome = [...view.container.querySelectorAll(".onboarding-step s-heading")].find(
    (heading) => heading.textContent === it.onboarding.welcomeHeading,
  )!;
  expect(welcome.closest("s-grid")!.querySelector("s-avatar")).not.toBeNull();
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
  const rows = [...step4.container.querySelectorAll<HTMLElement>(".cf-onboarding-summary-row")];
  expect(rows.length).toBeGreaterThan(2);
  for (const row of rows) {
    const label = row.firstElementChild!;
    const range = document.createRange();
    range.selectNodeContents(label);
    expect(new Set([...range.getClientRects()].map((line) => Math.round(line.top))).size).toBe(1);
  }
  const lefts = rows.map((row) =>
    Math.round(row.querySelector(".cf-onboarding-summary-value")!.getBoundingClientRect().left),
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
