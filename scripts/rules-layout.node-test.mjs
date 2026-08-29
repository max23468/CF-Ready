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

test("il titolo del simulatore non spezza checkout quando ha spazio", () => {
  const simulator = readFileSync(
    new URL("../app/features/rules/CheckoutSimulator.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../app/features/rules/CheckoutSimulator.css", import.meta.url),
    "utf8",
  ).replaceAll(/\s+/g, " ");

  assert.match(simulator, /className="checkout-simulator__eyebrow"/);
  assert.match(styles, /\.checkout-simulator__eyebrow \{[^}]*white-space: nowrap;/);
  assert.doesNotMatch(simulator, /<s-badge[^>]*size="large"/);
});

test("il simulatore propone scenari pertinenti alle regole configurate", () => {
  const simulator = readFileSync(
    new URL("../app/features/rules/CheckoutSimulator.tsx", import.meta.url),
    "utf8",
  );

  assert.match(simulator, /<s-select[\s\S]*copy\.scenarioLabel/);
  assert.match(simulator, /rules\.taxCode === "unmanaged" \? null/);
  assert.match(simulator, /rules\.pec === "unmanaged" \? null/);
  assert.doesNotMatch(simulator, /checkout-simulator__button--valid/);
});

test("la Guida espone un pulsante esplicito per richiedere assistenza", () => {
  const route = readFileSync(new URL("../app/routes/app.guide.tsx", import.meta.url), "utf8");

  assert.match(route, /<s-button[^>]*href=\{supportMailto\([\s\S]*t\.support\.requestSupport/);
});

test("le FAQ sono espanse al primo caricamento", () => {
  const route = readFileSync(new URL("../app/routes/app.guide.tsx", import.meta.url), "utf8");

  assert.match(route, /const \[expanded, setExpanded\] = useState\(true\)/);
  assert.match(route, /<details className="guide-faq__entry" key=\{entry\.q\} open>/);
});

test("le FAQ espanse restano separate visivamente", () => {
  const styles = readFileSync(new URL("../app/routes/app.guide.css", import.meta.url), "utf8");

  assert.match(styles, /\.guide-faq__entry \{[^}]*border-block-start:[^}]*padding-block:/s);
});

test("la Home integra il perimetro Italia nella configurazione corrente", () => {
  const route = readFileSync(new URL("../app/features/home/HomePage.tsx", import.meta.url), "utf8");

  assert.match(route, /<s-icon type="location" color="subdued" \/>/);
  assert.match(route, /\{t\.rules\.exceptions\[0\]\}/);
  assert.doesNotMatch(route, /heading=\{t\.home\.howHeading\}/);
});

test("Messaggi usa il selettore lingua Polaris e un'anteprima aggiornata", () => {
  const route = readFileSync(new URL("../app/routes/app.messages.tsx", import.meta.url), "utf8");
  const preview = readFileSync(
    new URL("../app/features/messages/CustomerMessagesPreview.tsx", import.meta.url),
    "utf8",
  );

  assert.match(preview, /<s-select[\s\S]*label=\{languageLabel\}[\s\S]*value=\{activeLocale\}/);
  assert.match(preview, /<s-option value="it">\{languages\.it\}<\/s-option>/);
  assert.match(preview, /<s-option value="en">\{languages\.en\}<\/s-option>/);
  assert.doesNotMatch(preview, /s-press-button/);
  assert.match(
    preview,
    /\{context\}[\s\S]*<s-banner tone="critical" heading=\{errorHeading\}>[\s\S]*\{message\}/,
  );
  assert.match(preview, /\{selectedHeading\}[\s\S]*\{selectedLabel\}/);
  assert.match(route, /message=\{draft\[activeLocale\]\[selectedKey\]\}/);
  assert.match(route, /setActiveLocale\(result\.problem\.locale\)/);
});
