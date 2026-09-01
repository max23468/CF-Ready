// CF Ready — comportamento del menu.
// Due sole cose: la testata che si ritira su telefono, e la voce che segna dove
// ci si trova. Senza questo file il sito resta usabile: la testata è agganciata
// via CSS e i collegamenti funzionano lo stesso.

(function () {
  var masthead = document.querySelector(".masthead");
  if (!masthead) return;

  // --- La testata si ritira scendendo, torna risalendo. Solo su telefono: su
  // schermo largo resta ferma, perché lo spazio non manca.
  var mobile = window.matchMedia("(max-width: 52rem)");
  var lastY = window.scrollY;

  function onScroll() {
    var y = window.scrollY;
    var scendendo = y > lastY;

    // La soglia evita che la testata sparisca al primo pixel, e che tremi
    // durante il rimbalzo elastico in cima alla pagina.
    if (
      mobile.matches &&
      scendendo &&
      y > 240 &&
      !masthead.contains(document.activeElement)
    ) {
      masthead.classList.add("is-hidden");
    } else if (!scendendo || !mobile.matches) {
      masthead.classList.remove("is-hidden");
    }

    lastY = y;
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  masthead.addEventListener("focusin", function () {
    masthead.classList.remove("is-hidden");
  });
  mobile.addEventListener("change", function () {
    masthead.classList.remove("is-hidden");
  });

  // --- Segna la voce di menu della sezione che si sta guardando.
  var links = [...masthead.querySelectorAll('nav a[href^="#"]')].filter(function (a) {
    return a.hash.length > 1;
  });
  if (!links.length) return;

  var sections = links
    .map(function (a) {
      return document.getElementById(a.hash.slice(1));
    })
    .filter(Boolean)
    // L'ordine del menu è editoriale e può differire da quello delle sezioni.
    // La sezione corrente va quindi calcolata nell'ordine reale del documento.
    .sort(function (a, b) {
      if (a === b) return 0;
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1;
    });

  function segna(hash) {
    links.forEach(function (a) {
      var corrente = a.hash === hash;
      a.classList.toggle("is-active", corrente);
      if (corrente) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  }

  // È corrente l'ultima sezione che ha raggiunto la testata. Funziona anche
  // aprendo direttamente un'ancora e con sezioni più corte del viewport.
  function segnaSezione() {
    var corrente = sections[0];
    var scrollPadding = parseFloat(
      getComputedStyle(document.documentElement).scrollPaddingTop,
    );
    var soglia = Math.max(
      masthead.getBoundingClientRect().bottom,
      scrollPadding || 0,
    );
    sections.forEach(function (section) {
      if (section.getBoundingClientRect().top <= soglia + 1) corrente = section;
    });
    if (corrente) segna("#" + corrente.id);
  }

  window.addEventListener("scroll", segnaSezione, { passive: true });
  window.addEventListener("hashchange", segnaSezione);
  segnaSezione();
})();
