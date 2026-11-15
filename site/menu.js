// CF Ready — comportamento progressivo della testata pubblica.
// Il menu è un popover nativo aperto dal pulsante Menu e funziona anche senza
// JavaScript. Lo script ritira la testata mentre si scende su schermo stretto e
// segna la sezione in vista sulla Home.

export function shouldHideMasthead({ mobile, scrollingDown, scrollY, focusInside }) {
  return mobile && scrollingDown && scrollY > 240 && !focusInside;
}

export function orderSections(sections) {
  return [...sections].sort(function (a, b) {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & 4 ? -1 : 1;
  });
}

// La sezione corrente è l'ultima, in ordine di documento, che attraversa la linea
// di riferimento. Il link `#top` osserva solo l'hero, anziché l'intero body.
export function currentSection(orderedSections, intersecting) {
  var current = null;
  orderedSections.forEach(function (section) {
    if (intersecting.has(section)) current = section;
  });
  return current;
}

export function shouldShowMobileInstallCta({ mobile, startVisible, endVisible }) {
  return mobile && !startVisible && !endVisible;
}

export function initializeMobileInstallCta(doc = document, win = window) {
  var cta = doc.querySelector("[data-mobile-install-cta]");
  var start = doc.querySelector("[data-install-cta-start]");
  var end = doc.querySelector("[data-install-cta-end]");
  if (!cta || !start || !end || typeof win.IntersectionObserver !== "function") return;

  var mobile = win.matchMedia("(max-width: 40rem)");
  var visibility = new Map([
    [start, true],
    [end, false],
  ]);

  function render() {
    var visible = shouldShowMobileInstallCta({
      mobile: mobile.matches,
      startVisible: visibility.get(start),
      endVisible: visibility.get(end),
    });
    cta.hidden = !visible;
  }

  var observer = new win.IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      visibility.set(entry.target, entry.isIntersecting);
    });
    render();
  });
  observer.observe(start);
  observer.observe(end);
  mobile.addEventListener("change", render);
  render();
}

// Sotto i 52rem la lista è un popover aperto da `popovertarget`: Esc, clic
// esterno, ritorno del focus e `aria-expanded` sono nativi. Sopra la soglia il
// CSS la mostra in linea. Lo script chiude il popover dopo la scelta di una
// voce o quando la finestra torna larga, e ritira la testata su telefono.
export function initializeMenu(doc = document, win = window) {
  var masthead = doc.querySelector(".masthead");
  if (!masthead) return;
  var list = masthead.querySelector("#public-navigation");
  if (!list) return;

  var compact = win.matchMedia("(max-width: 52rem)");
  var supportsPopover = Object.hasOwn(win.HTMLElement.prototype, "popover");

  function isOpen() {
    return supportsPopover && list.matches(":popover-open");
  }

  function close() {
    if (isOpen()) list.hidePopover();
  }

  if (!supportsPopover) {
    // Senza Popover API la lista resta in linea e va a capo, come senza script.
    list.removeAttribute("popover");
    masthead.classList.add("no-popover");
  } else {
    list.addEventListener("click", function (event) {
      if (event.target.closest("a")) close();
    });
    compact.addEventListener("change", close);
  }

  var lastY = win.scrollY;
  function onScroll() {
    var y = win.scrollY;
    if (y === lastY) return;
    var scrollingDown = y > lastY;
    var mobile = compact.matches;
    if (
      shouldHideMasthead({
        mobile,
        scrollingDown,
        scrollY: y,
        focusInside: isOpen() || masthead.contains(doc.activeElement),
      })
    ) {
      masthead.classList.add("is-hidden");
    } else if (!scrollingDown || !mobile) {
      masthead.classList.remove("is-hidden");
    }
    lastY = y;
  }

  win.addEventListener("scroll", onScroll, { passive: true });
  masthead.addEventListener("focusin", function () {
    masthead.classList.remove("is-hidden");
  });
}

// Scrollspy: un IntersectionObserver sulla linea centrale della finestra segna la
// sezione in vista, senza leggere il layout a ogni evento di scroll. Non si usa
// `scroll-target-group`: su telefono le voci stanno nel popover chiuso, che il
// browser non considera come marcatori, e lo stato andrebbe perso.
export function initializeScrollspy(doc = document, win = window) {
  var masthead = doc.querySelector(".masthead");
  if (!masthead) return;
  var links = [...masthead.querySelectorAll('nav a[href^="#"]')].filter(function (link) {
    return link.hash.length > 1;
  });
  if (!links.length) return;

  function mark(current) {
    links.forEach(function (link) {
      if (link === current) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  if (typeof win.IntersectionObserver !== "function") return;
  function sectionFor(link) {
    var section = doc.getElementById(link.hash.slice(1));
    return section && link.hash === "#top" ? doc.querySelector(".hero") : section;
  }
  var sections = orderSections(links.map(sectionFor).filter(Boolean));
  var linkFor = new Map(
    links.map(function (link) {
      return [sectionFor(link), link];
    }),
  );
  var intersecting = new Set();
  var observer = new win.IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) intersecting.add(entry.target);
        else intersecting.delete(entry.target);
      });
      var section = currentSection(sections, intersecting);
      mark(linkFor.get(section));
    },
    { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
  );
  sections.forEach(function (section) {
    observer.observe(section);
  });
}

if (typeof document !== "undefined") {
  initializeMenu();
  initializeScrollspy();
  initializeMobileInstallCta();
}
