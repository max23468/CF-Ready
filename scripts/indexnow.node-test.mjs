import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { indexNowKey, payload, publishedKey, run, sitemapUrls } from "./indexnow.mjs";

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

function fakeSite({ key = indexNowKey, sitemapStatus = 200, indexNowStatus = 202 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith(".txt")) return new Response(`${key}\n`);
    if (url.endsWith("sitemap.xml")) return new Response(sitemap, { status: sitemapStatus });
    return new Response("rifiuto", { status: indexNowStatus });
  };
  return { calls, fetchImpl };
}

test("plan legge chiave e sitemap pubblicate senza inviare nulla", async () => {
  const { calls, fetchImpl } = fakeSite();
  const body = await run("plan", fetchImpl);
  assert.deepEqual(body.urlList, sitemapUrls(sitemap));
  assert.deepEqual(
    calls.map(({ url }) => url),
    [`https://cfready.it/${indexNowKey}.txt`, "https://cfready.it/sitemap.xml"],
  );
});

test("submit invia la sitemap all'endpoint comune e accetta 200 e 202", async () => {
  for (const status of [200, 202]) {
    const { calls, fetchImpl } = fakeSite({ indexNowStatus: status });
    const result = await run("submit", fetchImpl);
    assert.deepEqual(result, { ok: true, status, urls: sitemapUrls(sitemap).length });
    const post = calls.at(-1);
    assert.equal(post.url, "https://api.indexnow.org/indexnow");
    assert.equal(post.init.method, "POST");
    assert.equal(JSON.parse(post.init.body).key, indexNowKey);
  }
});

test("run si ferma su comando, chiave, sitemap o risposta IndexNow non valide", async () => {
  await assert.rejects(() => run("send", fakeSite().fetchImpl), /Comandi: plan, submit/);
  await assert.rejects(() => run("plan", fakeSite({ key: "altra" }).fetchImpl), /non è pubblicato/);
  await assert.rejects(
    () => run("plan", fakeSite({ sitemapStatus: 404 }).fetchImpl),
    /Sitemap: HTTP 404/,
  );
  await assert.rejects(
    () => run("submit", fakeSite({ indexNowStatus: 403 }).fetchImpl),
    /IndexNow: HTTP 403 rifiuto/,
  );
});

test("l'invio IndexNow rifiuta indirizzi di altri host o una sitemap vuota", () => {
  assert.throws(() => payload(["https://example.com/"]), /fuori da cfready\.it/);
  assert.throws(() => payload([]), /non contiene indirizzi/);
});
