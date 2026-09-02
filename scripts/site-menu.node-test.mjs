import assert from "node:assert/strict";
import test from "node:test";
import { activeSection, initializeMenu, orderSections, shouldHideMasthead } from "../site/menu.js";

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
    dispatch(name) {
      for (const listener of listeners.get(name) ?? []) listener();
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
  const masthead = eventTarget({
    classList: new FakeClassList(),
    contains: (element) => element === "inside",
    querySelectorAll: () => menuLinks,
    getBoundingClientRect: () => ({ bottom: 72 }),
  });
  const mobile = eventTarget({ matches: true });
  const win = eventTarget({
    scrollY: 0,
    matchMedia: () => mobile,
    getComputedStyle: () => ({ scrollPaddingTop: "96px" }),
  });
  const sections = sectionsPresent ? { funzioni: firstSection, prezzi: secondSection } : {};
  const doc = {
    activeElement: null,
    documentElement: {},
    querySelector: () => masthead,
    getElementById: (id) => sections[id],
  };
  return { doc, firstSection, masthead, menuLinks, mobile, secondSection, win };
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
