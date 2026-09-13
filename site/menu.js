// CF Ready — comportamento progressivo del menu pubblico.
// Senza JavaScript la testata resta visibile e tutti i collegamenti funzionano.

export function shouldHideMasthead({ mobile, scrollingDown, scrollY, focusInside }) {
  return mobile && scrollingDown && scrollY > 240 && !focusInside;
}

export function orderSections(sections) {
  return [...sections].sort(function (a, b) {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & 4 ? -1 : 1;
  });
}

export function activeSection(sections, threshold) {
  var current = sections[0];
  sections.forEach(function (section) {
    if (section.getBoundingClientRect().top <= threshold + 1) current = section;
  });
  return current;
}

export function readingProgress(scrollY, scrollHeight, viewportHeight) {
  var distance = scrollHeight - viewportHeight;
  return distance > 0 ? Math.min(1, Math.max(0, scrollY / distance)) : 0;
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

export function initializeMenu(doc = document, win = window) {
  var masthead = doc.querySelector(".masthead");
  if (!masthead) return;

  var mobile = win.matchMedia("(max-width: 52rem)");
  var lastY = win.scrollY;
  var progress = doc.querySelector(".reading-progress");
  var toggle = masthead.querySelector(".menu-toggle");
  var navigation = masthead.querySelector("nav");
  var open = false;

  function setOpen(value) {
    open = value;
    toggle.setAttribute("aria-expanded", String(open));
    navigation.classList.toggle("is-open", open);
    masthead.classList.remove("is-hidden");
  }

  toggle.hidden = false;
  masthead.classList.add("has-menu");
  toggle.addEventListener("click", function () {
    setOpen(!open);
  });
  navigation.addEventListener("click", function (event) {
    if (event.target.closest("a")) setOpen(false);
  });
  doc.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && open) {
      setOpen(false);
      toggle.focus();
    }
  });

  function closeOutside(event) {
    if (open && !masthead.contains(event.target)) setOpen(false);
  }
  doc.addEventListener("pointerdown", closeOutside);
  doc.addEventListener("focusin", closeOutside);

  function onScroll() {
    var y = win.scrollY;
    if (y === lastY) return;
    var scrollingDown = y > lastY;
    if (
      shouldHideMasthead({
        mobile: mobile.matches,
        scrollingDown,
        scrollY: y,
        focusInside: open || masthead.contains(doc.activeElement),
      })
    ) {
      masthead.classList.add("is-hidden");
    } else if (!scrollingDown || !mobile.matches) {
      masthead.classList.remove("is-hidden");
    }
    lastY = y;
  }

  win.addEventListener("scroll", onScroll, { passive: true });
  masthead.addEventListener("focusin", function () {
    masthead.classList.remove("is-hidden");
  });
  mobile.addEventListener("change", function () {
    setOpen(false);
  });

  var links = [...masthead.querySelectorAll('nav a[href^="#"]')].filter(function (link) {
    return link.hash.length > 1;
  });
  if (!links.length) return;

  var sections = orderSections(
    links
      .map(function (link) {
        return doc.getElementById(link.hash.slice(1));
      })
      .filter(Boolean),
  );

  function mark(hash) {
    links.forEach(function (link) {
      var current = link.hash === hash;
      link.classList.toggle("is-active", current);
      if (current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }

  function markSection() {
    if (progress) {
      progress.value = readingProgress(
        win.scrollY,
        doc.documentElement.scrollHeight,
        win.innerHeight,
      );
    }
    var scrollPadding = parseFloat(win.getComputedStyle(doc.documentElement).scrollPaddingTop);
    var threshold = Math.max(masthead.getBoundingClientRect().bottom, scrollPadding || 0);
    var current = activeSection(sections, threshold);
    if (current) mark("#" + current.id);
  }

  win.addEventListener("scroll", markSection, { passive: true });
  win.addEventListener("hashchange", markSection);
  win.addEventListener("resize", markSection);
  doc.addEventListener("toggle", markSection, true);
  markSection();
}

if (typeof document !== "undefined") {
  initializeMenu();
  initializeMobileInstallCta();
}
