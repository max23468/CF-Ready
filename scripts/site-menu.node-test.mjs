import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  activeSection,
  initializeMenu,
  orderSections,
  readingProgress,
  shouldHideMasthead,
} from "../site/menu.js";

class FakeClassList {
  values = new Set();
  add(value) {
    this.values.add(value);
  }
  remove(value) {
    this.values.delete(value);
  }
  toggle(value, force) {
    if (force) this.add(value);
    else this.remove(value);
  }
  has(value) {
    return this.values.has(value);
  }
}

function eventTarget(properties = {}) {
  const listeners = new Map();
  return {
    ...properties,
    addEventListener(name, listener) {
      const registered = listeners.get(name) ?? [];
      registered.push(listener);
      listeners.set(name, registered);
    },
    dispatch(name, event = {}) {
      for (const listener of listeners.get(name) ?? []) listener(event);
    },
  };
}

function menuFixture({ links = true, sectionsPresent = true } = {}) {
  const firstSection = {
    id: "funzioni",
    compareDocumentPosition: () => 4,
    getBoundingClientRect: () => ({ top: 80 }),
  };
  const secondSection = {
    id: "prezzi",
    compareDocumentPosition: () => 0,
    getBoundingClientRect: () => ({ top: 300 }),
  };
  const menuLinks = links
    ? [
        {
          hash: "#prezzi",
          classList: new FakeClassList(),
          setAttribute(name, value) {
            this[name] = value;
          },
          removeAttribute(name) {
            delete this[name];
          },
        },
        {
          hash: "#funzioni",
          classList: new FakeClassList(),
          setAttribute(name, value) {
            this[name] = value;
          },
          removeAttribute(name) {
            delete this[name];
          },
        },
        { hash: "#", classList: new FakeClassList() },
      ]
    : [];
  const toggle = eventTarget({
    hidden: true,
    setAttribute(name, value) {
      this[name] = value;
    },
    focus() {
      this.focused = true;
    },
  });
  const navigation = eventTarget({ classList: new FakeClassList() });
  const masthead = eventTarget({
    querySelector: (selector) => (selector === "nav" ? navigation : toggle),
    classList: new FakeClassList(),
    contains: (element) => element === "inside",
    querySelectorAll: () => menuLinks,
    getBoundingClientRect: () => ({ bottom: 72 }),
  });
  const mobile = eventTarget({ matches: true });
  const win = eventTarget({
    scrollY: 0,
    innerHeight: 500,
    matchMedia: () => mobile,
    getComputedStyle: () => ({ scrollPaddingTop: "96px" }),
  });
  const sections = sectionsPresent ? { funzioni: firstSection, prezzi: secondSection } : {};
  const progress = { value: 0 };
  const doc = eventTarget({
    activeElement: null,
    documentElement: { scrollHeight: 1500 },
    querySelector: (selector) => (selector === ".reading-progress" ? progress : masthead),
    getElementById: (id) => sections[id],
  });
  return {
    doc,
    firstSection,
    masthead,
    menuLinks,
    mobile,
    navigation,
    toggle,
    progress,
    secondSection,
    win,
  };
}

test("la decisione di nascondere la testata resta una funzione pura", () => {
  assert.equal(
    shouldHideMasthead({ mobile: true, scrollingDown: true, scrollY: 241, focusInside: false }),
    true,
  );
  for (const input of [
    { mobile: false, scrollingDown: true, scrollY: 241, focusInside: false },
    { mobile: true, scrollingDown: false, scrollY: 241, focusInside: false },
    { mobile: true, scrollingDown: true, scrollY: 240, focusInside: false },
    { mobile: true, scrollingDown: true, scrollY: 241, focusInside: true },
  ])
    assert.equal(shouldHideMasthead(input), false);
});

test("ordina le sezioni e individua l’ultima oltre la soglia", () => {
  const { firstSection, secondSection } = menuFixture();
  assert.deepEqual(orderSections([secondSection, firstSection]), [firstSection, secondSection]);
  assert.deepEqual(orderSections([firstSection, secondSection]), [firstSection, secondSection]);
  assert.deepEqual(orderSections([firstSection, firstSection]), [firstSection, firstSection]);
  assert.equal(activeSection([firstSection, secondSection], 96), firstSection);
  assert.equal(activeSection([firstSection, secondSection], 400), secondSection);
  assert.equal(activeSection([], 96), undefined);
});

test("l’adapter DOM gestisce scroll, focus, breakpoint e sezione attiva", () => {
  const fixture = menuFixture();
  initializeMenu(fixture.doc, fixture.win);
  assert.equal(fixture.menuLinks[1]["aria-current"], "location");
  assert.equal(fixture.menuLinks[1].classList.has("is-active"), true);

  fixture.win.scrollY = 300;
  fixture.win.dispatch("scroll");
  assert.equal(fixture.masthead.classList.has("is-hidden"), true);
  fixture.win.dispatch("scroll");
  assert.equal(fixture.masthead.classList.has("is-hidden"), true);

  fixture.doc.activeElement = "inside";
  fixture.win.scrollY = 350;
  fixture.win.dispatch("scroll");
  assert.equal(fixture.masthead.classList.has("is-hidden"), true);
  fixture.masthead.dispatch("focusin");
  assert.equal(fixture.masthead.classList.has("is-hidden"), false);

  fixture.mobile.matches = false;
  fixture.mobile.dispatch("change");
  fixture.win.dispatch("scroll");
  assert.equal(fixture.masthead.classList.has("is-hidden"), false);

  fixture.secondSection.getBoundingClientRect = () => ({ top: 90 });
  fixture.win.dispatch("hashchange");
  assert.equal(fixture.menuLinks[0]["aria-current"], "location");
  assert.equal(fixture.menuLinks[1]["aria-current"], undefined);
});

test("l’adapter è progressivo quando mancano testata o ancore", () => {
  assert.equal(initializeMenu({ querySelector: () => null }, {}), undefined);
  const fixture = menuFixture({ links: false });
  assert.equal(initializeMenu(fixture.doc, fixture.win), undefined);
  const withoutSections = menuFixture({ sectionsPresent: false });
  assert.equal(initializeMenu(withoutSections.doc, withoutSections.win), undefined);
});

test("il modulo inizializza automaticamente l’adapter nel browser", async () => {
  const fixture = menuFixture();
  globalThis.document = fixture.doc;
  globalThis.window = fixture.win;
  try {
    await import("../site/menu.js?browser-entry");
    assert.equal(fixture.menuLinks[1]["aria-current"], "location");
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});

test("il menu segue l’ordine delle sezioni in entrambe le lingue", () => {
  for (const path of ["../site/index.html", "../site/en/index.html"]) {
    const html = readFileSync(new URL(path, import.meta.url), "utf8");
    const navigation = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/)[1];
    const positions = [...navigation.matchAll(/href="#([^"]+)"/g)].map(([, id]) =>
      html.indexOf(`id="${id}"`),
    );
    assert.ok(positions.every((position) => position >= 0));
    assert.deepEqual(
      positions,
      [...positions].sort((a, b) => a - b),
    );
  }
});

test("l’avanzamento gestisce pagine corte e rimbalzo dello scroll", () => {
  assert.equal(readingProgress(0, 1500, 500), 0);
  assert.equal(readingProgress(500, 1500, 500), 0.5);
  assert.equal(readingProgress(1200, 1500, 500), 1);
  assert.equal(readingProgress(-50, 1500, 500), 0);
  assert.equal(readingProgress(0, 500, 500), 0);
  assert.equal(readingProgress(0, 300, 500), 0);
});

test("l’indicatore si aggiorna con scroll, resize e apertura dettagli", () => {
  const fixture = menuFixture();
  initializeMenu(fixture.doc, fixture.win);
  fixture.win.scrollY = 500;
  fixture.win.dispatch("scroll");
  assert.equal(fixture.progress.value, 0.5);
  fixture.win.innerHeight = 1000;
  fixture.win.dispatch("resize");
  assert.equal(fixture.progress.value, 1);
  fixture.doc.documentElement.scrollHeight = 3000;
  fixture.doc.dispatch("toggle");
  assert.equal(fixture.progress.value, 0.25);
});

test("le pagine senza indicatore mantengono la navigazione", () => {
  const fixture = menuFixture();
  fixture.doc.querySelector = (selector) => (selector === ".masthead" ? fixture.masthead : null);
  initializeMenu(fixture.doc, fixture.win);
  assert.equal(fixture.menuLinks[1]["aria-current"], "location");
});

test("il menu mobile si chiude con Escape, link e cambio breakpoint", () => {
  const f = menuFixture();
  initializeMenu(f.doc, f.win);
  assert.equal(f.toggle.hidden, false);
  f.doc.dispatch("keydown", { key: "Escape" });
  f.toggle.dispatch("click");
  assert.equal(f.toggle["aria-expanded"], "true");
  f.win.scrollY = 400;
  f.win.dispatch("scroll");
  assert.equal(f.masthead.classList.has("is-hidden"), false);
  f.navigation.dispatch("click", { target: { closest: () => null } });
  f.doc.dispatch("keydown", { key: "Tab" });
  assert.equal(f.navigation.classList.has("is-open"), true);
  f.doc.dispatch("keydown", { key: "Escape" });
  assert.equal(f.toggle.focused, true);
  assert.equal(f.toggle["aria-expanded"], "false");
  f.toggle.dispatch("click");
  f.navigation.dispatch("click", { target: { closest: () => ({}) } });
  assert.equal(f.navigation.classList.has("is-open"), false);
  f.toggle.dispatch("click");
  f.mobile.dispatch("change");
  assert.equal(f.toggle["aria-expanded"], "false");
  f.toggle.dispatch("click");
  f.toggle.dispatch("click");
  assert.equal(f.toggle["aria-expanded"], "false");
});

test("il pannello non copre il contenuto dopo click o focus fuori dalla testata", () => {
  const f = menuFixture();
  initializeMenu(f.doc, f.win);
  f.doc.dispatch("pointerdown", { target: "outside" });
  f.toggle.dispatch("click");
  f.doc.dispatch("pointerdown", { target: "inside" });
  assert.equal(f.toggle["aria-expanded"], "true");
  f.doc.dispatch("pointerdown", { target: "outside" });
  assert.equal(f.toggle["aria-expanded"], "false");
  f.toggle.dispatch("click");
  f.doc.dispatch("focusin", { target: "outside" });
  assert.equal(f.toggle["aria-expanded"], "false");
  assert.equal(f.toggle.focused, undefined);
});
