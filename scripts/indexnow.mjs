#!/usr/bin/env node
/**
 * Avvisa i motori che aderiscono a IndexNow (Bing e chi ne usa l'indice) delle pagine della
 * sitemap pubblicata su cfready.it. La chiave è pubblica per protocollo: il file
 * `site/<chiave>.txt` prova che il dominio è nostro.
 *
 * Uso: node scripts/indexnow.mjs <plan|submit>
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const indexNowKey = "86df82704010fcf28fb540496276ab84";

export const siteOrigin = "https://cfready.it";

// L'endpoint comune condivide gli invii con tutti i motori aderenti, Bing compreso.
const endpoint = "https://api.indexnow.org/indexnow";

/** Indirizzi `<loc>` della sitemap, nell'ordine in cui compaiono. */
export function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(([, url]) => url);
}

/** Corpo della richiesta IndexNow: soltanto indirizzi dell'host pubblico. */
export function payload(urls, origin = siteOrigin) {
  const { host } = new URL(origin);
  const foreign = urls.filter((url) => new URL(url).host !== host);
  if (foreign.length) throw new Error(`Indirizzi fuori da ${host}: ${foreign.join(", ")}`);
  if (!urls.length) throw new Error("La sitemap non contiene indirizzi.");
  return { host, key: indexNowKey, keyLocation: `${origin}/${indexNowKey}.txt`, urlList: urls };
}

/** Chiave nel file servito con il sito, per il test di coerenza. */
export function publishedKey() {
  return readFileSync(new URL(`../site/${indexNowKey}.txt`, import.meta.url), "utf8");
}

async function main() {
  const [command] = process.argv.slice(2);
  if (command !== "plan" && command !== "submit") throw new Error("Comandi: plan, submit");
  const published = await fetch(`${siteOrigin}/${indexNowKey}.txt`);
  if ((await published.text()).trim() !== indexNowKey)
    throw new Error("Il file della chiave IndexNow non è pubblicato su cfready.it.");
  const sitemap = await fetch(`${siteOrigin}/sitemap.xml`);
  if (!sitemap.ok) throw new Error(`Sitemap: HTTP ${sitemap.status}`);
  const body = payload(sitemapUrls(await sitemap.text()));
  if (command === "plan") return console.log(JSON.stringify(body, null, 2));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  // 200 e 202 sono accettazioni; gli altri codici spiegano il rifiuto nel corpo.
  if (response.status !== 200 && response.status !== 202)
    throw new Error(`IndexNow: HTTP ${response.status} ${await response.text()}`);
  console.log(JSON.stringify({ ok: true, status: response.status, urls: body.urlList.length }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
