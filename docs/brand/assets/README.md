# CF Ready — pacchetto asset del brand

Asset del marchio e token, derivati da [`../brand-foundation.md`](../brand-foundation.md) (approvata il 28 luglio 2026).
La versione visiva della direzione è [`../brand-board.html`](../brand-board.html): apri il file in un browser.

Se modifichi un asset, aggiorna anche il documento e la tavola. Sono tre facce della stessa decisione.

---

## File

| File | viewBox | Uso |
|---|---|---|
| `icon.svg` | `0 0 32 32` | Marchio positivo. Fondi chiari. |
| `icon-negative.svg` | `0 0 32 32` | Marchio negativo. Fondi scuri e fotografie. **Obbligatorio su fondi scuri**, vedi sotto. |
| `icon-mono.svg` | `0 0 32 32` | Versione a un solo inchiostro. Fascia e sigla sono forate: il fondo passa attraverso. Colore da `currentColor`. |
| `icon-app.svg` | `0 0 512 512` | Icona quadrata per App Store e listing. Marchio centrato su fondo panna, largo il 70% della tela. |
| `icon-app-notext.svg` | `0 0 512 512` | Stessa icona **senza la sigla**. Variante di riserva, vedi «Testo dentro l'icona» più sotto. |
| `favicon.svg` | `0 0 32 32` | Favicon. Marchio ingrandito e margini ridotti per restare leggibile a 16 px. |
| `nav-icon.svg` | `0 0 16 16` | Icona di navigazione dell'Admin. Riduzione monocromatica del marchio: tessera a contorno nelle proporzioni canoniche e fascia superiore, senza sigla, `mask` o `clipPath`. |
| `wordmark.svg` | tight | Solo wordmark, in tracciati. Colore da `currentColor`. |
| `lockup-horizontal.svg` | `0 0 129,05 24` | Lockup primaria. Header del sito, materiali, firma dei documenti. |
| `lockup-vertical.svg` | `0 0 71,88 50,72` | Lockup verticale. Copertine e formati quadrati. |
| `feature-image-it.svg`, `feature-image-en.svg` | `0 0 1600 900` | Feature image della listing App Store, una per lingua. Fondo Verde bottiglia pieno, lockup in negativo, claim e un solo pannello: la tessera del marchio ingrandita con dentro il campo e il suo esito. |
| `tokens.css` | — | Design token per sito e materiali pubblici. |
| `png/` | — | Esportazioni raster, vedi sotto. |

### Esportazioni PNG

| File | Uso |
|---|---|
| `png/icon-app-1200.png` | Icona per la submission App Store. Dimensione conforme al requisito, vedi sotto. |
| `png/icon-app-notext-1200.png` | Variante di riserva senza sigla, stessa dimensione |
| `png/icon-app-512.png` | Uso generico, documentazione, Partner Dashboard |
| `png/favicon-32.png`, `png/favicon-16.png` | Favicon raster di fallback |
| `png/lockup-horizontal-800.png` | Lockup per email, presentazioni, documenti non vettoriali |
| `png/feature-image-it-1600.png`, `png/feature-image-en-1600.png` | Feature image da caricare nella listing, 1600 × 900 |

Rigenerabili con headless Chrome; nessuna dipendenza da installare nel repository.
La feature image dichiara già la sua dimensione, quindi Chrome la fotografa senza
alcun involucro HTML — da `docs/brand/assets/`:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars --window-size=1600,900 --screenshot=png/feature-image-it-1600.png feature-image-it.svg
```

**La feature image va rigenerata su macOS.** È l'unico asset con testo vivo
invece che in tracciati: usa lo stesso stack di `--cf-font-sans` del sito, che
si risolve in Futura. Su una macchina senza quel carattere il ripiego cambia le
metriche e la composizione non è più quella approvata. Gli altri asset non
hanno questo vincolo perché sigla e wordmark sono tracciati.

### Requisiti App Store — verificati il 28 luglio 2026

| Requisito | Valore | Stato |
|---|---|---|
| Icona app | 1200 × 1200 px, JPEG o PNG | ✅ `png/icon-app-1200.png` |
| Angoli dell'icona | quadrati: è Shopify ad arrotondarli | ✅ il fondo panna è a spigolo vivo |
| Padding | il logo non deve toccare i bordi | ✅ il marchio occupa il 70% del lato |
| Testo nell'icona | da evitare | ⚠️ vedi sotto |
| Feature image | 1600 × 900 px, 16:9, un solo punto focale, fondo pieno, contrasto ≥ 4,5:1, alt text | ✅ SVG e PNG IT/EN prodotti in M9 |
| Marchi Shopify | vietati in icona, banner e screenshot | ✅ nessuno |

Fonti: [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements) · [Best practices](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices) · [Visual design](https://shopify.dev/docs/apps/design/visual-design). Da riverificare alla submission: i requisiti cambiano.

### Icona di navigazione

Voce separata dall'icona dell'App Store: si carica in **App setup → Embedded app** e compare nella nav dell'Admin.

| Requisito | Valore | Stato |
|---|---|---|
| Formato | SVG 16 × 16 px, come dichiarato dal campo di caricamento | ✅ `viewBox`, `width` e `height` a 16 |
| Immagine | monocromatica su fondo trasparente | ✅ solo primitive in `#000000`, il resto trasparente |
| Angoli | ritaglio a 4 px applicato da Shopify | ✅ la tessera resta dentro l'area sicura |
| Coerenza | deve somigliare all'icona dell'App Store | ✅ stesso concetto di tessera, adattato alla leggibilità a 16 px |

Il file usa una tessera `14 × 8,8`, equivalente alla geometria canonica dimezzata e quindi vicina al rapporto ISO ID-1 del marchio. Rispetto alla precedente riduzione `14 × 7,5`, recupera il 17% di altezza e non appare schiacciata nella barra laterale. Conserva il contorno e la fascia superiore, mentre omette la sigla `CF`: a 16 px le lettere sottraevano spazio alla forma senza restare davvero leggibili.

La costruzione resta compatibile con il caricamento: usa due soli tracciati pieni e non contiene testo, `mask`, `clipPath`, `defs`, `currentColor` o `<title>` che un sanitizer possa rimuovere o rifiutare. Il colore lo applica Shopify — grigio se inattiva, verde se attiva — quindi il nero è solo l'inchiostro sorgente.

Fonte: [Navigation](https://shopify.dev/docs/apps/design/navigation) · verificato il 28 luglio 2026. La pagina non dichiara nessuna dimensione: l'unico valore disponibile è il 16 × 16 scritto nel campo di caricamento.

### Testo dentro l'icona

Le linee guida Shopify per l'icona dicono di **evitare il testo**. Il nostro marchio contiene la sigla `CF`, che è un monogramma e non una parola, e i lettermark sono diffusi fra le app approvate: è una raccomandazione, non un criterio di rifiuto elencato nei requisiti. Il rischio esiste comunque ed è una decisione dell'owner.

Per questo esiste `icon-app-notext.svg`: stessa tessera, stessa fascia, senza sigla. Se la review contestasse il testo, si sostituisce solo l'icona della listing senza toccare il resto dell'identità. Rimuovere la sigla ovunque, invece, toglierebbe al marchio il legame diretto con il Codice Fiscale: non farlo senza una nuova decisione.

### Tipografia degli asset

Sigla e wordmark sono **tracciati vettoriali**, non testo: gli asset non dipendono da nessun font installato.

I tracciati derivano da **Jost** (SIL Open Font License 1.1), istanziato a peso 500. Jost è un omaggio dichiarato al Futura ed è stato scelto al posto del Futura stesso per una ragione di licenza: il Futura è un carattere commerciale distribuito in bundle con macOS, e ricavarne i tracciati di un logo distribuito pubblicamente non è coperto da quella licenza. L'OFL lo consente esplicitamente.

La tavola approvata mostrava la resa in Futura: la differenza fra i due disegni è minima ma non nulla.

**Crenatura corretta a mano.** I tracciati non escono dal font senza ritocchi:

| Correzione | Valore | Perché |
|---|---|---|
| Coppia `C`/`F` nel wordmark | +0,030 em oltre il tracking | Le due lettere tendono a chiudersi: senza correzione `CF` legge compresso rispetto a `Ready` |
| Spazio-parola nel wordmark | −0,090 em | Tiene `CF` e `Ready` come un'unità sola invece che come due parole staccate |
| Coppia `C`/`F` nella sigla | +0,020 em | Stessa ragione, calibrata sul corpo piccolo del marchio |
| Tracking generale del wordmark | 0,045 em | Da brand-foundation §6.6 |

---

## Geometria canonica

Tutti gli asset a 32 unità usano la stessa costruzione (brand-foundation §6.2):

```
tessera   x=2  y=7,2  w=28  h=17,6  rx=2,2
fascia    y=7,2  h=4,8, ritagliata sul profilo della tessera
sigla     x=16, linea di base y=22,2, corpo 10,5, peso 500
```

Rapporto 28 / 17,6 = 1,591, praticamente l'ISO ID-1 della tessera sanitaria (1,586).
Raggio 2,2 su 17,6 = 12,5% del lato corto: è una scelta percettiva, non il valore ISO reale (che sarebbe 1,1 e legge spigoloso a dimensione di icona).

La fascia è **ritagliata** sul profilo della tessera con `clipPath`, non sovrapposta. È il dettaglio che la fa leggere come parte della carta invece che come un adesivo.

---

## Come usarli

**In HTML**

```html
<img src="assets/icon.svg" width="32" height="32" alt="CF Ready">
```

Se il wordmark è già presente come testo accanto, l'immagine è decorativa: `alt=""`.

**Versione mono**

Il colore si controlla dall'esterno con `currentColor`:

```html
<span style="color:#1A211C">
  <img src="assets/icon-mono.svg" width="24" height="24" alt="CF Ready">
</span>
```

Aperta da sola il file usa il verde bottiglia come colore di default.

**Token**

```html
<link rel="stylesheet" href="assets/tokens.css">
```

I token valgono per il sito pubblico e i materiali. **Non** vanno usati dentro l'app embedded: là valgono esclusivamente i token Polaris (brand-foundation §2.6 e §8.13).

---

## Verifica in contesto — risultati

Marchio renderizzato alle dimensioni reali sui fondi effettivi dell'Admin e in una griglia tipo App Store (28 luglio 2026).

| Contesto | Esito |
|---|---|
| Nav Admin chiara `#F1F1F1` | ✅ La versione positiva stacca bene. La fascia resta visibile anche a 16 px. |
| Nav Admin scura `#1A1A1A` | ❌ **La versione positiva fallisce**: verde bottiglia su quasi-nero dà **1,7:1**, la tessera si fonde col fondo. Su fondi scuri va usata `icon-negative.svg`, che dà 16,0:1. |
| Griglia App Store, 88 px | ✅ Legge distinta fra icone vicine e non viene confusa con un prodotto Shopify. |
| Favicon 16 px | ⚠️ La sigla non è leggibile: a quella dimensione l'identità la portano sagoma e fascia. Accettabile e coerente con il limite di 16 px. |

**Regola che ne deriva:** su qualunque superficie più scura di circa `#6B6A5C` si usa la versione negativa. Non è una preferenza estetica, è un requisito di contrasto.

Il controllo è stato fatto su ricostruzioni fedeli dei fondi dell'Admin, non dentro l'Admin reale: la verifica definitiva va rifatta con l'app installata sul dev store (M1) e sullo store reale (M10).

---

## Regole non negoziabili

- Dimensione minima del marchio: **16 px**. Sotto, non usarlo.
- Su fondi scuri: sempre la versione negativa. Mai la positiva.
- Area di rispetto su ogni lato: l'altezza della fascia, cioè 4,8 unità sulla griglia a 32.
- Esistono solo tre versioni: positiva, negativa, mono. Non ricolorare, non creare varianti.
- Nessun gradiente, nessuna ombra, nessuna rotazione, nessun contorno aggiunto, nessuna deformazione.
- Il wordmark non si compone dentro la tessera.
- Il nome esteso `CF Ready — Codice Fiscale nel Checkout` è copy editoriale,
  non una lockup: si compone accanto al marchio. Il nome App Store pubblicato è
  `CF Ready - Codice Fiscale`.
- L'arancio non è mai un colore di stato. Dentro l'app non entra nessun colore di brand.

---

## Verifiche residue

1. **Verifica dentro l'Admin reale.** Il controllo di contrasto qui sopra è su ricostruzioni dei fondi: va rifatto sullo store reale in M10.
2. **Testo nell'icona.** L'owner ha approvato la variante con sigla; quella senza testo resta il rimedio se Shopify la contesta.
