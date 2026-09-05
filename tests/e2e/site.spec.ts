import { expect, test } from "@playwright/test";

test("sito pubblico bilingue e percorsi essenziali", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("CF Ready | Codice Fiscale obbligatorio nel checkout");

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
  await expect(homeLink).toHaveAttribute("aria-current", "location");
  await expect(page.getByRole("progressbar")).toHaveJSProperty("value", 0);
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
  });
  const menu = masthead.getByRole("button", { name: "Menu", exact: true });
  const mobile = (page.viewportSize()?.width ?? 1440) <= 832;
  if (mobile) {
    await expect(menu).toBeVisible();
    await expect(howLink).not.toBeVisible();
    expect((await masthead.boundingBox())!.height).toBeLessThan(90);
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    expect((await masthead.locator("nav").boundingBox())!.height).toBeLessThan(170);
    await page.locator(".hero .lede").click();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await page.locator("#content").focus();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await menu.evaluate((element: HTMLElement) => element.blur());
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await expect(howLink).not.toBeVisible();
    await menu.click();
  } else {
    await expect(menu).not.toBeVisible();
  }
  await howLink.click();
  if (mobile) await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/#come-funziona$/);
  await expect(howLink).toHaveAttribute("aria-current", "location");
  await expect
    .poll(() => page.locator("progress").evaluate((element: HTMLProgressElement) => element.value))
    .toBeGreaterThan(0);

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
    await menu.focus();
    await expect(masthead).not.toHaveClass(/is-hidden/);
  } else {
    expect(scrollState.mobile).toBe(false);
    await expect(masthead).not.toHaveClass(/is-hidden/);
  }

  if (mobile) await menu.click();
  await page.getByRole("link", { name: "EN", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page).toHaveTitle("CF Ready | Required Codice Fiscale at checkout");
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
