# Polaris 2: correzioni locali, gruppo 1

Branch `codex/polaris2-gruppo-1`, base `a5cf9bac0f411f51568bcbd5285951f904b8eb2c`
da `origin/develop` aggiornato. Worktree dedicato `CF-Ready-polaris2-gruppo-1`,
accanto al checkout principale.
Alla consegna locale nessun commit, push, PR, deploy o modifica allo store. L'audit originale e le sue
prove restano nel checkout principale, intatti.

Fonte: audit locale `2026-10-03-audit-ui-ux-development-2.0.md`, findings V2-T1,
R1, R2, M1, M2. Confrontate le catture 08, 35 e 44 dell'audit. La guida
[Shopify Polaris 2](https://shopify.dev/docs/apps/build/app-home/polaris2),
consultata il 3 ottobre 2026, indica di preferire Web Components alle superfici
custom e di verificare entrambe le apparenze.

## Esiti e file

| Finding | Correzione | File principali | Prova locale |
| --- | --- | --- | --- |
| V2-T1 | Cornici dei pannelli etichette affidate a `s-box`; separatori FAQ nativi `s-divider`. Rimossi i fallback `--p-*`, la cornice del chevron, il rosa fisso e le dimensioni font copiate. Focus tramite outline del browser. | `RulesLayout.css`, `Address2CheckoutLabels.tsx`, `NativeCheckoutLabels.tsx`, `app.guide.tsx/css`, `CustomerMessagesPreview.tsx/css` | [Regole desktop](evidence/2026-10-03-polaris2-gruppo-1/polaris2/gruppo1-labels-it-chromium-1280.png), [FAQ EN mobile](evidence/2026-10-03-polaris2-gruppo-1/polaris2/gruppo1-guide-en-chromium-390.png) |
| V2-R1 | Titolo e badge vanno su righe distinte sotto 600 px; desktop con wrapping. Nessuna abbreviazione degli stati, riepilogo completo conservato. | `RulesLayout.css` | [IT 390](evidence/2026-10-03-polaris2-gruppo-1/polaris2/gruppo1-labels-it-chromium-390.png), [EN 390](evidence/2026-10-03-polaris2-gruppo-1/polaris2/gruppo1-labels-en-chromium-390.png) |
| V2-R2 | Una cornice nativa per pannello; casi distinti mediante titolo e spazio, senza box grigi o cornice della procedura. Spiegazione mercato come testo discreto, confronto attuale/proposto prima delle note e della procedura. Modalità, conteggi e ultima lettura restano disponibili. | `NativeCheckoutLabels.tsx`, `RulesLayout.css` | Stesse catture Regole, con procedura aperta |
| V2-M1 | Griglia nativa a due colonne, icona e testo flessibile allineati in alto. | `CustomerMessagesPreview.tsx` | [Messaggi EN 390](evidence/2026-10-03-polaris2-gruppo-1/polaris2/gruppo1-messages-en-chromium-390.png) |
| V2-M2 | Scelta dell'alternativa prevista dall'audit: “Esempio del messaggio” / “Message example”, testo critico in superficie neutra e nota IT/EN che posizione e aspetto dipendono da Shopify. Eliminati titolo ordine e icona alert inventati. Aggiornati anteprima principale, esempi sotto ogni campo e passo 3 onboarding. | `CustomerMessagesPreview.tsx/css`, `app.messages.tsx`, `app.onboarding.tsx`, `i18n/it.ts`, `i18n/en.ts` | [Messaggi IT desktop](evidence/2026-10-03-polaris2-gruppo-1/polaris2/gruppo1-messages-it-chromium-1280.png), [Onboarding IT 390](evidence/2026-10-03-polaris2-gruppo-1/polaris2/gruppo1-onboarding-it-chromium-390.png) |

## Verifiche

- Classificazione `scripts/ci-lane.mjs`: `standard`, nessun dominio mutation.
- `npm run check:standard`: verde, 701 test app, 203 UI, 195 Function;
  docs, lint, formato, typecheck, build app/Function e Worker dry-run verdi.
- Test esistenti aggiornati: `components`, `messages-route`, `rules-route`,
  `messages-ui`, `visual-surfaces`. Aggiunta nello stesso file visuale la matrice
  Regole con casi guidati, Messaggi, onboarding passo 3 e FAQ, IT/EN,
  1280/390 px, Chromium/WebKit, bundle Polaris 1 e 2. Verificati troncamento
  nello shadow DOM dei badge, posizione icona/testo e overflow orizzontale,
  anche dentro i casi etichette: le griglie hanno una colonna a minimo zero
  per evitare che `s-box` tagli contenuti di larghezza intrinseca maggiore.
- `npm run coverage:check`: verde; statement 98,31%, branch 96,04%,
  funzioni 99,20%, linee 98,60%. Tutte le soglie del gate rispettate.
  Dopo il fix del dimensionamento interno ripetuti gate `standard`,
  `coverage:ui` e `node scripts/coverage-report.mjs`, riusando le raccolte
  app/Function/operations invariate; stessi esiti e percentuali.
- `npm run check:docs`: verde, anche per registro e rimandi alle prove.
- `git diff --check`: verde. Mutation non eseguita: diff fuori dal perimetro.

Le 32 catture Chromium sono salvate nelle cartelle `polaris1` e `polaris2` sotto
`evidence/2026-10-03-polaris2-gruppo-1/`; le catture WebKit generate sono in
`tests/browser/__screenshots__/visual` e `visual-v2`, ignorate da Git.
Le catture salvate usano un viewport esterno ampio per evitare il ridimensionamento
del runner Vitest; il viewport del contenuto resta 1280 oppure 390 px.
Sono prove del codice locale con fixture sintetiche. I bundle reali sono
`polaris.js` e `polaris-2.0-rc.js`; nessuna autenticazione o chiamata allo store.
Non riproducono l'iframe Admin e il segnale App Bridge `new_admin_design`:
l'allineamento finale nel nuovo host resta da riconfermare. Le catture del live
sono state usate solo come confronto iniziale, mai come prova dei fix.

## Integrazione

Il gruppo 2 può toccare `app.guide.tsx`, `i18n/it.ts`, `i18n/en.ts` e
`tests/browser/visual-surfaces.test.tsx`: integrare i relativi hunk conservando
divider FAQ, diciture/nota degli esempi e matrice del gruppo 1. In
`NativeCheckoutLabels.tsx` conservare la distinzione semantica V2-R3 del gruppo 2:
qui non è stata cambiata la scelta dello stato iniziale. Su richiesta successiva
dell'owner viene preparata la patch `2.0.3` per pubblicare questo gruppo soltanto
in Development, senza promozione Production.
UX-C1/C2, validazione, billing e configurazione store fuori dal diff.
