# Polaris 2: correzioni locali del gruppo 2

Data: 3 ottobre 2026. Branch: `codex/polaris2-fix-gruppo-2`.
Base: `origin/develop`, commit `a5cf9bac0f411f51568bcbd5285951f904b8eb2c`.
Worktree locale dedicato: `CF-Ready-polaris2-gruppo-2`.

Fonte: audit originale non tracciato nel checkout principale,
`docs/plans/2026-10-03-audit-ui-ux-development-2.0.md` del checkout principale.
Audit e prove originali preservati. Confronto con le catture native 08 e
con le prove 21, 35, 41, 50–52. Nessuna scrittura remota, commit o pubblicazione.

## Esiti dei cinque findings

| Finding | Correzione e file | Prove e verifica |
| --- | --- | --- |
| V2-T2 | `app/routes/app.guide.tsx`: FAQ usa `s-section heading` e il comando nello slot `secondary-actions`. Stesso contratto dei titoli principali di Home, Regole e Messaggi; collocazione, peso e distanza gestiti dal tema. Aside invariato. | Catture `group2-guide-top-*`, confronto con Home e benchmark nativo. Titolo unico accessibile, azione senza sovrapposizione su desktop e a 390 px. |
| V2-R3 | `app/features/rules/NativeCheckoutLabels.tsx`, `app/i18n/it.ts`, `app/i18n/en.ts`: zero casi manuali e scelta pendente mostra «Da configurare» / «Set up required»; casi realmente pendenti mostrano «Da verificare» / «Needs review». Arancione indica in entrambi un passo necessario. Errori e scelta già accettata conservano priorità e semantica. | Test in `tests/browser/rules-route.test.tsx` per IT/EN, contatori zero/uno, tono warning. Catture `group2-labels-choice-*` e `group2-labels-manual-*`: testo completo a 390 px. Workflow e persistenza invariati. |
| V2-G1 | `app/i18n/en.ts`: «Frequently asked questions». | Catture `group2-guide-top-en-*`; comando Expand all e Collapse all esercitato a 1280 e 390 px, nessuna sovrapposizione con il titolo. |
| V2-H1 | Feature Home, `HomeSections.tsx`; `app/i18n/trial-continuity.ts`: banner della prova con frase sintetica, data e azione. Stato del controllo già presente sopra il banner. La scelta dei piani conserva primo addebito e giorni gratuiti residui per gli abbonamenti, approvazione Shopify e perdita dei giorni residui per il pagamento unico, senza aggiungere un secondo paragrafo equivalente. | Catture `group2-home-top-*` e `group2-plans-*`. Test su entrambe le lingue: un solo paragrafo nel banner, altezza inferiore a 180 px a 390 px; le condizioni degli addebiti restano nei piani. Logica di prova, scadenza e billing invariata. |
| V2-H2 | Feature Home, `PlanChoice.tsx`; dizionari IT/EN: prezzo con `s-heading fontSize="large-200"`, ruolo presentation; periodicità in testo subdued sulla stessa baseline. Struttura identica per mensile, annuale e unico. | Catture `group2-plans-*`: prezzi derivati dal piano del loader e dal formatter esistente, nessun prezzo nuovo hardcoded nell’app. Test su allineamenti e valori reali della fixture. Badge Consigliato e primaria annuale preservati. |

## Verifica locale

La preview usa fixture sintetiche e componenti applicativi reali nei test browser
esistenti, senza autenticazione e senza chiamate allo store. Matrice:
Chromium e WebKit, bundle Polaris 2.0 RC e precedente, IT/EN, 1280 e 390 px.
Le catture conservate sono quelle Chromium; WebKit è coperto dai test.
I file PNG prodotti da Vitest sono ridimensionati dal runner: i viewport CSS
sono quelli indicati nei nomi e nei test, non le dimensioni raster dei file.

Prove generate in `docs/plans/evidence/2026-10-03-polaris2-gruppo-2/`:
`polaris2/` e `precedente/`. Le catture del vecchio live sono soltanto baseline.

Catture rappresentative a 390 px:
[Home EN](evidence/2026-10-03-polaris2-gruppo-2/polaris2/group2-home-top-en-chromium-390.png),
[piani EN](evidence/2026-10-03-polaris2-gruppo-2/polaris2/group2-plans-en-chromium-390.png),
[FAQ EN](evidence/2026-10-03-polaris2-gruppo-2/polaris2/group2-guide-top-en-chromium-390.png),
[scelta IT](evidence/2026-10-03-polaris2-gruppo-2/polaris2/group2-labels-choice-it-chromium-390.png),
[verifica IT](evidence/2026-10-03-polaris2-gruppo-2/polaris2/group2-labels-manual-it-chromium-390.png),
[piani nel tema precedente](evidence/2026-10-03-polaris2-gruppo-2/precedente/group2-plans-it-chromium-390.png).

Controlli:

- Corsia `standard` classificata da `scripts/ci-lane.mjs`; nessun dominio mutation.
- Test mirati Home e continuità: 52 verdi; route Home, Guida e Regole: 76 verdi
  prima dei nuovi casi; i nuovi casi IT/EN sono inclusi nel gate completo.
- Gate standard finale verde:
  701 test applicativi, 207 UI, 195 Function, docs, lint, formato, typecheck,
  build applicazione e Function, deploy Worker soltanto in dry-run.
- Coverage finale verde: statement 98,31%, branch 96,04%, funzioni 99,20%,
  righe 98,60%. La prima raccolta concorrente aveva sei timeout;
  le raccolte complete successive sono verdi.
- Non eseguiti E2E pubblici e doctor; mutation non richiesta dalla classificazione.
- Validatore della skill: snippet nativi validi contro il catalogo v1.1.
  Il catalogo installato non supporta 2.0 RC; contratto 2.0 verificato nelle
  fonti Shopify correnti, nei tipi installati `2.0.0-rc.1`, nel typecheck
  e nel rendering reale del bundle 2.0 RC.

Fonti correnti:
[migrazione Polaris 2](https://shopify.dev/docs/apps/build/app-home/polaris2),
[Section 2.0 RC](https://shopify.dev/docs/api/app-home/v2.0-rc/web-components/layout-and-structure/section),
[Heading 2.0 RC](https://shopify.dev/docs/api/app-home/v2.0-rc/web-components/typography-and-content/heading).

## Limiti e integrazione

Non verificati l’host Admin embedded con queste modifiche sul nuovo store,
Menu/Sidekick dell’host, device fisico, dark mode e nuove varianti commerciali.
La preview locale prova composizione e runtime Polaris; non prova il deploy
o lo stato live `2.0.2-dev.14da91b952ed`. Nessun billing o onboarding avviato.

I file condivisi con il gruppo 1 sono soprattutto `NativeCheckoutLabels.tsx`,
i dizionari IT/EN e i test delle superfici. Conservare i badge brevi e il ramo
`statusChoiceRequired` quando si integra V2-R1. Nessuna modifica a CSS, ai box
di V2-R2, alle anteprime di V2-M1/M2 o a UX-C1/C2. Nessun messaggio all’altra chat.

Worktree e branch restano disponibili con modifiche non committate. SemVer e
changelog della futura PR andranno preparati una sola volta dopo l’integrazione
dei due gruppi; nessun manifest o lockfile modificato qui.
