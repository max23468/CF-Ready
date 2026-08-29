import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Regole mantiene Interno vicino ai campi e usa la larghezza standard", () => {
  const layout = readFileSync(
    new URL("../app/features/rules/RulesLayout.css", import.meta.url),
    "utf8",
  ).replaceAll(/\s+/g, " ");
  const route = readFileSync(new URL("../app/routes/app.rules.tsx", import.meta.url), "utf8");

  assert.match(layout, /grid-template-areas: "fields" "preview" "address";/);
  assert.match(
    layout,
    /@container \(inline-size > 720px\).*\.rules-layout__form \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*gap: 16px;/,
  );
  assert.doesNotMatch(route, /heading=\{t\.rules\.heading\} inlineSize="large"/);
});

test("la Guida espone un pulsante esplicito per richiedere assistenza", () => {
  const route = readFileSync(new URL("../app/routes/app.guide.tsx", import.meta.url), "utf8");

  assert.match(route, /<s-button[^>]*href=\{supportMailto\([\s\S]*t\.support\.requestSupport/);
});

test("le FAQ sono espanse al primo caricamento", () => {
  const route = readFileSync(new URL("../app/routes/app.guide.tsx", import.meta.url), "utf8");

  assert.match(route, /const \[expanded, setExpanded\] = useState\(true\)/);
  assert.match(route, /<details key=\{entry\.q\} open>/);
});
