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
  await expect(page.getByRole("button", { name: /Presto su/ }).first()).toBeDisabled();

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
