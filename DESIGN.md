---
version: alpha
name: CF Ready
description: Linguaggio visivo del sito pubblico cfready.it, della listing e dei materiali di CF Ready. L'app embedded usa Polaris.
colors:
  primary: "#20492F"
  accent: "#C97B2E"
  paper: "#F7F5EE"
  surface: "#FFFFFF"
  ink: "#1A211C"
  ink-muted: "#6B6A5C"
  ink-inverse: "#F7F5EE"
  border: "#B9B5A6"
  border-subtle: "#DFDBCD"
typography:
  display:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 3.75rem
    fontWeight: 600
    lineHeight: 1.08
  h1:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 2rem
    fontWeight: 500
    lineHeight: 1.19
  h2:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 2rem
    fontWeight: 500
    lineHeight: 1.2
  h3:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 1.1875rem
    fontWeight: 500
    lineHeight: 1.37
  body:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 1.0625rem
    fontWeight: 400
    lineHeight: 1.59
  small:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.53
  label:
    fontFamily: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.38
    letterSpacing: 0.06em
rounded:
  sm: 3px
  md: 6px
  lg: 10px
  pill: 999px
spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "6": 24px
  "8": 32px
  "12": 48px
  "16": 64px
  "24": 96px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink-inverse}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.6}"
    height: 3rem
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.6}"
    height: 3rem
  button-primary-inverse:
    backgroundColor: "{colors.ink-inverse}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.6}"
  checkout-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    rounded: "{rounded.md}"
---

## Overview

CF Ready valida Codice Fiscale e PEC nei campi nativi del checkout italiano di Shopify. La direzione approvata è «l'oggetto e lo strumento»: la tessera del Codice Fiscale disegnata con geometria pulita, forme piene e nessun ornamento. Il brand è preciso, calmo, competente e discreto; non è istituzionale, giuridico, enterprise o ludico.

Il brand è riconoscibile ai bordi del prodotto e neutro al centro. Questo documento governa il sito pubblico, la listing App Store, gli screenshot e i materiali. Dentro l'app embedded valgono solo token e componenti Polaris, con due eccezioni approvate: il colore di brand dentro un'illustrazione su onboarding, testata di Guida e FAQ e piede della colonna laterale in Home (A-16), e il simulatore del checkout in Regole con fondo `paper` e bottone «Continua» in `primary` (A-19).

## Colors

- `primary` (Verde bottiglia) porta il peso: marchio, titoli, link, bottoni e le sezioni a fondo pieno del sito.
- `accent` (Arancio cotto) compare al massimo una volta per schermata, solo come grafica o testo grande.
- `surface` è il fondo di default; `paper` (Panna) va su fasce informative, prezzo, prova e cornice prodotto.
- Testo corrente in `ink`, occhielli, didascalie e note in `ink-muted`.
- Una o due sezioni per pagina su `primary` pieno, tipicamente i limiti e il piè di pagina; lì testo, link, bottoni e focus ring passano a `ink-inverse`.
- `border` per bordi che portano informazione, `border-subtle` per separatori decorativi.
- Il sistema non definisce colori di stato: dentro l'app sono i semantici Polaris, sul sito la distinzione fra supportato e non supportato è testuale e tipografica.

## Typography

- Sito e materiali usano solo lo stack di sistema, senza webfont; dentro l'Admin non si dichiara nessuna `font-family` e il CSS custom usa `font: inherit`.
- `display` solo per il titolo della Home pubblica, in `ink`; `h1`, `h2`, `h3` in `primary`.
- Ogni sezione segue occhiello `label` in maiuscolo → titolo → uno o due paragrafi → eventuale elenco o elemento visivo.
- Il testo corrente resta entro la misura `--cf-measure` di `tokens.css`.
- Sigla e wordmark sono tracciati vettoriali derivati da Jost 500: il logo non si compone mai con un font.

## Layout

- Spaziatura su base 4; ogni sezione porta la stessa distanza sopra e sotto, così lo stacco fra due sezioni è sempre uguale.
- Densità bassa e molto spazio bianco: la semplicità viene dal numero di elementi, non da illustrazioni amichevoli.
- Le griglie di card usano colonne a scaglioni fissi che dividono esattamente il numero di elementi, invece di `auto-fit`.
- Il sito è mobile-first, verificato a 320px, con target di tocco di almeno 44px.
- Pagine legali e di assistenza restano a colonna singola.

## Elevation & Depth

Le superfici si separano con spazio e bordi `border-subtle`, non con ombre. Le due ombre di `tokens.css` sono facoltative e servono solo sul sito: `--cf-shadow-card` per screenshot e schema checkout, `--cf-shadow-frame` per staccare uno screenshot dal fondo nei materiali di listing. Dentro l'app non si usano ombre.

## Shapes

- L'unità geometrica è la tessera in proporzione ISO ID-1 con fascia piena in alto, ritagliata sul profilo; il suo raggio è `--cf-radius-card`, proporzionale al lato corto.
- `md` per bottoni, campi e card; `lg` per cornici degli screenshot e schema checkout; `pill` solo per il selettore lingua; `sm` per i numeri dei passi.
- Illustrazioni solo con le forme del sistema (tessera, fascia, blocchi, campo) in due colori.

## Components

- Un solo bottone primario per blocco; la variante a contorno affianca l'azione alternativa. Dentro le sezioni a fondo pieno il primario si inverte in `button-primary-inverse`.
- Le etichette dei bottoni sono un verbo più un oggetto, al massimo quattro parole.
- Lo schema del checkout mostra un campo e il suo esito, è dichiarato come schema e non somiglia a una schermata Shopify reale. Il campo non valido usa un bordo spesso in `accent` e un messaggio di testo sempre visibile.
- Gli screenshot stanno in una cornice unica e ripetuta su fondo pieno (`paper`, o `primary` per uno o due scatti chiave) con una sola frase di didascalia sempre nella stessa posizione.
- Il cambio lingua IT/EN si distingue dalle voci di menu con una cornice, e la voce corrente con una sottolineatura spessa: mai con il solo colore.
- Focus sempre visibile: anello in `primary` con offset, in `ink-inverse` su fondo scuro; nell'app il focus nativo di Polaris.
- Il marchio è positivo su fondi chiari e negativo, obbligatoriamente, su `primary` e su qualunque fondo scuro.

## Do's and Don'ts

- Don't usare colori di brand su controlli, stati, banner, badge o intestazioni dell'app embedded, fuori dalle eccezioni A-16 e A-19.
- Don't usare `accent` per testo corrente, superfici estese o colori di stato, né `primary` come colore di stato.
- Don't usare `ink` come fondo esteso: per il buio c'è `primary`.
- Don't introdurre webfont, pesi 300, corsivo per enfasi funzionale o titoli in maiuscolo.
- Don't usare gradienti, glow, pattern, fotografie di sfondo, tricolore, stemmi, timbri o simboli istituzionali.
- Don't affidare un'informazione al solo colore, né distinguere con solo rosso e verde.
- Don't ricolorare, ruotare, ombreggiare, contornare o deformare il marchio, né comporre il wordmark dentro la tessera; mai sotto i 16px.
- Don't disegnare finestre del browser, mockup di dispositivi, frecce o cerchietti sugli screenshot, né ritoccare la UI catturata.
- Don't animare l'ingresso allo scroll, usare parallax o contatori animati; con `prefers-reduced-motion: reduce` le durate vanno a zero.
- Don't creare un secondo sistema di token per l'app embedded.
