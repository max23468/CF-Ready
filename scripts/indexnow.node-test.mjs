import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { indexNowKey, payload, publishedKey, sitemapUrls } from "./indexnow.mjs";

const sitemap = readFileSync(new URL("../site/sitemap.xml", import.meta.url), "utf8");

test("il file pubblicato con il sito contiene la chiave IndexNow", () => {
  assert.match(indexNowKey, /^[0-9a-f]{32}$/);
  assert.equal(publishedKey().trim(), indexNowKey);
});

test("l'invio IndexNow contiene tutte e sole le pagine della sitemap", () => {
  const urls = sitemapUrls(sitemap);
  const body = payload(urls);
  assert.equal(body.host, "cfready.it");
  assert.equal(body.keyLocation, `https://cfready.it/${indexNowKey}.txt`);
  assert.deepEqual(body.urlList, urls);
  assert.equal(urls[0], "https://cfready.it/");
});

test("l'invio IndexNow rifiuta indirizzi di altri host o una sitemap vuota", () => {
  assert.throws(() => payload(["https://example.com/"]), /fuori da cfready\.it/);
  assert.throws(() => payload([]), /non contiene indirizzi/);
});
