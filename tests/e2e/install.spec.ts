import { expect, test } from "@playwright/test";

// §24, requisiti 2.3.1 e 2.3.2: prima di OAuth l'app non può mostrare UI interagibile né
// chiedere il dominio dello store. È il check automatico «Immediately authenticates after
// install» della pre-submission: finché esisteva `/auth/login` l'URL dell'app rispondeva con
// un form. Lo user agent è quello di un browser perché `authenticate.admin` scarta i bot con
// un 410 prima di arrivare alla risposta vera.
const browser = {
  "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140.0 Safari",
};

for (const path of ["/", "/?shop=cf-ready-dev.myshopify.com", "/auth/login"]) {
  test(`l'ingresso dell'app inoltra a /app: ${path}`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0, headers: browser });

    expect(response.status()).toBe(302);
    expect(response.headers().location).toMatch(/^\/app/);
    expect(await response.text()).not.toContain("s-text-field");
  });
}

for (const path of ["/app", "/app?shop=cf-ready-dev.myshopify.com"]) {
  test(`la destinazione pre-OAuth espone solo il bootstrap App Bridge: ${path}`, async ({
    request,
  }) => {
    const response = await request.get(path, { headers: browser });
    const body = await response.text();

    expect(response.status()).toBe(200);
    expect(body).toContain("https://cdn.shopify.com/shopifycloud/app-bridge.js");
    expect(body).not.toMatch(/<s-(?:button|link|text-field)/);
  });
}
