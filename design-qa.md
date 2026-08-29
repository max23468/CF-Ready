# Design QA — simulatore checkout

## Evidenze

- Verità visiva di partenza: `/Users/Matteo/.codex/visualizations/2026/08/29/01a04de1-5e8a-7490-90c0-6586870d46aa/cf-ready-simulator/audit-12-final-native-dropdown-spacing.png`
- Implementazione finale: `/Users/Matteo/.codex/visualizations/2026/08/29/01a04de1-5e8a-7490-90c0-6586870d46aa/actual-cf-ready-preview/colored-short-copy-comparable-720.png`
- Confronto affiancato: `/Users/Matteo/.codex/visualizations/2026/08/29/01a04de1-5e8a-7490-90c0-6586870d46aa/actual-cf-ready-preview/mock-vs-colored-short-copy.png`
- Vista mobile finale: `/Users/Matteo/.codex/visualizations/2026/08/29/01a04de1-5e8a-7490-90c0-6586870d46aa/actual-cf-ready-preview/mobile-preview-address-last-neutral-clear.png`
- Vista desktop finale: `/Users/Matteo/.codex/visualizations/2026/08/29/01a04de1-5e8a-7490-90c0-6586870d46aa/actual-cf-ready-preview/desktop-preserved-neutral-clear.png`

## Normalizzazione

- Stato confrontato: italiano, Codice Fiscale obbligatorio, PEC facoltativa, avvisi preventivi attivi, checkout bloccato.
- Sorgente: 1440 × 1000 px.
- Implementazione: viewport CSS 720 × 500 px, device scale factor 1; acquisizione 720 × 500 px normalizzata a 1440 × 1000 px per il confronto con la sorgente ad alta densità.
- Mobile: viewport CSS 390 × 844 px, device scale factor 1; nessun overflow orizzontale (`scrollWidth = innerWidth = 390`).

## Verifica finale

- Tipografia: mantiene famiglia, pesi e gerarchia Polaris della pagina; il nuovo soprattitolo resta secondario rispetto a “Checkout di prova”.
- Spaziatura e layout: la scheda ha ora una cornice dedicata, testata riconoscibile, aree separate per destinazione e dati fiscali e un footer azioni stabile. Su mobile l'ordine è Codice Fiscale, PEC, anteprima e infine il box “Interno”; su desktop il box “Interno” resta nella colonna sinistra. Il ritmo resta coerente con le altre sezioni della pagina.
- Colori e token: la base usa una tinta verde molto chiara coerente con il mock e con il marchio CF Ready. Le azioni usano verde salvia, grigio neutro e verde scuro; “Svuota” usa sfondo `#f1f2f3`, bordo `#c9cccf` e testo `#303338`. Lo stato del checkout resta leggibile anche senza affidarsi soltanto al colore grazie a icona e testo.
- Asset: usa il favicon CF Ready già presente nel progetto, senza sostituti o asset ricostruiti.
- Copy: resta bilingue e non introduce termini tecnici destinati al merchant.
- Interazioni: verificati blocco ed errore dopo “Procedi al pagamento”, stato pronto con esempi validi, regole non applicate cambiando paese e aggiornamento immediato con avvisi preventivi. Console senza warning o errori.

## Cronologia del confronto

1. Prima iterazione: la testata si spezzava eccessivamente nella colonna desktop stretta. Correzione: griglia locale responsive e allineamento del marchio alla copia.
2. Seconda iterazione: le azioni secondarie si distribuivano in modo asimmetrico. Correzione: riga secondaria dedicata e CTA primaria a tutta larghezza.
3. Terza iterazione: il simulatore e le azioni apparivano ancora troppo nativi. Correzione: fondo verde tenue e bottoni proprietari con palette CF Ready, focus visibile, hover e riduzione delle animazioni quando richiesta dal sistema.
4. Quarta iterazione: su mobile il box “Interno” interrompeva la continuità tra regole e simulatore, mentre “Svuota” aveva un tono sabbia troppo caratterizzato. Correzione: ordine responsive dedicato e azione secondaria neutra, senza alterare il desktop.
5. Confronto finale: nessun problema P0, P1 o P2 residuo.

## Follow-up P3

- La maggiore gerarchia visiva rende la scheda più alta della versione iniziale: è un compromesso intenzionale e la CTA resta immediatamente raggiungibile con uno scorrimento breve nella colonna desktop.

final result: passed
