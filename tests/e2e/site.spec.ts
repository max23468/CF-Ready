import { expect, test } from "@playwright/test";

test("sito pubblico bilingue e percorsi essenziali", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Mai più ordini da fatturare senza Codice Fiscale.",
    }),
  ).toBeVisible();
  const skipLink = page.getByRole("link", { name: "Vai al contenuto" });
  await page.keyboard.press(process.platform === "darwin" ? "Alt+Tab" : "Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#content")).toBeFocused();
  await expect(page.getByRole("link", { name: /Installa da Shopify/ }).first()).toHaveAttribute(
    "href",
    "https://apps.shopify.com/cf-ready",
  );
  const masthead = page.locator(".masthead");
  const homeLink = masthead.getByRole("link", { name: "Home", exact: true });
  const howLink = masthead.getByRole("link", { name: "Come funziona", exact: true });
  await expect(homeLink).toHaveAttribute("aria-current", "location");
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
  });
  await howLink.click();
  await expect(page).toHaveURL(/#come-funziona$/);
  await expect(howLink).toHaveAttribute("aria-current", "location");

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
    await homeLink.focus();
    await expect(masthead).not.toHaveClass(/is-hidden/);
  } else {
    expect(scrollState.mobile).toBe(false);
    await expect(masthead).not.toHaveClass(/is-hidden/);
  }

  await page.getByRole("link", { name: "EN", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "No more orders to invoice without a Codice Fiscale.",
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
