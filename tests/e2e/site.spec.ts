import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const notFoundHtml = {
  it: readFileSync(new URL("../../site/404.html", import.meta.url), "utf8"),
  en: readFileSync(new URL("../../site/en/404.html", import.meta.url), "utf8"),
};

test("lo scrollspy non indica Home nelle sezioni prive di una voce del menu", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const section = document.getElementById("come-funziona")!;
    const bottom = section.getBoundingClientRect().bottom + scrollY;
    window.scrollTo({ top: bottom + 20 - innerHeight / 2, behavior: "instant" });
  });
  await expect(page.locator(".masthead nav [aria-current]")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(page.locator('.masthead nav a[href="#top"]')).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("404 con una sola lingua e recupero coerente con il percorso", async ({ page }) => {
  // Vite non applica la 404 di Pages, che serve il 404.html più vicino al percorso:
  // serviamo lo stesso documento all'URL mancante.
  await page.route(/\/audit-not-found$/, (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/html",
      body: new URL(route.request().url()).pathname.startsWith("/en/")
        ? notFoundHtml.en
        : notFoundHtml.it,
    }),
  );
  for (const [locale, missing, heading, title, links] of [
    [
      "en",
      "/en/audit-not-found",
      "This page isn’t here.",
      "Page not found | CF Ready",
      [
        ["Return Home", "/en/"],
        ["Read the guides", "/en/guides/required-codice-fiscale-shopify-checkout"],
      ],
    ],
    [
      "it",
      "/audit-not-found",
      "Questa pagina non c’è.",
      "Pagina non trovata | CF Ready",
      [
        ["Torna alla Home", "/"],
        ["Consulta le guide", "/guide/codice-fiscale-obbligatorio-shopify"],
      ],
    ],
  ] as const) {
    for (const [name, path] of links) {
      const response = await page.goto(missing);
      expect(response?.status()).toBe(404);
      await expect(page).toHaveTitle(title);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.getByRole("main").getByRole("link")).toHaveCount(2);
      const paragraph = await page.locator("main .lede").boundingBox();
      const actions = await page.locator("main .actions").boundingBox();
      expect(actions!.y - (paragraph!.y + paragraph!.height)).toBeGreaterThanOrEqual(32);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const footer = await page.locator("footer").boundingBox();
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(pageHeight).toBeGreaterThanOrEqual(page.viewportSize()!.height);
      expect(footer!.y + footer!.height).toBeCloseTo(pageHeight, 0);
      const link = page.getByRole("main").getByRole("link", { name, exact: true });
      await expect(link).toHaveAttribute("href", path);
      const target = new URL(path, page.url()).href;
      await link.click();
      await expect(page).toHaveURL(target);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
    }
  }
});

test.describe("404 senza JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("ogni lingua è già nel documento, senza testi mescolati", async ({ page }) => {
    await page.route(/\/audit-not-found$/, (route) =>
      route.fulfill({ status: 404, contentType: "text/html", body: notFoundHtml.it }),
    );
    await page.goto("/audit-not-found");
    await expect(page.locator("html")).toHaveAttribute("lang", "it");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Questa pagina non c’è.");
    await expect(page.getByRole("heading", { name: "This page isn’t here." })).toHaveCount(0);
    await page
      .getByRole("main")
      .getByRole("link", { name: "Torna alla Home", exact: true })
      .click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test("testata desktop con logo, menu e pulsanti allineati", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) <= 832);
  for (const path of ["/", "/en/"]) {
    await page.goto(path);
    const centers = await page.locator(".masthead img, .masthead nav a").evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return rect.y + rect.height / 2;
      }),
    );
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
  }
});

test("sito pubblico bilingue e percorsi essenziali", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("CF Ready | Codice Fiscale obbligatorio nel checkout Shopify");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Codice Fiscale obbligatorio e validato nel checkout.",
    }),
  ).toBeVisible();
  const skipLink = page.getByRole("link", { name: "Vai al contenuto" });
  await page.keyboard.press(process.platform === "darwin" ? "Alt+Tab" : "Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#content")).toBeFocused();
  await expect(page.getByRole("link", { name: /Installa su Shopify/ }).first()).toHaveAttribute(
    "href",
    "https://apps.shopify.com/cf-ready",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.locator("a.shot-link")).toHaveCount(3);
  await page.locator(".product-detail summary").first().click();
  await expect(page.locator(".product-detail img").first()).toBeVisible();
  await page.locator(".product-detail summary").first().press("Enter");
  await page.locator(".faq summary").first().click();
  await expect(page.locator(".faq details").first()).toHaveAttribute("open", "");
  await page.locator(".faq summary").first().press("Enter");
  await expect(page.locator(".faq details").first()).not.toHaveAttribute("open", "");
  await page.evaluate(() => window.scrollTo(0, 0));
  const masthead = page.locator(".masthead");
  const homeLink = masthead.getByRole("link", { name: "Home", exact: true, includeHidden: true });
  const howLink = masthead.getByRole("link", {
    name: "Come funziona",
    exact: true,
    includeHidden: true,
  });
  await expect(homeLink).toHaveAttribute("aria-current", "true");
  // La barra di avanzamento è decorativa e la muove il CSS, non uno script.
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.locator(".reading-progress")).toHaveAttribute("aria-hidden", "true");
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
  });
  // Lo stato del menu è quello del popover nativo: `aria-expanded` lo espone il
  // browser all'albero di accessibilità, non un attributo nel DOM.
  const menu = masthead.getByRole("button", { name: "Menu", exact: true });
  const navigationList = page.locator("#public-navigation");
  const menuOpen = () => navigationList.evaluate((element) => element.matches(":popover-open"));
  const mobileInstallCta = page.locator("[data-mobile-install-cta]");
  const mobile = (page.viewportSize()?.width ?? 1440) <= 832;
  await expect(mobileInstallCta).toBeHidden();
  if (mobile) {
    await expect(menu).toBeVisible();
    await expect(howLink).not.toBeVisible();
    expect((await masthead.boundingBox())!.height).toBeLessThan(90);
    await menu.click();
    await expect.poll(menuOpen).toBe(true);
    await expect(howLink).toBeVisible();
    // Voci su due colonne, alte almeno 44px su touch, in un pannello compatto
    // sotto la testata. WebKit restituisce misure con frazioni di pixel (43,99999):
    // la tolleranza di mezzo pixel non lascia passare un bersaglio davvero più basso.
    const howBox = (await howLink.boundingBox())!;
    expect(howBox.height).toBeGreaterThanOrEqual(43.5);
    expect(howBox.width).toBeGreaterThan(page.viewportSize()!.width * 0.35);
    // La dissolvenza d'ingresso parte 0.5rem più in alto: si misura a fine corsa.
    const mastheadHeight = (await masthead.boundingBox())!.height;
    await expect
      .poll(async () => (await navigationList.boundingBox())!.y)
      .toBeGreaterThanOrEqual(mastheadHeight - 1);
    const panel = (await navigationList.boundingBox())!;
    expect(panel.height).toBeLessThan(page.viewportSize()!.height * 0.4);
    await page.mouse.click(10, 600);
    await expect.poll(menuOpen).toBe(false);
    await expect(howLink).not.toBeVisible();
    // Da tastiera: Invio apre, Esc chiude e il focus resta sul pulsante (WebKit
    // non porta il focus su un pulsante cliccato, quindi si parte dal focus).
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect.poll(menuOpen).toBe(true);
    await page.keyboard.press("Escape");
    await expect.poll(menuOpen).toBe(false);
    await expect(menu).toBeFocused();
    await expect(howLink).not.toBeVisible();
    await menu.click();
  } else {
    await expect(menu).not.toBeVisible();
  }
  await howLink.click();
  if (mobile) await expect.poll(menuOpen).toBe(false);
  await expect(page).toHaveURL(/#come-funziona$/);
  await expect(page.locator("#come-funziona")).toHaveAttribute("tabindex", "-1");
  await expect.poll(() => howLink.getAttribute("aria-current")).toBe("true");
  await expect(homeLink).not.toHaveAttribute("aria-current", /.*/);

  await page.locator("#content").focus();
  const scrollState = await page.evaluate(async () => {
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event("scroll"));
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    window.scrollTo(0, 800);
    window.dispatchEvent(new Event("scroll"));
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const header = document.querySelector(".masthead");
    return {
      focusInside: header?.contains(document.activeElement),
      mobile: window.matchMedia("(max-width: 52rem)").matches,
      scrollY: window.scrollY,
    };
  });
  expect(scrollState.focusInside).toBe(false);
  expect(scrollState.scrollY).toBeGreaterThan(240);
  if (page.viewportSize()?.width === 390) {
    expect(scrollState.mobile).toBe(true);
    await expect(masthead).toHaveClass(/is-hidden/);
    await expect(mobileInstallCta).toBeVisible();
    await expect(mobileInstallCta).toHaveCSS("position", "fixed");
    await menu.focus();
    await expect(masthead).not.toHaveClass(/is-hidden/);
    await page.locator("[data-install-cta-end]").scrollIntoViewIfNeeded();
    await expect(mobileInstallCta).toBeHidden();
  } else {
    expect(scrollState.mobile).toBe(false);
    await expect(masthead).not.toHaveClass(/is-hidden/);
  }

  if (mobile) await menu.click();
  await page.getByRole("link", { name: "EN", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page).toHaveTitle("CF Ready | Required Codice Fiscale at Shopify checkout");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Make Codice Fiscale required and validated at checkout.",
    }),
  ).toBeVisible();

  for (const path of [
    "/support",
    "/privacy",
    "/terms",
    "/en/support",
    "/en/privacy",
    "/en/terms",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
  }
});
