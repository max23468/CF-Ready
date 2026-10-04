# Gruppo 1: pubblicazione e verifica Development

Pubblicazione autorizzata il 3 ottobre 2026, senza promozione Production.
[PR #626](https://github.com/max23468/CF-Ready/pull/626) unita in squash.
Commit distribuito `fd1fb757e241298d78bfef679f31f7368ec81169`, tree
`65e565a7dfcd14de7b8ba2943abb56f26489fcde`, identico al candidato locale.

| Ricevuta | Valore |
| --- | --- |
| Ambiente | Development |
| Shopify | `2.0.3-dev.65e565a7dfcd` |
| Worker deployment | `aff975d9-fdb2-4469-940d-05f3e40288c8` |
| Worker versione al 100% | `dd41a437-be38-4da4-89d7-3c703ebc5c39` |
| Rollback Worker | `be664bf4-0a6f-49c7-a0eb-e58a82e1ad41` |
| Rollback Shopify | `2.0.2-dev.14da91b952ed` |
| Deploy, smoke e readback | [Run 37141601325](https://github.com/max23468/CF-Ready/actions/runs/37141601325), verdi |

Ricevuta provider salvata in
[deploy-receipt-development.json](evidence/2026-10-03-polaris2-gruppo-1-live/deploy-receipt-development.json).
Migrazioni: nessuna nel diff, applicata o pendente; applicazione e readback
riportano entrambi `No migrations to apply!`.
Il coordinatore ha eseguito `publish:development`, gate locale full e coverage
prima del push; tutti i check obbligatori della PR, inclusa mutation, sono verdi.
Coverage finale: statement 98,32%, branch 96,05%, funzioni 99,20%, linee 98,60%.

## Verifica live

Scheda dedicata Chrome sullo store `cf-ready-polaris-2.myshopify.com`, nuovo
Admin. Riscontri del 3 ottobre 2026 dopo il deploy, con screenshot osservate
durante la sessione e letture DOM. Un solo bundle `polaris-2.0-rc.js` rilevato.
Nessun errore console rilevante rilevato; i due warning iniziali provengono
dall'host Shopify, relativi a ShopifyQL senza Direct API Access e inizializzazione
deprecata dell'host.

| Finding | Riscontro sul codice distribuito |
| --- | --- |
| V2-T1 | Pannelli Regole contenuti in `s-box`, bordo custom dei disclosure 0 px; FAQ con quattro divider nativi nel primo gruppo e nessun bordo custom. Esempi Messaggi e onboarding senza palette rosa fissa. |
| V2-R1 | A 390 px nessun troncamento nello shadow DOM dei badge “Nessuna etichetta fiscale rilevata”, “Verifica manuale richiesta” e “Aggiornati”. |
| V2-R2 | Casi con sfondo trasparente, senza box grigio; larghezza e scrollWidth entrambi 260 px a mobile e 409 px a desktop. Nessun taglio. Store in modalità Disattivata: procedure pendenti coperte dalla matrice locale, senza forzarle live. |
| V2-M1 | Messaggi a 390 px: icona x64–84 e testo x96–326, entrambi con top 573 px; scrollWidth uguale alla larghezza viewport 390 px. |
| V2-M2 | Titolo “Esempio del messaggio”, nota sulla resa Shopify, nessuna icona alert nel componente. Verificati messaggi cliente IT/EN tramite selettore senza salvataggio. Onboarding completato rivisto direttamente al passo 3: quattro esempi, nessun “Ordine non completato”, nota Shopify presente; nessun overflow a 390 px. |

Desktop del browser 1280×900, iframe Regole largo 1056 px; mobile 390×844.
Viewport temporaneo ripristinato: iframe Home finale largo 1216 px. Home
finale: Validation disattivata, CF/PEC non gestiti, messaggi predefiniti.
Nessuna attivazione, billing, salvataggio di regole, messaggi o lingua profilo.
La navigazione di revisione onboarding non salva progressi quando già completato;
il passo 3 è stato aperto direttamente nell'URL, evitando il salvataggio del passo 2.

La lingua merchant live resta italiana: il parametro `locale=en` nell'URL Admin
non cambia la lingua dell'iframe, imposta dall'host. Merchant EN, vecchio tema,
testi lunghi e casi manuali restano verificati localmente in Chromium/WebKit,
IT/EN, desktop/390 px, bundle Polaris 1 e 2. Le screenshot locali sono nel
registro pubblicato del gruppo 1. Non è stata forzata una configurazione
funzionale dello store per ottenere nuovi stati visivi.

Il gruppo 2 resta separato e non è incluso nella PR #626. Il relativo finding
V2-R3 resta visibile sullo store finché quel gruppo non viene integrato.
Production non è stata promossa; nessun tag o release Production creato.
