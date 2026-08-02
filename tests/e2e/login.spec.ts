import { expect, test } from "@playwright/test";

for (const locale of [
  {
    code: "it",
    heading: "Accedi",
    field: "Dominio dello store",
    error: "Inserisci il dominio dello store per accedere",
  },
  {
    code: "en",
    heading: "Log in",
    field: "Shop domain",
    error: "Please enter your shop domain to log in",
  },
]) {
  test(`login ${locale.code}: copy, errore e focus`, async ({ page }) => {
    await page.goto(`/auth/login?locale=${locale.code}`);

    const field = page.getByRole("textbox", { name: locale.field });
    const button = page.getByRole("button", { name: locale.heading });
    await expect(page.getByRole("heading", { name: locale.heading })).toBeVisible();
    await expect(field).toBeVisible();
    await expect(button).toBeVisible();

    await button.click();
    await expect(page.getByText(locale.error)).toBeVisible();

    await page.reload();
    await page.keyboard.press("Tab");
    await expect(field).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
  });
}
