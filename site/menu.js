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
    if (mobile.matches && scendendo && y > 120) {
      masthead.classList.add("is-hidden");
    } else if (!scendendo || !mobile.matches) {
      masthead.classList.remove("is-hidden");
    }

    lastY = y;
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  mobile.addEventListener("change", function () {
    masthead.classList.remove("is-hidden");
  });

  // --- Segna la voce di menu della sezione che si sta guardando.
  var links = Array.prototype.filter.call(
    masthead.querySelectorAll('nav a[href^="#"]'),
    function (a) {
      return a.hash.length > 1;
    },
  );
  if (!links.length || !("IntersectionObserver" in window)) return;

  var sections = links.flatMap(function (a) {
    var section = document.getElementById(a.hash.slice(1));
    return section ? [section] : [];
  });

  function segna(hash) {
    links.forEach(function (a) {
      a.classList.toggle("is-active", a.hash === hash);
    });
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) segna("#" + entry.target.id);
      });
    },
    // La fascia stretta al centro dello schermo evita che due sezioni contigue
    // si contendano l'evidenziazione mentre si scorre.
    { rootMargin: "-45% 0px -45% 0px" },
  );

  sections.forEach(function (section) {
    observer.observe(section);
  });

  // In cima alla pagina nessuna sezione è al centro: lì la voce giusta è Home.
  // Vale anche all'apertura, prima che si scorra.
  function segnaSeInCima() {
    if (window.scrollY < 120) segna("#top");
  }

  window.addEventListener("scroll", segnaSeInCima, { passive: true });
  segnaSeInCima();
})();
