# CF Ready — Brand Foundation

**Milestone:** M2 — Brand Foundation
**Stato:** ✅ **Approvata e chiusa il 28 luglio 2026.** Nessuna decisione di brand resta aperta. Vincolante per M6 (UI), M7 (sito e legale) e M9 (listing e screenshot).
**Data:** 27 luglio 2026 · revisione approvata 28 luglio 2026
**Fonte vincolante superiore:** `docs/plans/2026-07-28-CF-Ready-Master-Plan.md`
**Autore:** Claude Code (responsabile Brand Foundation per D-079 e §32.1)

Documenti collegati:

- `docs/brand/brand-board.html` — tavola di direzione approvata, versione visiva di questo documento;
- `docs/brand/assets/` — pacchetto asset del marchio e token CSS.

> Questo documento definisce le fondamenta visive e comunicative. Non contiene wireframe, specifiche pagina per pagina, layout definitivi, microcopy completa, testi del sito, listing o screenshot finali: quelli appartengono a M6, M7 e M9.

---

## Indice

1. Vincoli estratti dal Master Plan
2. Direzione visiva
3. Palette
4. Tipografia
5. Design token essenziali
6. Marchio, wordmark e lockup
7. Tono di voce
8. Principi generali per la UI embedded
9. Direzione per sito, listing e screenshot
10. Accessibilità
11. Registro delle decisioni
12. Pacchetto asset

---

## 1. Vincoli estratti dal Master Plan

Solo i vincoli che governano identità visiva, tono, logo/icona, UI embedded, sito, listing, screenshot e accessibilità.

### 1.1 Identità fissata (non rinegoziabile)

| Elemento | Valore | Fonte |
|---|---|---|
| Brand | CF Ready | §17.1, D-076 |
| Nome pubblico / listing | CF Ready — Codice Fiscale nel Checkout | §17.1, §24.2, §1.2 |
| Nome breve in Admin | CF Ready | §17.1 |
| Abbreviazione | `CFR`, **solo interna** | §17.1, §1.2 |
| Handle | `cf-ready` | §17.1, D-076 |
| Function handle | `cf-ready-validation` | §17.1, §11.1 |
| Sito pubblico | `cf-ready.pages.dev` (+ `/privacy`, `/terms`, `/support`) | §18.3 |

`CFR` non compare in nessun materiale pubblico — icona, wordmark, sito, listing, screenshot, microcopy. Il brand pubblico è sempre e solo `CF Ready`.

### 1.2 Vincoli sull'identità visiva

- Brand Foundation è milestone iniziale, in parallelo a M1 e **prima** della UI definitiva (§17.2, D-077, M2).
- Gate M2: approvazione owner prima della UI definitiva — **soddisfatto il 28 luglio 2026**.
- Dentro Shopify Admin prevalgono tipografia Shopify, colori semantici Polaris, componenti Polaris, layout nativo, accessibilità, CSS minimo (§17.3).
- Il brand si esprime soprattutto in icona, logo, tono, sito pubblico, listing, screenshot, eventuali illustrazioni, accenti compatibili con Polaris (§17.3).
- Nessun design system esterno (NFR-044), nessun framework UI/CSS aggiuntivo (§32.2), nessun font proprietario dentro Admin se rompe la coerenza (§32.2).
- Esclusi esplicitamente: Tailwind, shadcn/ui, Bootstrap, Material UI, Sass (§20.6).
- CSS custom minimo (§15.1); nessuna dipendenza senza necessità dimostrata (§32.2, D-099).

### 1.3 Vincoli sulla UI embedded

- Polaris Web Components come default (NFR-040); UI quasi interamente Polaris/App Bridge (D-078, §32.2).
- Home come centro operativo guidato, non dashboard (D-062, §15.1).
- Nessuna simulazione grafica del checkout; anteprima delle regole **testuale** (D-068, §15.1, §15.4).
- Save Bar nativa, niente auto-save (D-065).
- Tre radio sempre visibili per campo, non un select (D-066).
- Eccezioni automatiche sempre visibili e non modificabili (D-067).
- Messaggi in tab Italiano/English con reset separato per lingua (D-069, §15.5).
- Azioni ad alto impatto con conferma (§15.1); Home attiva: `Modifica regole` primaria, `Disattiva nel checkout` secondaria (D-064).
- Checklist onboarding scompare definitivamente dopo il completamento (D-063).
- Cinque pagine permanenti: Home, Regole checkout, Messaggi al cliente, Piano e fatturazione, Guida e FAQ (§15.2).
- Nessuna pagina Diagnostica né Analytics merchant (D-039, §5.2).
- Lingua UI automatica dalla locale Shopify, nessun selettore (D-071, §16.1).

### 1.4 Vincoli sul tono di voce e sui claim

Non affermare (§4.4, §16.3):

- che la legge italiana imponga a ogni e-commerce di raccogliere il CF per ogni ordine;
- che l'app determini l'obbligo fiscale del merchant;
- che il CF sia certificato o verificato presso l'Agenzia delle Entrate;
- che una PEC formalmente valida sia certamente una casella PEC esistente;
- che l'app emetta, trasmetta o conservi fatture;
- che l'app sostituisca consulenza fiscale o legale;
- che l'app sia "la prima", "la migliore" o "l'unica";
- che l'app abbia merchant, recensioni o risultati non dimostrati.

Formulazioni approvate riutilizzabili come sono (§4.3, §16.3, §14.11):

- promessa breve: «Mai più ordini da fatturare senza Codice Fiscale.»
- formulazione prudente: «Per i merchant che devono emettere fattura elettronica per gli ordini B2C, CF Ready impedisce che un cliente completi un ordine italiano senza aver compilato un Codice Fiscale formalmente valido.»
- una tantum: «Un solo pagamento per questo store Shopify, senza rinnovi. Include le funzionalità dell'app e i relativi aggiornamenti per la durata operativa del servizio.»

Altri vincoli linguistici: evitare "lifetime" come titolo contrattuale, usare `Un solo pagamento` (D-070); annuale etichettato `Consigliato` (D-070); badge `Prezzo di lancio` con data esatta e **niente countdown** (§14.3); IT ed EN semanticamente allineati (§16.4); prevalenza della versione italiana nei documenti legali (D-074); Controlled Launch non comunicato come beta o pilot (D-093); nessun incentivo alle recensioni (D-088, FR-095); listing, FAQ e Termini devono dichiarare che le generazioni successive degli ordini in abbonamento non sono coperte (FR-099).

### 1.5 Vincoli su sito, listing e screenshot

- Sito pubblico statico su Cloudflare Pages, bilingue IT/EN, con Home, Privacy Policy, Termini, Support (D-075, §9.2, §16.4, M7).
- Coerenza obbligatoria tra listing, App Home, sito e documenti (§24.2).
- Materiali listing: icona, screenshot Admin, screenshot o illustrazione del problema/beneficio **senza fingere una UI checkout diversa**, didascalie IT/EN (§24.5).
- Nessuna prova sociale inventata, nessun claim di installazioni o risultati senza evidenza (§24.5, §25.1).
- Se la listing è a visibilità limitata, non dichiararla disponibile nelle ricerche (§25.1).
- Demo screencast di review obbligatorio, 3–5 minuti, inglese o sottotitoli inglesi (D-100, §24.6).
- La listing deve includere anche le limitazioni, non solo i benefici (§24.4).

### 1.6 Vincoli di accessibilità

- Label accessibili, ordine heading corretto, focus gestito, navigazione da tastiera (NFR-041).
- Contrasto verificato (NFR-042).
- Layout responsive dentro Shopify Admin (NFR-043).
- E2E includono tastiera, focus, screen reader basics, viewport stretto e largo (§23.10).
- L'accessibilità non è sacrificabile in nome della semplicità (§1.3).

### 1.7 Contraddizioni bloccanti

**Nessuna.** Due punti richiedono solo una lettura corretta:

1. §15.1 vieta la simulazione grafica del checkout **dentro l'app**; §24.5 ammette uno screenshot o un'illustrazione del problema/beneficio **nella listing**, purché non finga una UI checkout diversa da quella reale.
2. §32.2 vieta un font proprietario dentro Admin «se rompe la coerenza», mentre §17.3 consente espressione tipografica nei materiali pubblici. Risolto azzerando i font custom nell'app embedded (§4.1).

---

## 2. Direzione visiva

### 2.1 Concetto centrale — «L'oggetto e lo strumento»

Il Codice Fiscale, per un italiano, è prima di tutto **una tessera**: un oggetto concreto, familiare, con la sua proporzione e i suoi campi. CF Ready parte da lì e lo tratta con la precisione di uno strumento: geometria pulita, forme piene, nessun ornamento.

Il brand nasce dall'incontro fra i due termini — il riferimento concreto alla tessera e il linguaggio modernista con cui viene disegnata.

### 2.2 Personalità del brand

1. **Preciso** — dice esattamente cosa fa e cosa non fa. Nessuna ambiguità sui limiti.
2. **Calmo** — non allarma e non urge. Il merchant arriva già preoccupato dal problema; il prodotto abbassa la tensione.
3. **Competente** — conosce il dominio (CF ordinario, omocodia, provvisorio, PEC, fatturazione estera) e lo dimostra con la precisione, non con il gergo.
4. **Discreto** — vive dentro l'Admin di qualcun altro. Non reclama attenzione, non compete con Shopify.

Non è: istituzionale, giuridico, "enterprise", ludico, ammiccante, tecnicista.

### 2.3 Impressione da trasmettere

Il merchant che vede l'icona, la listing o la Home deve pensare, in quest'ordine: «capisco subito cosa fa» → «sembra fatto bene» → «si configura in cinque minuti» → «non mi si romperà il checkout».

Deve **non** pensare: «devo capire come si integra col mio gestionale», «serve un commercialista», «è un software di fatturazione», «è un'app ufficiale Shopify».

### 2.4 Elementi visivi caratterizzanti

1. **La tessera** — rettangolo in proporzione ISO ID-1 con angoli morbidi. È l'unità geometrica del sistema, ricorrente in marchio, cornici degli screenshot e blocchi del sito.
2. **La fascia** — banda piena in alto, che qualifica il rettangolo come carta e non come generico contenitore.
3. **Il verde bottiglia** — colore primario, pieno, che porta l'associazione con la validazione restando lontano dal verde-teal di Shopify.
4. **L'arancio cotto** — unico accento caldo, sempre puntuale, mai esteso.
5. **Il ritmo largo** — molto spazio bianco, poche cose per schermata. La semplicità è resa dalla densità bassa, non da illustrazioni amichevoli.

### 2.5 Semplicità, affidabilità e contesto italiano

- **Semplicità** = quantità di elementi bassa. Un colore che porta il peso, un accento raro, nessuna illustrazione decorativa, nessun pattern.
- **Affidabilità** = precisione geometrica e coerenza. Allineamenti puliti, spessori costanti, nessun effetto: niente gradienti, niente glow, ombre quasi assenti.
- **Contesto italiano** = espresso dalla lingua, dalla competenza di dominio e dal riferimento concreto alla tessera. Mai da tricolore, stemmi, monumenti, timbri, bolli o simboli istituzionali.

### 2.6 Riconoscibilità senza conflitto con Polaris

Regola strutturale: **il brand è riconoscibile ai bordi del prodotto, neutro al centro.**

| Superficie | Presenza del brand |
|---|---|
| Icona app (nav Admin, App Store) | Massima |
| Sito pubblico | Massima |
| Listing e screenshot | Alta — cornici, fondi, didascalie |
| Onboarding e Guida in-app | Bassa — solo l'icona già presente in navigazione |
| Home, Regole, Messaggi, Piano | **Nulla** — solo token Polaris |

Dentro l'app embedded il colore di brand non viene usato: nessun bottone verde CF Ready accanto a un bottone Polaris, nessun banner colorato custom, nessuna intestazione brandizzata. La coerenza si ottiene dal tono dei testi e dalla struttura delle pagine, non dal colore. Questo soddisfa §17.3, NFR-040 e NFR-044.

---

## 3. Palette

Cinque valori. Nessun colore funzionale proprietario: dentro l'Admin i colori di stato sono **esclusivamente** i semantici di Polaris.

### 3.1 Valori

| Nome | HEX | Funzione | Contesto d'uso | Limiti | Contrasto |
|---|---|---|---|---|---|
| **Verde bottiglia** | `#20492F` | Primario | Marchio, titoli, superfici scure del sito, cornici screenshot, bottoni e link **del solo sito pubblico** | Mai dentro l'app embedded. Mai come colore di stato | 9,4:1 su Panna · 10,2:1 su bianco |
| **Arancio cotto** | `#C97B2E` | Accento unico | Fascia del marchio, un dettaglio per schermata sui materiali pubblici | Mai dentro l'app. **Mai come colore di stato.** Mai su superfici estese. Solo grafica e testo grande | 3,1:1 su Verde bottiglia · 3,0:1 su Panna |
| **Panna** | `#F7F5EE` | Fondo caldo | Fondo di default dei materiali pubblici, fondo degli screenshot, marchio in negativo | Non usarlo dentro l'app | — |
| **Inchiostro** | `#1A211C` | Testo primario | Sito, didascalie, materiali | Non usarlo come fondo esteso: per il buio c'è il Verde bottiglia | 15,1:1 su Panna |
| **Grigio caldo** | `#6B6A5C` | Testo secondario | Occhielli, didascalie, note | Mai per testo sotto 14 px su fondi tinti | 5,0:1 su Panna |

Per bordi e separatori con funzione informativa si usa `#B9B5A6` (3,1:1 su Panna); per separatori puramente decorativi `#DFDBCD`.

### 3.2 Perché questo verde

Il verde porta l'associazione con la validazione, che è il cuore del prodotto. Il rischio è la vicinanza al verde-teal di Shopify: il Master Plan vieta che l'app sembri un prodotto ufficiale. Il bottiglia `#20492F` è un verde pieno e scuro, lontano dal teal `#008060` per tinta e per luminanza, quindi ottiene il significato senza il rischio.

Verifica richiesta prima del rilascio: guardare l'icona affiancata a icone reali nella griglia dell'App Store e nella nav dell'Admin, in tema chiaro e scuro, per controllare che legga «verde = validazione» e non «verde = app di Shopify».

### 3.3 Perché questo arancio

L'accento deve reggere **su due fondi opposti**: la carta chiara e il verde scuro. Perché superi 3:1 da entrambe le parti la sua luminanza deve stare in una finestra stretta:

- un giallo grano tipo `#E0A93B` regge sul verde (3,6:1) ma crolla sulla panna a **1,95:1** — sotto la soglia;
- una terracotta tipo `#C4562C` regge sulla panna (4,1:1) ma sparisce sul verde a **2,3:1**;
- `#C97B2E` sta dentro la finestra: **3,0:1 sulla panna e 3,1:1 sul verde**.

Nota operativa emersa in fase di scelta: con un verde più chiaro (oliva `#4B5A2A`) quella finestra è **vuota** — servirebbero due valori diversi dello stesso accento a seconda del fondo. È una delle ragioni per cui il bottiglia è preferibile all'oliva.

### 3.4 Colori funzionali

**Non definiti**, deliberatamente. Dentro l'app successo, attenzione, errore e informazione usano solo i token semantici di Polaris nella versione corrente: duplicarli creerebbe divergenza al primo aggiornamento. Sui materiali pubblici, se un contenuto deve distinguere «supportato» da «non supportato», la distinzione è testuale e tipografica, non cromatica (§10.7).

---

## 4. Tipografia

### 4.1 App embedded — nessun font custom

Dentro Shopify Admin l'app **eredita integralmente la tipografia di Polaris**: famiglia, scala, pesi, altezze di riga. Nessun `@font-face`, nessun `font-family` nel CSS custom, nessun override di `font-size` sui componenti Polaris. Dove il CSS custom tocca un contenitore, la regola è `font: inherit`.

Motivazione: un font diverso da quello dell'Admin è il primo indizio che un'app è esterna. Il vantaggio estetico sarebbe nullo, il costo (peso, FOUT, disallineamento a ogni aggiornamento Polaris, rischio accessibilità) reale.

### 4.2 Sito pubblico e materiali — grottesco geometrico di sistema

```css
--cf-font-sans:
  Futura, "Avenir Next", "Century Gothic",
  ui-sans-serif, system-ui, -apple-system, "Segoe UI",
  Roboto, sans-serif;
```

**Nessun webfont.** Zero richieste di rete, nessun layout shift, resa geometrica su macOS e Windows, coerenza con NFR-012 e con il divieto di dipendenze non necessarie (D-099).

**Pesi:** 400 testo, 500 etichette e titoli, 600 solo dove serve peso extra. Mai italic per enfasi funzionale, mai `font-weight: 300`.

### 4.3 Gerarchia (sito e materiali pubblici)

| Livello | Dimensione / interlinea | Peso | Uso |
|---|---|---|---|
| Display | 40 / 46 px | 500 | Titolo della sola Home pubblica |
| H1 | 32 / 38 px | 500 | Titolo di pagina |
| H2 | 24 / 30 px | 500 | Titolo di sezione |
| H3 | 19 / 26 px | 500 | Sottosezione, domanda FAQ |
| Body | 17 / 27 px | 400 | Testo corrente |
| Body small | 15 / 23 px | 400 | Note, didascalie screenshot |
| Label | 13 / 18 px | 500, `letter-spacing: .06em`, maiuscoletto | Occhielli ed etichette |

Su mobile: Display 32, H1 26, H2 21, H3 18; body invariato.

### 4.4 Wordmark

Il wordmark è **disegnato una sola volta e convertito in tracciati vettoriali**, non distribuito come font: il logo non dipende da nessun carattere installato. Vale anche per la sigla `CF` dentro il marchio.

I tracciati derivano da **Jost**, licenza SIL Open Font License 1.1, istanziato a peso 500. La scelta ha una ragione precisa: il Futura mostrato nella tavola di approvazione è un carattere commerciale distribuito in bundle con macOS, e ricavarne i tracciati di un logo distribuito pubblicamente non rientra in quella licenza; l'OFL lo consente esplicitamente. Jost è un omaggio dichiarato al Futura, quindi il disegno approvato resta sostanzialmente lo stesso.

Nota di licenza: il progetto **non ridistribuisce Jost**. Il font è usato una sola volta, in fase di disegno, per ricavare i tracciati del marchio; nel repository finiscono solo le forme vettoriali risultanti, che l'OFL non vincola. Se in futuro si decidesse di servire Jost come webfont, allora si applicherebbero gli obblighi OFL di attribuzione e di licenza allegata.

**Crenatura corretta a mano.** I tracciati non escono dal font senza ritocchi:

| Correzione | Valore |
|---|---|
| Tracking generale del wordmark | 0,045 em |
| Coppia `C`/`F` nel wordmark | +0,030 em oltre il tracking |
| Spazio-parola nel wordmark | −0,090 em |
| Coppia `C`/`F` nella sigla del marchio | +0,020 em |

La coppia `C`/`F` tende a chiudersi: senza correzione `CF` legge compresso rispetto a `Ready`. Lo spazio-parola ridotto tiene le due parole come un'unità sola invece che come due elementi staccati.

---

## 5. Design token essenziali

Applicabili a sito e materiali pubblici. **Non** all'interno dell'app embedded, che usa i token Polaris. Il file eseguibile è `docs/brand/assets/tokens.css`.

```css
:root {
  /* ---- Colore ---- */
  --cf-color-primary:        #20492F;
  --cf-color-accent:         #C97B2E;
  --cf-color-paper:          #F7F5EE;
  --cf-color-surface:        #FFFFFF;
  --cf-color-ink:            #1A211C;
  --cf-color-ink-muted:      #6B6A5C;
  --cf-color-ink-inverse:    #F7F5EE;
  --cf-color-border:         #B9B5A6;
  --cf-color-border-subtle:  #DFDBCD;

  /* ---- Tipografia ---- */
  --cf-font-sans: Futura, "Avenir Next", "Century Gothic",
                  ui-sans-serif, system-ui, -apple-system,
                  "Segoe UI", Roboto, sans-serif;
  --cf-weight-regular:  400;
  --cf-weight-medium:   500;
  --cf-weight-semibold: 600;

  --cf-text-display: 2.5rem;    --cf-leading-display: 1.15;
  --cf-text-h1:      2rem;      --cf-leading-h1:      1.19;
  --cf-text-h2:      1.5rem;    --cf-leading-h2:      1.25;
  --cf-text-h3:      1.1875rem; --cf-leading-h3:      1.37;
  --cf-text-body:    1.0625rem; --cf-leading-body:    1.59;
  --cf-text-small:   0.9375rem; --cf-leading-small:   1.53;
  --cf-text-label:   0.8125rem; --cf-leading-label:   1.38;
  --cf-tracking-label: 0.06em;
  --cf-tracking-word:  0.045em;   /* wordmark */

  /* ---- Spaziatura (base 4) ---- */
  --cf-space-1: 4px;   --cf-space-2: 8px;   --cf-space-3: 12px;
  --cf-space-4: 16px;  --cf-space-6: 24px;  --cf-space-8: 32px;
  --cf-space-12: 48px; --cf-space-16: 64px; --cf-space-24: 96px;

  /* ---- Raggi ---- */
  --cf-radius-sm:   3px;
  --cf-radius-md:   6px;
  --cf-radius-lg:   10px;
  --cf-radius-card: 12.5%;  /* raggio del marchio, sul lato corto */
  --cf-radius-pill: 999px;

  /* ---- Bordi ---- */
  --cf-border-width:        1px;
  --cf-border-width-strong: 2px;
  --cf-border:        var(--cf-border-width) solid var(--cf-color-border);
  --cf-border-subtle: var(--cf-border-width) solid var(--cf-color-border-subtle);

  /* ---- Ombre (uso raro, solo sito) ---- */
  --cf-shadow-none:  none;
  --cf-shadow-card:  0 1px 2px rgba(26,33,28,.06), 0 4px 12px rgba(26,33,28,.06);
  --cf-shadow-frame: 0 2px 4px rgba(26,33,28,.08), 0 12px 32px rgba(26,33,28,.10);

  /* ---- Focus ---- */
  --cf-focus-color:  var(--cf-color-primary);
  --cf-focus-width:  2px;
  --cf-focus-offset: 2px;

  /* ---- Motion ---- */
  --cf-duration-fast: 120ms;
  --cf-duration-base: 200ms;
  --cf-easing: cubic-bezier(.2, 0, .38, .9);

  /* ---- Layout ---- */
  --cf-measure:       68ch;
  --cf-container-max: 1080px;
}
```

Regole d'uso:

- **Focus** sempre visibile, mai `outline: none` senza sostituto equivalente. Su fondo scuro il ring passa a `--cf-color-ink-inverse`.
- **Ombre**: due livelli, entrambi facoltativi. `--cf-shadow-frame` esiste solo per staccare uno screenshot dal fondo. Nessuna ombra dentro l'app.
- **Motion**: sono ammesse solo transizioni di `color`, `background-color`, `border-color`, `opacity` e `transform` ridotti. Nessuna animazione d'ingresso allo scroll, nessun parallax, nessun contatore animato. Sotto `prefers-reduced-motion: reduce` le durate vanno a zero (§10.8).
- **Non** introdurre un secondo sistema di token per l'app embedded.

---

## 6. Marchio, wordmark e lockup

### 6.1 Il marchio — «Tessera con fascia»

Una tessera in proporzione **ISO ID-1**, lo stesso rapporto 1,586 della tessera sanitaria, con una fascia piena in alto e la sigla `CF` centrata sotto.

La fascia sta **in alto** per una ragione precisa: in basso leggeva come banda magnetica, quindi carta di pagamento; in alto legge come fascia d'intestazione, che è ciò che una tessera italiana ha davvero.

### 6.2 Geometria canonica

Griglia di riferimento `viewBox="0 0 32 32"`:

| Elemento | Valori |
|---|---|
| Tessera | `x=2 · y=7,2 · w=28 · h=17,6 · rx=2,2` |
| Rapporto | 28 / 17,6 = **1,591** (ISO ID-1 = 1,586) |
| Raggio d'angolo | 2,2 su 17,6 = **12,5%** del lato corto |
| Fascia | `y=7,2 · h=4,8`, ritagliata sugli angoli della tessera |
| Sigla | centrata su `x=16`, linea di base `y=22,2`, corpo 10,5, peso 500 |

Nota sul raggio: il valore geometricamente esatto di una carta ID-1 sarebbe 1,1 (≈6% del lato corto). A dimensione di icona legge spigoloso, quindi il raggio è stato portato a **2,2** per ragioni percettive. È una scelta deliberata, non un errore di misura.

La fascia è **ritagliata** sul profilo della tessera, non sovrapposta: è quel dettaglio che la fa leggere come parte della carta e non come un adesivo appiccicato sopra.

### 6.3 Versioni

| Versione | Costruzione | Uso |
|---|---|---|
| **Positiva** | Tessera bottiglia, fascia arancio, sigla panna | Fondi chiari |
| **Negativa** | Tessera panna, fascia arancio, sigla bottiglia | Fondi scuri e fotografie |
| **Mono** | Tessera piena in un solo inchiostro; fascia e sigla **forate**, lasciano passare il fondo | Stampa a un colore, favicon monocromatiche, contesti a inchiostro singolo |

La versione mono non è la positiva con i colori tolti: è una vera versione a un inchiostro con i vuoti in trasparenza. Costruirla come tessera colorata su fondo dello stesso colore la rende invisibile — errore rilevato e corretto in fase di approvazione.

### 6.4 Comportamento su sfondi chiari e scuri

| Sfondo | Versione |
|---|---|
| Chiaro (`#FFFFFF`, `#F7F5EE`) | Positiva |
| Scuro (`#20492F` e più scuri) | **Negativa, obbligatoria** |
| Fotografia o fondo non controllato | Negativa, mai in sovraimpressione libera: serve una barra solida |
| Monocromo obbligato | Mono, nell'inchiostro disponibile |

**Regola di contrasto, verificata il 28 luglio 2026.** La versione positiva su un fondo quasi nero tipo `#1A1A1A` dà **1,7:1**: la tessera si fonde con lo sfondo e resta visibile solo la fascia. La versione negativa sullo stesso fondo dà **16,0:1**. Su qualunque superficie più scura di circa `#6B6A5C` si usa quindi la negativa. Non è una preferenza estetica ma un requisito di contrasto, e vale anche se in futuro Shopify introducesse una nav scura nell'Admin.

Esiti completi della verifica in contesto in `docs/brand/assets/README.md`.

### 6.5 Regole d'uso

- **Area di rispetto** su ogni lato: l'altezza della fascia (4,8 sulla griglia a 32). Nulla entra in quest'area.
- **Dimensione minima: 16 px.** Sotto quella soglia il marchio non si usa.
- Nessun gradiente, nessuna ombra, nessuna rotazione, nessun contorno aggiunto, nessuna deformazione.
- Non ricolorare: esistono solo le tre versioni di §6.3.
- Non comporre il wordmark dentro la tessera.

### 6.6 Wordmark

```
CF Ready
```

- `CF` in maiuscole piene — è un acronimo reale.
- `Ready` in capitale iniziale e minuscole.
- **Peso uniforme** sulle due parole: differenziarle suggerirebbe che `Ready` sia un suffisso e non parte del nome.
- Tracking `0,045em`; crenatura aperta fra `C` e `F`, spazio-parola leggermente ridotto.
- Colore: Verde bottiglia su chiaro, Panna su scuro. Mai bicolore, mai arancio.
- Nessun payoff bloccato nel logo. Il nome lungo `CF Ready — Codice Fiscale nel Checkout` è un **nome di listing**: si compone accanto al marchio, non dentro.

### 6.7 Lockup

| Configurazione | Composizione | Uso |
|---|---|---|
| **Orizzontale** (primaria) | Marchio a sinistra, wordmark a destra | Header del sito, materiali, firma dei documenti |
| **Verticale** | Marchio sopra, wordmark centrato sotto | Copertine, formati quadrati |
| **Solo marchio** | — | Admin, App Store, favicon, avatar |

- Nella lockup orizzontale il marchio è alto circa 1,8× l'altezza delle maiuscole del wordmark.
- Distanza marchio–wordmark: la larghezza della `C` maiuscola.
- Area di rispetto: l'altezza della fascia su tutti i lati.

---

## 7. Tono di voce

*Approvato il 27 luglio 2026, invariato.*

### 7.1 Principi

1. **Prima il fatto, poi il resto.** La prima frase dice cosa succede.
2. **Frasi brevi.** Una frase, un'informazione. Media sotto le 20 parole.
3. **Voce attiva e soggetto esplicito.** «L'app disattiva la validazione», non «la validazione viene disattivata».
4. **Precisione sui limiti.** Ogni volta che c'è un limite (formale ≠ verificato, PEC non certificata, abbonamenti ricorrenti non coperti), si dice.
5. **Niente paura come leva.** Nessuna sanzione, nessun «rischi», nessun «obbligo di legge».
6. **Niente entusiasmo di maniera.** Nessun punto esclamativo, nessun «Perfetto!».
7. **Nessun gergo inutile.** "Validation Function", "metafield", "entitlement" restano nella documentazione tecnica.
8. **Coerenza terminologica assoluta.** Un concetto, una parola, ovunque.

### 7.2 Glossario obbligatorio

| Concetto | Si dice | Non si dice |
|---|---|---|
| Il campo | Codice Fiscale (due maiuscole) | codice fiscale, CF, cod. fisc., tax code (in IT) |
| L'altro campo | PEC | pec, posta certificata, email certificata (in IT) |
| Il controllo | validazione, formalmente valido | verifica, certificazione, controllo anagrafico |
| L'azione | attivare / disattivare nel checkout | abilitare, accendere, pubblicare, deployare |
| Lo stato | attiva / disattivata / non gestito | on/off, spenta, inattiva |
| Il campo Shopify | campo nativo del checkout italiano | campo custom, campo aggiuntivo, nostro campo |
| L'acquisto singolo | Un solo pagamento | Lifetime, a vita, per sempre, illimitato |
| Il piano annuale | Consigliato | Migliore offerta, Risparmia il 17% |
| Il periodo gratuito | prova di 14 giorni | trial, periodo di test, demo |

### 7.3 Parole e costruzioni da evitare

- **False o rischiose:** obbligatorio per legge, certificato, verificato dall'Agenzia delle Entrate, conforme, a norma, garantito, sicuro al 100%, fattura, fatturazione elettronica, SDI, il primo, il migliore, l'unico, leader.
- **Burocratiche:** ai sensi di, si rende noto, la presente, provvedere a, ottemperare, in ordine a, di cui sopra.
- **Commerciali-aggressive:** non perdere, subito, solo per oggi, ultimi giorni, affrettati, esclusivo, rivoluzionario.
- **Vaghe:** semplicemente, facilmente, potente, avanzato, intelligente, automagicamente.
- **Costruzioni:** doppie negazioni, subordinate a catena, condizionali di cortesia, impersonale quando c'è un responsabile.

### 7.4 Parole e costruzioni da preferire

- Verbi concreti: attivare, salvare, controllare, bloccare, consentire, correggere, riprendere.
- Sostantivi del dominio usati con precisione: checkout, ordine, campo, regola, messaggio, piano, prova.
- Espressioni di limite oneste: «solo il formato», «non verifichiamo», «non è coperto», «potrebbe non essere disponibile».
- Numeri espliciti al posto degli aggettivi: «14 giorni», non «un periodo di prova generoso».
- Seconda persona singolare in italiano, coerente con l'Admin Shopify italiano. **Mai** il "lei".

### 7.5 Differenze fra app, sito e listing

| | App embedded | Sito pubblico | Listing App Store |
|---|---|---|---|
| **Obiettivo** | Far compiere l'azione giusta | Spiegare il problema e i limiti | Far capire in 10 secondi se serve |
| **Registro** | Operativo, neutro | Esplicativo, disteso | Sintetico, orientato al beneficio |
| **Lunghezza** | Minima, una riga per concetto | Media, paragrafi brevi | Corta, bullet |
| **Vendita** | Nessuna, tranne la pagina Piano | Presente ma sobria | Presente, mai iperbolica |
| **Limiti** | Dichiarati dove impattano | Sezione dedicata | Sezione esplicita (§24.4, FR-099) |

La stessa cosa si chiama con la stessa parola nei tre contesti.

### 7.6 Italiano e inglese

- L'italiano è la lingua sorgente; l'inglese è una traduzione completa e semanticamente allineata, non una sintesi (§16.4).
- Si accetta che la versione EN sia più breve: non si allunga per farla combaciare.
- Non si traducono: `Codice Fiscale` (in EN `Italian tax code (Codice Fiscale)` alla prima occorrenza, poi `tax code`); `PEC` (in EN `certified email address (PEC)` alla prima occorrenza, poi `PEC`) — coerente con FR-064.
- In inglese: seconda persona, contrazioni ammesse, niente maiuscole di enfasi, Title Case solo nei titoli di pagina della listing.
- Il nome del brand non si traduce e non si declina.

### 7.7 Regole per CTA, warning, errori e spiegazioni

**CTA** — verbo all'infinito + oggetto, massimo 4 parole (`Attiva nel checkout`, `Modifica regole`, `Scegli un piano`). Una sola azione primaria per schermata. L'etichetta descrive l'esito, non il meccanismo. Nelle conferme il bottone ripete l'azione: `Disattiva`, non `OK`.

**Successo** — fatto compiuto, una riga, nessun punto esclamativo, nessuna celebrazione.

**Warning** — struttura fissa: *cosa succede ora* → *da quando* → *cosa puoi fare*. Mai iniziare con «Attenzione»: il componente Polaris comunica già la severità. Nessun conto alla rovescia (§14.3).

**Errore** — struttura fissa: *cosa non è riuscito* → *perché, se si sa* → *azione concreta*. Mai colpevolizzare, mai «errore imprevisto» come unica spiegazione. L'error code compare solo come dettaglio secondario.

**Spiegazioni** — prima la conseguenza pratica, poi il meccanismo. Ogni spiegazione che tocca un limite fiscale contiene «formalmente» o una formula equivalente. Massimo tre frasi per blocco; oltre, si va in FAQ.

### 7.8 Esempi indicativi

Non sono microcopy definitiva e non introducono funzionalità diverse dal Master Plan.

**CTA**
> Attiva nel checkout

**Successo**
> Validazione attiva nel checkout. Le regole valgono dal prossimo ordine.

**Warning**
> La prova finisce il 10 agosto 2026. Dopo quella data il checkout non blocca più gli ordini senza Codice Fiscale. Le regole e i messaggi restano salvati.

**Errore**
> Non è stato possibile salvare le regole. Shopify non ha confermato la scrittura. Riprova; se l'errore si ripete, contatta l'assistenza.

**Descrizione commerciale breve**
> CF Ready rende obbligatorio e valida il Codice Fiscale nel campo nativo del checkout italiano. Nessuna modifica al tema, nessun campo aggiuntivo.

**FAQ**
> **Il Codice Fiscale viene verificato presso l'Agenzia delle Entrate?**
> No. CF Ready controlla solo il formato: lunghezza, struttura, data, codice catastale e carattere di controllo. Un Codice Fiscale formalmente valido può comunque non appartenere alla persona che lo inserisce.

---

## 8. Principi generali per la UI embedded

Solo principi. Wireframe, stati completi e layout definitivi appartengono a M6, dopo i contratti API di Codex (§31.4, §32.3).

### 8.1 Uso di Polaris

- Polaris Web Components è il default assoluto. Un componente si scrive a mano solo se Polaris non offre nulla di equivalente, e la mancanza va motivata.
- Nessun override degli stili interni dei componenti. Il CSS custom si occupa solo di composizione, usando i token Polaris.
- App Bridge Web Components per Save Bar, modali, toast, navigazione e titolo di pagina — mai reimplementati.
- I nomi dei componenti citati nel Master Plan sono indicativi e vanno verificati sulla versione corrente di Polaris (§15.1).

### 8.2 Gerarchia

- Una sola idea dominante per schermata, dichiarata dal titolo.
- Ordine di lettura: **stato → configurazione attuale → cosa succede in checkout → prossimo passo → aiuto** (§15.3). Lo stesso ordine mentale vale su tutte le pagine.
- Gerarchia dei titoli continua e senza salti, visivamente e semanticamente.
- Le informazioni sui limiti stanno accanto alla decisione che influenzano, non in fondo alla pagina.

### 8.3 Densità informativa

- Densità bassa: CF Ready ha poche impostazioni, mostrarle affollate le farebbe sembrare complesse.
- Massimo 3–4 blocchi di primo livello per pagina.
- Nessuna metrica, nessun KPI, nessun grafico (D-039, §5.3).
- Il testo esplicativo accompagna l'opzione, non una legenda separata (§15.4).

### 8.4 Azioni primarie

- Una sola azione primaria visibile per schermata.
- Le azioni che cambiano il comportamento del checkout sono sempre separate dal salvataggio: salvare non attiva mai implicitamente (D-011, FR-051).
- Le azioni ad alto impatto passano da una conferma che dichiara la conseguenza concreta, non da un «Sei sicuro?».
- Nessuna azione primaria dentro un blocco informativo.

### 8.5 Uso degli spazi

- Larghezza di lettura limitata: nessun paragrafo che attraversa tutto lo schermo su viewport larghi.
- Spaziatura verticale a scala Polaris; separazione affidata allo spazio e alle card, non a righe divisorie multiple.
- Nessun contenitore vuoto in attesa di contenuto futuro.

### 8.6 Warning e messaggi

- Severità sempre espressa dal componente Polaris corretto, mai da colore custom.
- Un banner esiste solo se richiede o rende possibile un'azione; un banner informativo permanente diventa testo.
- I banner di riparazione (FR-056) dichiarano cosa non torna e cosa farà l'azione, prima di eseguirla.
- Avvisi di prova a 7, 3, 1 giorni e alla scadenza (FR-077): tono calmo, mai pressione.
- Un solo banner per volta in cima alla pagina; se due sono candidati, vince quello che blocca l'operatività.

### 8.7 Form

- Ogni controllo ha un'etichetta visibile e persistente; nessun placeholder usato come etichetta.
- Testo di aiuto sotto il campo, non in tooltip, quando serve a decidere.
- Validazione lato client come cortesia, mai come unica difesa: il server valida sempre (NFR-023).
- Errori di campo mostrati sul campo, con testo che dice come correggere.
- Contatore caratteri dove esiste un limite (200 caratteri, FR-062), non punitivo prima del superamento.
- Il pulsante di salvataggio non si disabilita silenziosamente: se non si può salvare, si dice perché.

### 8.8 Radio button

- Le tre modalità di ogni campo sempre tutte visibili, mai in un select (D-066).
- Ogni opzione: etichetta breve + una riga di spiegazione concreta dell'effetto sul checkout.
- Ordine invariabile e uguale per CF e PEC: `Non gestito` → `Facoltativo e validato` → `Obbligatorio e validato`.
- Nessuna opzione presentata come consigliata: la scelta dipende dall'operatività del merchant.
- Il blocco `Eccezioni automatiche` è adiacente, visibile e non modificabile (D-067).

### 8.9 Tab

- I tab separano solo varianti dello stesso contenuto: Italiano / English (D-069).
- Non nascondono mai contenuto obbligatorio: un errore in una lingua è segnalato anche col tab inattivo.
- Il reset agisce solo sulla lingua visibile e lo dichiara nella conferma (FR-063).
- Mai usare tab per separare "base" e "avanzate": non esistono impostazioni avanzate.

### 8.10 Save Bar

- Save Bar nativa App Bridge, sempre, per ogni modifica non salvata (D-065). Nessun auto-save.
- Compare al primo cambiamento reale rispetto allo stato salvato, non al focus.
- `Annulla` ripristina lo stato salvato e lo conferma se le modifiche sono sostanziose.
- Uscita con modifiche pendenti: conferma nativa.
- Durante il salvataggio lo stato è visibile e i controlli non saltano di posizione.

### 8.11 Responsive

- Layout fluido dentro l'iframe dell'Admin: nessuna larghezza minima che generi scroll orizzontale.
- Il riferimento è il contenitore, non il viewport.
- I blocchi passano da affiancati a impilati senza cambiare ordine di lettura.
- Le azioni restano raggiungibili senza scroll orizzontale a qualsiasi larghezza (§23.10).

### 8.12 Accessibilità

Valgono le regole di §10: gerarchia heading corretta, focus sempre visibile e mai catturato, tutto raggiungibile da tastiera, errori associati programmaticamente ai campi, cambi di stato annunciati, nessuna informazione affidata al solo colore.

### 8.13 Uso limitato degli accenti di brand

- **Zero colore di brand dentro l'app.** L'unico elemento di brand presente è l'icona nella navigazione, fornita da Shopify.
- Nessuna intestazione brandizzata, nessun badge colorato custom, nessuna illustrazione decorativa, nessun grigio proprietario.
- L'identità dentro l'Admin passa da coerenza dei testi, ordine delle informazioni, prevedibilità delle azioni.
- Un'eventuale eccezione futura va approvata a parte e resta singola.

---

## 9. Direzione per sito, listing e screenshot

Direzione, non materiali finali. Testi completi, listing, screenshot definitivi e immagini promozionali restano a M7 e M9.

### 9.1 Sito pubblico

**Stile generale.** Documento, non landing page commerciale. Una colonna, misura di lettura contenuta, sezioni separate da spazio ampio. Nessun hero a tutta pagina con immagine di sfondo, nessuna sezione "loved by", nessun logo wall, nessun contatore. La credibilità viene dalla precisione dei contenuti — inclusi i limiti dichiarati — non dalla scenografia.

**Palette.** Fondo Panna come default; card e blocchi di esempio su Superficie bianca. Verde bottiglia per titoli, link e bottoni. Una o due sezioni su Verde bottiglia pieno per scandire il ritmo, tipicamente la sezione dei limiti e il piè di pagina. Arancio cotto al massimo una volta per schermata.

**Tipografia.** Stack geometrico di sistema, scala di §4.3, misura massima `--cf-measure`. Titoli in peso 500, mai in maiuscolo. Occhielli in Label maiuscoletto per orientare, non per decorare.

**Sezioni.** Struttura fissa: occhiello → titolo → uno o due paragrafi → eventuale elenco o elemento visivo. Le sezioni previste da §24.4 — beneficio, campo nativo, nessuna modifica al tema, compatibilità piani, validazione, eccezioni estere, canali supportati, **limitazioni**, pricing e prova, privacy, link legali e supporto — hanno tutte lo stesso peso grafico: le limitazioni non stanno in corpo minore né nascoste in fondo.

**Illustrazioni.** Preferenza per **nessuna illustrazione**. Dove un elemento visivo aiuta davvero si usano forme del sistema — la tessera, la fascia, i blocchi — in due colori, senza personaggi, senza isometrie, senza scene d'ufficio. Nessuna illustrazione che rappresenti fatture, timbri, ricevute o l'Agenzia delle Entrate.

**Rapporto con l'app.** Il sito è più espressivo dell'app ma parla la stessa lingua e usa le stesse parole: chi arriva nell'app dopo aver letto il sito riconosce i termini uno a uno.

### 9.2 Listing Shopify

**Tono visivo.** Sobrio e leggibile a colpo d'occhio nella griglia dell'App Store, dove l'icona compete con decine di altre. Chiarezza prima di distintività.

**Composizione.** Ogni immagine è costruita su tre livelli e non di più: fondo (Panna o Verde bottiglia), contenuto (screenshot reale o forma del sistema), didascalia breve. Nessun collage, nessun dispositivo in prospettiva, nessuna sovrapposizione di schermate.

**Gerarchia dei messaggi.**

1. Cosa fa, in una riga: campo nativo, obbligatorio e validato.
2. Cosa non richiede: nessuna modifica al tema, nessun campo aggiuntivo, tutti i piani standard.
3. Come si comporta nei casi particolari: fatturazione estera, ritiro, checkout accelerati.
4. Cosa **non** fa: niente fatturazione elettronica, niente Partita IVA/SDI, generazioni successive degli abbonamenti non coperte (FR-099).
5. Prova, prezzo, privacy, supporto.

**Semplicità e affidabilità.** La semplicità si mostra facendo vedere quanto poco c'è da configurare. L'affidabilità si mostra dichiarando i limiti nello stesso posto e con lo stesso rilievo dei benefici. Nessun badge, sigillo, scudo o percentuale.

### 9.3 Screenshot

**Cornici.** Contenitore unico e ripetuto: rettangolo bianco, `--cf-radius-lg`, bordo `--cf-color-border-subtle`, ombra `--cf-shadow-frame` appena percettibile. Nessuna finestra del browser disegnata, nessuna barra del Mac, nessun mockup di laptop, nessuna prospettiva.

**Sfondo.** Un solo colore pieno per tutta la serie: Panna per la maggior parte, Verde bottiglia per uno o due screenshot chiave. Nessun gradiente, nessun pattern, nessuna foto.

**Quantità di testo.** Una frase per screenshot, massimo 8–10 parole, sempre nella stessa posizione e nello stesso stile. Nessun elenco sovrapposto, nessuna freccia, nessun cerchietto rosso, nessun testo dentro la UI.

**Accenti.** Arancio cotto al massimo su un elemento per screenshot e solo se indica davvero qualcosa. Il colore non è mai l'unico veicolo dell'informazione (§10.7): l'accento accompagna sempre la didascalia testuale.

**Coerenza.** Stessa larghezza di cattura, stesso zoom, stesso tema dell'Admin, stessa lingua per serie (una IT e una EN), stesso store e stessi dati di esempio, stessa posizione della cornice, stessa distanza fra didascalia e cornice.

**Leggibilità della UI reale.** La UI catturata è quella reale, senza ritocchi: niente testi sostituiti, niente elementi cancellati, niente stati inventati. Cattura a 2× e ridimensionamento pari; se a dimensione di listing il testo risulta illeggibile si ritaglia l'area rilevante invece di rimpicciolire tutta la schermata. Nessuno screenshot che finga una UI di checkout diversa da quella reale (§24.5).

---

## 10. Accessibilità

Parte della direzione, non un controllo finale. Vale per app embedded, sito, listing e screenshot.

### 10.1 Contrasto WCAG AA

- Testo normale ≥ **4,5:1**; testo grande (≥24 px, o ≥19 px in peso ≥500) ≥ **3:1**.
- Elementi di interfaccia e grafica informativa ≥ **3:1**.
- La palette di §3 è verificata. L'unico valore sotto la soglia del testo normale è l'Arancio cotto (3,0:1 su Panna, 3,1:1 su Verde bottiglia): **solo grafica e testo grande**.
- Dentro l'app il contrasto è garantito dai token Polaris: non alterarli. Ogni valore custom va misurato prima dell'uso.
- Verificare anche nel tema scuro dell'Admin.

### 10.2 Focus visibile

- Nessun `outline: none` senza sostituto di pari o maggiore visibilità.
- Sul sito: ring da `--cf-focus-width` in `--cf-focus-color` con `outline-offset`, contrasto ≥3:1 col contenuto e con lo sfondo adiacente; su fondo scuro il ring diventa chiaro.
- Nell'app: focus nativo di Polaris, mai soppresso né sovrascritto.
- L'elemento a fuoco non deve essere coperto da barre sticky, Save Bar o banner.
- Ordine di focus uguale all'ordine visivo; nessun `tabindex` positivo.

### 10.3 Navigazione da tastiera

- Ogni azione raggiungibile e attivabile da tastiera, senza eccezioni.
- Nessuna trappola di focus: le modali si chiudono con `Esc` e restituiscono il focus all'elemento che le ha aperte.
- Gruppi radio e tab seguono il comportamento nativo dei componenti: non reimplementarlo.
- Sul sito: skip link «Vai al contenuto» come primo elemento focalizzabile.
- Nessun handler solo su `hover` per informazioni necessarie.

### 10.4 Leggibilità

- Misura di lettura ≤ 68 caratteri sui materiali pubblici.
- Interlinea del testo corrente ≥ 1,5; distanza fra paragrafi ≥ 1,5× l'interlinea.
- Nessun testo giustificato, nessun maiuscolo oltre le etichette brevi, nessun peso 300.
- Nessun testo sopra immagini o pattern.
- Unità e numeri sempre espliciti: 14 giorni, 200 caratteri, 16 caratteri.

### 10.5 Zoom

- Fino al **200%** senza perdita di contenuto o funzionalità.
- Fino al **400%** (equivalente a 320 px CSS) senza scroll orizzontale: colonna singola, nessuna larghezza fissa in `px` sui contenitori principali.
- Dimensioni in unità relative sui materiali pubblici; nell'app si rispettano le impostazioni di Polaris.
- Spaziatura del testo modificabile dall'utente senza sovrapposizioni o troncamenti.

### 10.6 Viewport ridotti

- Sito progettato mobile-first e verificato a 320 px.
- App embedded progettata sul **contenitore**, verificata con l'Admin a piena larghezza e ristretto (§23.10).
- Target di tocco ≥ 44×44 px sui materiali pubblici; nell'app valgono i target nativi di Polaris.
- Nessun contenuto accessibile solo tramite hover o gesto complesso.

### 10.7 Uso del colore

- Il colore non è mai l'unico veicolo di un'informazione: ogni stato ha sempre testo e, dove il pattern lo prevede, un'icona.
- Vale in particolare per stato della validazione, esito dei salvataggi, avvisi di prova ed evidenziazioni negli screenshot.
- Verifica obbligatoria: ogni schermata e ogni screenshot restano comprensibili in scala di grigi.
- Nessun uso di rosso/verde come unica distinzione.

### 10.8 Motion

- Movimento ridotto al minimo: nessuna animazione d'ingresso allo scroll, nessun parallax, nessun auto-play, nessun contenuto lampeggiante.
- Nessuna animazione oltre i 200 ms o che sposti contenuto già letto.
- `prefers-reduced-motion: reduce` supportato:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- Nel video demo per la review nessun effetto di transizione aggressivo; sottotitoli inglesi obbligatori o alternativi all'audio inglese (§24.6).

### 10.9 Messaggi di errore

- Testo, sempre. Mai solo un bordo rosso, mai solo un'icona.
- Associati programmaticamente al campo e annunciati alle tecnologie assistive quando compaiono.
- Il contenuto dice come correggere, non solo cosa è sbagliato.
- All'invio fallito il focus si sposta sul primo campo in errore o sul riepilogo.
- I messaggi mostrati al cliente nel checkout sono quelli configurabili di FR-064, con limite di 200 caratteri e divieto di valore vuoto (FR-061, FR-062).

### 10.10 Label

- Ogni campo ha un'etichetta visibile, persistente e associata; nessun placeholder come etichetta.
- Ogni bottone ha un nome accessibile che coincide col testo visibile.
- Bottoni con sola icona: sempre con nome accessibile; da evitare comunque nell'app.
- I gruppi di controlli hanno un'etichetta di gruppo: `Codice Fiscale`, `PEC`.
- Ogni pagina ha un titolo unico e descrittivo; la lingua del documento è dichiarata (`lang="it"` / `lang="en"`) e coincide con i contenuti.

### 10.11 Testi alternativi per gli asset pubblici

- **Marchio**: `alt="CF Ready"`. Se il wordmark è già presente come testo accanto, l'immagine è decorativa (`alt=""`).
- **Screenshot**: l'alt descrive cosa mostra la schermata, non ripete la didascalia. Massimo circa 150 caratteri.
- **Illustrazioni di sistema**: alt descrittivo se aggiungono significato, `alt=""` se decorative — mai `alt="illustrazione"`.
- **Nessun testo essenziale esiste solo dentro un'immagine.**
- Serie IT e EN hanno alt nella lingua corrispondente.

---

## 11. Registro delle decisioni

### 11.1 Decisioni approvate

| # | Decisione | Contenuto | Approvata |
|---|---|---|---|
| **A-01** | Direzione visiva | «L'oggetto e lo strumento»: riferimento concreto alla tessera, linguaggio geometrico modernista, neutri caldi. Brand ai bordi, neutro al centro (§2) | 28/07/2026 |
| **A-02** | Palette | Verde bottiglia `#20492F`, Arancio cotto `#C97B2E`, Panna `#F7F5EE`, Inchiostro `#1A211C`, Grigio caldo `#6B6A5C` (§3) | 28/07/2026 |
| **A-03** | Zero colore di brand nell'app embedded | Solo token Polaris; brand presente unicamente tramite l'icona in navigazione (§2.6, §8.13) | 27/07/2026 |
| **A-04** | Tipografia | Grottesco geometrico di sistema, nessun webfont, nessun font dichiarato dentro l'Admin, wordmark in tracciati (§4) | 28/07/2026 |
| **A-05** | Marchio | «Tessera con fascia»: proporzione ISO ID-1, raggio 12,5% del lato corto, fascia in alto a spessore pieno, sigla `CF` centrata (§6.1–6.5) | 28/07/2026 |
| **A-06** | Wordmark e lockup | Due parole, peso uniforme, monocromo, tre configurazioni (§6.6–6.7) | 28/07/2026 |
| **A-07** | Tono di voce | Principi, glossario obbligatorio, parole da evitare e preferire, regole per CTA, warning ed errori (§7) | 27/07/2026 |
| **A-08** | Uso del "tu" | Seconda persona singolare in italiano (§7.4) | 27/07/2026 |
| **A-09** | Stile dei materiali pubblici | Sito-documento, cornice unica per gli screenshot, una frase per immagine (§9) | 28/07/2026 |
| **A-10** | Design token | Set di §5, in CSS custom properties, applicato solo a sito e materiali | 28/07/2026 |

| **A-11** | Nessuna dark mode | Il sito pubblico non ha dark mode nella 1.0: solo sezioni scure puntuali. Vedi §11.2 per il contesto | 28/07/2026 |
| **A-12** | Tracciati del wordmark | Sigla e wordmark in tracciati derivati da Jost (SIL OFL), peso 500 (§4.4) | 28/07/2026 |
| **A-13** | Crenatura | Correzioni manuali su coppia `C`/`F` e spazio-parola, valori in §4.4 | 28/07/2026 |
| **A-14** | Formati App Store | Icona 1200 × 1200 PNG, angoli quadrati, padding. Requisiti verificati sulle fonti ufficiali (§12.1) | 28/07/2026 |
| **A-15** | Sigla dentro l'icona della listing | Si presenta l'icona **con** la sigla, accettando la raccomandazione Shopify di evitarne il testo. Rimedio pronto se la review contesta (§11.3) | 28/07/2026 |

### 11.2 Nota sulla dark mode

La decisione di non prevedere dark mode è approvata. La motivazione va però registrata correttamente, perché quella di partenza confondeva due superfici diverse:

- **Sito pubblico** — è una normale pagina web su Cloudflare Pages: la sua dark mode dipenderebbe dal sistema operativo del visitatore, non da Shopify. Escluderla è una semplificazione legittima — una superficie in meno da mantenere e da verificare per contrasto — non un vincolo di piattaforma.
- **App embedded** — al 28 luglio 2026 l'Admin Shopify **non ha una dark mode nativa**: resta una richiesta ricorrente della community. Polaris espone ruoli `inverse` usati con parsimonia su elementi di cornice, non un tema scuro completo. In ogni caso la questione non ci riguarda: usando esclusivamente i token Polaris (A-03), se Shopify introducesse una dark mode l'app la seguirebbe da sola, senza modifiche. È un'altra ragione per non hardcodare mai colori dentro l'app.
- **Marchio** — indipendente da entrambe: la versione negativa esiste comunque ed è obbligatoria su fondi scuri (§6.4).

Fonte verificata: [Polaris — Color](https://polaris-react.shopify.com/design/colors) e la discussione aperta nella community Shopify sulla [dark mode dell'Admin](https://community.shopify.com/t/does-shopify-offer-a-dark-mode-for-the-admin-page/240190). Da rivedere prima di M6 se Shopify cambia posizione.

### 11.3 Nessuna decisione di brand resta aperta

Tutte le decisioni di identità visiva sono chiuse. Restano solo due attività che dipendono da milestone successive e non sono scelte di brand:

| Attività | Quando | Perché non ora |
|---|---|---|
| Riverifica del marchio dentro l'Admin reale | M1 e M10 | Richiede l'app installata su uno store |
| Feature image 1600 × 900 | M9 | Richiede contenuto reale, insieme agli screenshot |

**Piano di rimedio già pronto (A-15).** Se la review App Store contestasse la sigla dentro l'icona: sostituire l'icona della listing con `icon-app-notext.svg` e rigenerare il PNG a 1200 px. Non richiede modifiche al resto dell'identità né una nuova approvazione. Non rimuovere la sigla altrove.

### 11.4 Alternative valutate e scartate

Registrate per evitare che vengano riproposte senza una nuova decisione dell'owner.

| Alternativa | Motivo dello scarto |
|---|---|
| Palette blu (`#1A3D5C` + ocra `#B8791F`) | Direzione precedente, superata: l'owner ha chiesto una direzione più calda e un verde che richiamasse la validazione |
| Direzione editoriale con serif e terracotta | Scartata a favore della geometrica modernista |
| Direzione organica «un tratto solo», prugna | Legame troppo debole con Codice Fiscale, validazione e checkout |
| Verde oliva `#4B5A2A` | Con un verde più chiaro non esiste un accento caldo che superi 3:1 sia sul verde sia sulla carta: servirebbero due valori dell'accento (§3.3) |
| Giallo grano `#E0A93B` come accento | 1,95:1 sulla panna, sotto la soglia per un elemento grafico portatore di significato |
| Icone astratte (campo con spunta, monogramma intrecciato, sequenza di moduli, arco, incastro, gesto) | Troppo astratte o troppo generiche rispetto al riferimento al Codice Fiscale |
| Icone con lettere `C` e `F` esplicite dentro la tessera | Le lettere risultavano troppo evidenti e non leggevano come righe e riquadri di una tessera |
| Raggio d'angolo 1,1 (valore ISO reale) | Geometricamente corretto ma percettivamente spigoloso a dimensione di icona (§6.2) |
| Fascia in basso | Leggeva come banda magnetica, quindi carta di pagamento (§6.1) |

---

## 12. Pacchetto asset

`docs/brand/assets/` contiene:

| File | Contenuto |
|---|---|
| `icon.svg` | Marchio positivo — tessera bottiglia, fascia arancio, sigla panna |
| `icon-negative.svg` | Marchio negativo, obbligatorio su fondi scuri |
| `icon-mono.svg` | Versione a un solo inchiostro, con fascia e sigla forate; colore da `currentColor` |
| `icon-app.svg` | Icona quadrata 512 per App Store e listing, marchio su fondo panna |
| `icon-app-notext.svg` | Variante di riserva senza sigla, vedi A-15 |
| `favicon.svg` | Favicon, marchio ingrandito con margini ridotti |
| `nav-icon.svg` | Icona di navigazione dell'Admin: sola sagoma della tessera sulla griglia a 16, colorata da Shopify |
| `wordmark.svg` | Solo wordmark in tracciati, colore da `currentColor` |
| `lockup-horizontal.svg` | Lockup orizzontale, marchio + wordmark |
| `lockup-vertical.svg` | Lockup verticale |
| `png/` | Esportazioni raster: `icon-app-1200`, `icon-app-notext-1200`, `icon-app-512`, `favicon-32`, `favicon-16`, `lockup-horizontal-800` |
| `tokens.css` | Design token di §5, pronti per il sito |
| `README.md` | Uso, geometria, requisiti App Store, esiti della verifica in contesto, cosa manca |

### 12.1 Requisiti App Store — verificati il 28 luglio 2026

| Requisito | Valore | Stato |
|---|---|---|
| Icona app | 1200 × 1200 px, JPEG o PNG | ✅ conforme |
| Angoli dell'icona | quadrati: è Shopify ad arrotondarli | ✅ conforme |
| Padding | il logo non deve toccare i bordi | ✅ il marchio occupa il 70% del lato |
| Testo nell'icona | da evitare | ⚠️ rischio accettato, A-15 |
| Feature image | 1600 × 900 px, 16:9, fondo pieno, contrasto ≥ 4,5:1, alt text | ⏳ da produrre in M9 |
| Marchi Shopify | vietati in icona, banner e screenshot | ✅ nessuno |

Fonti: [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements), [Best practices](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices), [Visual design](https://shopify.dev/docs/apps/design/visual-design). Da riverificare alla submission.

Gli SVG del marchio usano `viewBox="0 0 32 32"` con la geometria canonica di §6.2; `icon-app.svg`, `wordmark.svg` e le lockup hanno viewBox propri, documentati nel `README.md`. Sigla e wordmark sono tracciati vettoriali: nessun asset dipende da un font installato.

`docs/brand/brand-board.html` è la tavola di direzione approvata: è la versione visiva di questo documento e va aggiornata insieme a esso.
