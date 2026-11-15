import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  currentSection,
  initializeMenu,
  initializeMobileInstallCta,
  initializeScrollspy,
  orderSections,
  shouldHideMasthead,
  shouldShowMobileInstallCta,
} from "../site/menu.js";

class FakeClassList {
  values = new Set();
  add(...values) {
    for (const value of values) this.values.add(value);
  }
  remove(...values) {
    for (const value of values) this.values.delete(value);
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

function attributes() {
  return {
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
  };
}

function link(hash) {
  return { hash, ...attributes() };
}

function menuFixture({ popover = true, links = true, sectionsPresent = true } = {}) {
  // Posizione nel documento: 4 = l'altro nodo segue, 2 = precede.
  const node = (id, index) => ({
    id,
    index,
    compareDocumentPosition: (other) => (other.index > index ? 4 : 2),
  });
  const top = node("top", 0);
  const firstSection = node("funzioni", 1);
  const secondSection = node("prezzi", 2);
  const menuLinks = links ? [link("#top"), link("#funzioni"), link("#prezzi"), link("#")] : [];
  const list = eventTarget({
    open: false,
    popover: "auto",
    matches(selector) {
      return selector === ":popover-open" && this.open;
    },
    hidePopover() {
      this.open = false;
    },
    ...attributes(),
  });
  const masthead = eventTarget({
    classList: new FakeClassList(),
    contains: (element) => element === "inside",
    querySelector: (selector) => (selector === "#public-navigation" ? list : null),
    querySelectorAll: () => menuLinks,
  });
  const compact = eventTarget({ matches: true });
  const observers = [];
  const win = eventTarget({
    scrollY: 0,
    HTMLElement: { prototype: popover ? { popover: "" } : {} },
    matchMedia: () => compact,
    IntersectionObserver: class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.targets = [];
        observers.push(this);
      }
      observe(target) {
        this.targets.push(target);
      }
    },
  });
  const sections = sectionsPresent ? { top, funzioni: firstSection, prezzi: secondSection } : {};
  const doc = eventTarget({
    activeElement: null,
    querySelector: (selector) => (selector === ".masthead" ? masthead : null),
    getElementById: (id) => sections[id],
  });
  return {
    compact,
    doc,
    firstSection,
    list,
    masthead,
    menuLinks,
    observers,
    secondSection,
    top,
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

test("ordina le sezioni e sceglie l’ultima che attraversa la linea", () => {
  const { top, firstSection, secondSection } = menuFixture();
  assert.deepEqual(orderSections([secondSection, firstSection]), [firstSection, secondSection]);
  assert.deepEqual(orderSections([firstSection, firstSection]), [firstSection, firstSection]);
  const ordered = [top, firstSection, secondSection];
  assert.equal(currentSection(ordered, new Set([top])), top);
  assert.equal(currentSection(ordered, new Set([top, secondSection])), secondSection);
  assert.equal(currentSection(ordered, new Set()), null);
});

test("la testata si ritira scendendo su telefono e torna con il focus", () => {
  const f = menuFixture();
  initializeMenu(f.doc, f.win);
  f.win.dispatch("scroll");
  f.win.scrollY = 300;
  f.win.dispatch("scroll");
  assert.equal(f.masthead.classList.has("is-hidden"), true);

  f.doc.activeElement = "inside";
  f.win.scrollY = 350;
  f.win.dispatch("scroll");
  assert.equal(f.masthead.classList.has("is-hidden"), true);
  f.masthead.dispatch("focusin");
  assert.equal(f.masthead.classList.has("is-hidden"), false);

  f.doc.activeElement = null;
  f.win.scrollY = 200;
  f.win.dispatch("scroll");
  assert.equal(f.masthead.classList.has("is-hidden"), false);

  f.compact.matches = false;
  f.win.scrollY = 600;
  f.win.dispatch("scroll");
  assert.equal(f.masthead.classList.has("is-hidden"), false);
});

test("con il menu aperto la testata resta e una voce lo chiude", () => {
  const f = menuFixture();
  initializeMenu(f.doc, f.win);
  f.list.open = true;
  f.win.scrollY = 400;
  f.win.dispatch("scroll");
  assert.equal(f.masthead.classList.has("is-hidden"), false);

  f.list.dispatch("click", { target: { closest: () => null } });
  assert.equal(f.list.open, true);
  f.list.dispatch("click", { target: { closest: () => ({}) } });
  assert.equal(f.list.open, false);
  f.list.dispatch("click", { target: { closest: () => ({}) } });
  assert.equal(f.list.open, false);

  f.list.open = true;
  f.compact.dispatch("change");
  assert.equal(f.list.open, false);
});

test("senza Popover API la lista resta in linea", () => {
  const f = menuFixture({ popover: false });
  initializeMenu(f.doc, f.win);
  assert.equal(f.list.popover, undefined);
  assert.equal(f.masthead.classList.has("no-popover"), true);
  f.list.open = true;
  f.list.dispatch("click", { target: { closest: () => ({}) } });
  assert.equal(f.list.open, true);
});

test("lo scrollspy osserva la linea centrale e segna una sola voce", () => {
  const f = menuFixture();
  initializeScrollspy(f.doc, f.win);
  const [observer] = f.observers;
  assert.equal(observer.options.rootMargin, "-50% 0px -50% 0px");
  assert.deepEqual(observer.targets, [f.top, f.firstSection, f.secondSection]);

  observer.callback([{ target: f.top, isIntersecting: true }]);
  assert.equal(f.menuLinks[0]["aria-current"], "true");

  observer.callback([{ target: f.firstSection, isIntersecting: true }]);
  assert.equal(f.menuLinks[0]["aria-current"], undefined);
  assert.equal(f.menuLinks[1]["aria-current"], "true");

  observer.callback([{ target: f.firstSection, isIntersecting: false }]);
  assert.equal(f.menuLinks[0]["aria-current"], "true");
  assert.equal(f.menuLinks[1]["aria-current"], undefined);

  observer.callback([{ target: f.top, isIntersecting: false }]);
  assert.equal(f.menuLinks[0]["aria-current"], "true");
});

test("menu e scrollspy sono progressivi quando mancano testata, lista o ancore", () => {
  assert.equal(initializeMenu({ querySelector: () => null }, {}), undefined);
  assert.equal(initializeScrollspy({ querySelector: () => null }, {}), undefined);
  const withoutList = menuFixture();
  withoutList.masthead.querySelector = () => null;
  assert.equal(initializeMenu(withoutList.doc, withoutList.win), undefined);

  const withoutLinks = menuFixture({ links: false });
  initializeScrollspy(withoutLinks.doc, withoutLinks.win);
  assert.equal(withoutLinks.observers.length, 0);

  const withoutObserver = menuFixture();
  delete withoutObserver.win.IntersectionObserver;
  assert.equal(initializeScrollspy(withoutObserver.doc, withoutObserver.win), undefined);

  const withoutSections = menuFixture({ sectionsPresent: false });
  initializeScrollspy(withoutSections.doc, withoutSections.win);
  assert.deepEqual(withoutSections.observers[0].targets, []);
});

test("il modulo inizializza automaticamente menu e scrollspy nel browser", async () => {
  const f = menuFixture();
  globalThis.document = f.doc;
  globalThis.window = f.win;
  try {
    await import("../site/menu.js?browser-entry");
    assert.equal(f.observers.length, 1);
    f.list.open = true;
    f.list.dispatch("click", { target: { closest: () => ({}) } });
    assert.equal(f.list.open, false);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});

test("il menu segue l’ordine delle sezioni in entrambe le lingue", () => {
  for (const path of ["../site/index.html", "../site/en/index.html"]) {
    const html = readFileSync(new URL(path, import.meta.url), "utf8");
    const navigation = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/)[1];
    const ids = [...navigation.matchAll(/href="#([^"]+)"/g)].map(([, id]) => id);
    const positions = ids.map((id) => html.indexOf(`id="${id}"`));
    assert.ok(positions.every((position) => position >= 0));
    assert.deepEqual(
      positions,
      [...positions].sort((a, b) => a - b),
    );
    // Ogni sezione raggiunta dal menu riceve il focus dopo il salto (scrollspy).
    for (const id of ids.filter((value) => value !== "top")) {
      assert.match(html, new RegExp(`<section [^>]*id="${id}" tabindex="-1"`), `${path} #${id}`);
    }
  }
});

test("la CTA mobile resta contestuale fra l’hero e la CTA finale", () => {
  for (const input of [
    { mobile: false, startVisible: false, endVisible: false },
    { mobile: true, startVisible: true, endVisible: false },
    { mobile: true, startVisible: false, endVisible: true },
  ])
    assert.equal(shouldShowMobileInstallCta(input), false);
  assert.equal(
    shouldShowMobileInstallCta({ mobile: true, startVisible: false, endVisible: false }),
    true,
  );

  const start = {};
  const end = {};
  const cta = { hidden: true };
  const mobile = eventTarget({ matches: true });
  const observed = [];
  let update;
  const win = {
    matchMedia: () => mobile,
    IntersectionObserver: class {
      constructor(callback) {
        update = callback;
      }
      observe(target) {
        observed.push(target);
      }
    },
  };
  const doc = {
    querySelector(selector) {
      return {
        "[data-mobile-install-cta]": cta,
        "[data-install-cta-start]": start,
        "[data-install-cta-end]": end,
      }[selector];
    },
  };

  initializeMobileInstallCta(doc, win);
  assert.deepEqual(observed, [start, end]);
  assert.equal(cta.hidden, true);
  update([{ target: start, isIntersecting: false }]);
  assert.equal(cta.hidden, false);
  update([{ target: end, isIntersecting: true }]);
  assert.equal(cta.hidden, true);
  mobile.matches = false;
  mobile.dispatch("change");
  assert.equal(cta.hidden, true);
});

test("la CTA mobile resta un miglioramento progressivo", () => {
  assert.equal(initializeMobileInstallCta({ querySelector: () => null }, {}), undefined);
});
