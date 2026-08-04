import { expect, test } from "@playwright/test";

// §24, requisiti 2.3.1 e 2.3.2: prima di OAuth l'app non può mostrare UI interagibile né
// chiedere il dominio dello store. È il check automatico «Immediately authenticates after
// install» della pre-submission: finché esisteva `/auth/login` l'URL dell'app rispondeva con
// un form, e falliva.
for (const path of ["/", "/?shop=cf-ready-dev.myshopify.com"]) {
  test(`l'URL dell'app non mostra UI prima di OAuth: ${path}`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers().location).toMatch(/^\/app/);
  });
}

test("il form del dominio dello store non esiste più", async ({ request }) => {
  // Con lo user agent di un browser la rotta non viene scartata come bot: se il form fosse
  // ancora servito, si vedrebbe qui.
  const response = await request.get("/auth/login", {
    maxRedirects: 0,
    headers: { "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140.0 Safari" },
  });
  const body = await response.text();

  expect(body).not.toContain("s-text-field");
  expect(body).not.toContain("myshopify.com");
});
