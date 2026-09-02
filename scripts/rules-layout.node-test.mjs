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

test("il risultato del simulatore comunica e anima soltanto il cambio di stato", () => {
  const simulator = readFileSync(
    new URL("../app/features/rules/CheckoutSimulator.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../app/features/rules/CheckoutSimulator.css", import.meta.url),
    "utf8",
  );

  assert.match(simulator, /aria-live="polite"/);
  assert.match(simulator, /className="checkout-simulator__outcome cf-motion-swap"/);
  assert.match(simulator, /key=\{outcome\}/);
  assert.match(simulator, /role="status"/);
  assert.match(styles, /\.checkout-simulator__outcome \{/);
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

test("le FAQ espongono focus, indicatore e apertura progressiva accessibile", () => {
  const styles = readFileSync(new URL("../app/routes/app.guide.css", import.meta.url), "utf8");

  assert.match(styles, /summary:focus-visible/);
  assert.match(styles, /summary::after/);
  assert.match(styles, /::details-content/);
  assert.match(styles, /prefers-reduced-motion: no-preference/);
});

test("le transizioni di pagina sono rapide e rispettano il movimento ridotto", () => {
  const app = readFileSync(new URL("../app/routes/app.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/ui-motion.css", import.meta.url), "utf8");

  assert.match(app, /navigate\(target, \{ viewTransition: true \}\)/);
  assert.match(app, /className="app-route-surface" key=\{location\.pathname\}/);
  assert.match(styles, /--cf-motion-duration-fast: 120ms/);
  assert.match(styles, /--cf-motion-duration-base: 180ms/);
  assert.match(styles, /prefers-reduced-motion: no-preference/);
  assert.match(styles, /::view-transition-old\(root\)/);
  assert.match(styles, /::view-transition-new\(root\)/);
  assert.match(styles, /\.app-route-surface,/);
});

test("la Home integra il perimetro Italia nella configurazione corrente", () => {
  const route = readFileSync(
    new URL("../app/features/home/HomeSections.tsx", import.meta.url),
    "utf8",
  );

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

test("le textarea dei messaggi restano non controllate senza divergere durante l'idratazione", () => {
  const route = readFileSync(new URL("../app/routes/app.messages.tsx", import.meta.url), "utf8");
  const field = readFileSync(
    new URL("../app/features/messages/UncontrolledMessageTextArea.tsx", import.meta.url),
    "utf8",
  );

  assert.match(route, /<UncontrolledMessageTextArea/);
  assert.doesNotMatch(route, /defaultValue=\{value\}/);
  assert.match(field, /field\.value = initialValueRef\.current/);
  assert.doesNotMatch(field, /value=\{/);
});
