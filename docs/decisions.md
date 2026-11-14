# Registro decisioni

Le decisioni ancora in vigore, raggruppate per tema. Ogni voce dice cosa si è
deciso e perché; come si applica oggi sta nel documento di tema indicato in
testa alla sezione. Una `D-nnn` citata altrove e assente qui è superata o
esaurita: testo integrale e cronologia di D-001…D-219 stanno in
[archivio](archive/decisions-2026.md).

Una decisione nuova entra solo se c'era un'alternativa reale. Prende il numero
successivo all'ultimo usato, sta in una o due righe, entra nella stessa PR che
aggiorna il documento di tema e, nella stessa PR, toglie dal registro le voci
che supera e le copie della regola negli altri documenti. Soglie, orari, nomi di
risorse e misure stanno nel documento di tema, non qui.

## Perimetro e piattaforma

Documento di tema: [product.md](product/product.md).

| ID | Decisione | Perché |
|---|---|---|
| D-003 | Public app sullo Shopify App Store. | Serve a usare le Functions su tutti i piani. |
| D-004 | Nessuna differenza per Shopify Plus. | Stessa funzione su ogni piano. |
| D-005, D-006 | Niente Partita IVA né Codice SDI. | Campi non affidabili o non nativi, che richiederebbero tema, carrello o Plus. |
| D-007 | Niente Theme App Extension né Checkout UI Extension. | Fragili, diverse su Plus e aggirate dai checkout accelerati. |
| D-008 | Solo `TAX_CREDENTIAL_IT` e `TAX_EMAIL_IT`. | Sono i localized fields italiani esposti alla Validation Function. |
| D-040 | Scope obbligatorio solo `write_validations`; ogni altro scope è facoltativo e legato a un'opzione del merchant (D-149, D-206). | Nessun accesso a ordini, clienti, prodotti o inventario senza un requisito approvato. |
| D-041 | Permessi staff nativi Shopify, senza ruoli app. | Rispetta le deleghe del merchant. |
| D-080 | Due sole app e ambienti, Development e Production. | Una terza app duplicherebbe configurazioni senza isolamento reale. |
| D-090 | Dev store Basic `cf-ready-dev` e `cf-ready-polaris-2`, il secondo con il nuovo Admin. | Confrontare l'app embedded con entrambe le versioni dell'Admin. |
| D-103 | Nessuna promessa sugli ordini ricorrenti successivi al primo. | La Validation non li copre. |
| D-137 | M12 si chiude quando Shopify assegna lo status Built for Shopify. | Idoneità o candidatura non bastano; i criteri locali restano segnali. |
| D-143 | App disponibile in ogni Paese; l'applicabilità si decide nel singolo checkout. | Sede, mercati e zone di spedizione non descrivono il checkout effettivo. |

## Regole e validazione nel checkout

Documenti di tema: [requirements.md](product/requirements.md) e
[architecture.md](engineering/architecture.md#shopify-function).

| ID | Decisione | Perché |
|---|---|---|
| D-010 | Stato iniziale `unmanaged` per entrambi i campi, Validation disattivata. | Nessun blocco accidentale dopo l'installazione. |
| D-011 | Salvare le regole e attivare la Validation restano azioni separate. | Il merchant prepara la configurazione senza toccare il checkout. |
| D-012, D-013 | Facoltativo significa vuoto ammesso, ma valido se compilato, per CF e PEC. | Non accettare dati formalmente errati. |
| D-014, D-015 | CF ordinario a 16 caratteri e numerico a 11 cifre sempre accettati se formalmente validi, senza opzione merchant. | Non bloccare identificativi legittimi. |
| D-016, D-145 | Validazione formale rafforzata: date impossibili e carattere di controllo del numerico rifiutati, `00000000000` incluso. | Rifiuta sequenze impossibili senza attestare identità o esistenza. |
| D-018 | Normalizzare solo per validare, senza riscrivere il dato nel checkout. | La Function valida e non muta l'input. |
| D-020 | Errori CF e PEC mostrati insieme. | Il cliente corregge tutto in un tentativo. |
| D-030 | Ritiro e ordini misti inclusi se i campi sono presenti o una consegna è italiana. | Copre i casi reali senza POS. |
| D-031, D-095 | Configurazione assente, corrotta o sconosciuta e ogni incidente sono fail-open. | Un errore dell'app non ferma le vendite. |
| D-101 | Validation con `blockOnFailure: false`. | Bloccano gli errori di business, non un'eccezione runtime. |
| D-102 | Una sola Validation per store, mai toccare quelle di altre app. | Il limite Shopify è condiviso con altre app. |
| D-146 | Un solo comportamento automatico: a Interaction errori inline sui campi materializzati, Completion sempre attivo. | Evita box globali al caricamento e blocchi finali poco chiari. |
| D-147 | La PEC ha la modalità `required_when_company`, obbligatoria con il campo Azienda compilato. | Usa un dato già esposto, senza nuovi scope. |
| D-155 | Il simulatore segue il gate preventivo della Function con una matrice condivisa e spiega in locale la causa formale dei valori rifiutati. | Anteprima fedele senza trasmettere i valori. |
| D-161, D-177 | Dopo il messaggio di CF o PEC non validi, una frase fissa IT/EN sulla causa formale. | Il cliente corregge senza tentativi alla cieca. |
| D-192 | Opzione facoltativa “Blocca anche quando Shopify non mostra il campo” per i campi obbligatori con fatturazione italiana. | Copre i pagamenti rapidi che saltano il modulo, a scelta del merchant. |
| D-193 | A Completion ogni errore di campo si ripete anche su `$.cart`. | Dopo un pagamento esterno il messaggio resta visibile in alto. |
| D-215 | La Function continua ad accettare numerici a 11 cifre e omocodie anche se il campo nativo Shopify li rifiuta; simulatore, FAQ e sito lo dichiarano. | Non legarsi a una regola Shopify non documentata che potrebbe cambiare. |

## Billing

Documento di tema: [billing.md](product/billing.md).

| ID | Decisione | Perché |
|---|---|---|
| D-038 | Shopify è autorevole per Validation e billing; D1 conserva copie e stato operativo. | Una sola fonte di verità. |
| D-044…D-046 | Prova comune di 14 giorni, unica per store, fino alle 23:59 del quattordicesimo giorno nel fuso dello store. | Copre anche chi compra una tantum e previene abusi. |
| D-126 | La prova parte su richiesta del merchant. | Il merchant sceglie quando consumarla. |
| D-047, D-048 | Mensile, annuale e pagamento unico con le stesse funzioni, tramite Manual Pricing; il pagamento unico è su richiesta (D-221). | Nessun tier artificiale; App Pricing non supporta l'una tantum. |
| D-049, D-050 | Cambio e cancellazione con il comportamento Shopify standard, senza credito pro rata. | Nessun calcolo parallelo. |
| D-051, D-052 | Passaggio a pagamento unico: prima l'acquisto, poi la cancellazione; contratto, vendita, incasso e payout sono fatti distinti. | Se l'acquisto fallisce l'abbonamento resta; nessuna promessa di incasso. |
| D-053…D-055 | Rimborso una tantum manuale; pagamento unico legato allo store e comprensivo degli aggiornamenti. | Eccezioni valutate a mano; nessuna frammentazione. |
| D-056…D-061 | Prezzi per generazione (lancio, bilanciato, futuro solo con più valore), mantenuti durante il rapporto e nei cambi di piano, anche per le prove iniziate in promozione. | Premia chi arriva prima senza aumenti legati al solo tempo. |
| D-129 | In Production addebiti reali; i diritti si leggono da Shopify senza filtrare il flag test. | Il reviewer deve vedere il piano attivo. |
| D-131, D-207 | Addebiti sempre in EUR; il controvalore USD in listing è il più piccolo importo in `,x9` la cui stima Shopify in euro supera l'addebito di almeno lo 0,5%. | Prezzo unico; la stima in euro della listing non scende sotto l'addebito. |
| D-135 | Omaggi permanenti assegnati dall'owner, senza charge Shopify. | Lo store dell'owner usa l'app senza pagarla. |
| D-221 | Dalla 2.8.0 le nuove prove ricevono il prezzo bilanciato; il pagamento unico esce dal listino e l'owner lo assegna al singolo store a un prezzo concordato. Restiamo su Manual Pricing. | App Pricing ha solo prezzi in USD, convertiti con l'1,5% a carico del merchant o dell'owner, e nessuna una tantum. |
| D-160 | Il ciclo periodico rilegge il billing e aggiorna il diritto nel metafield. | I rinnovi Shopify non inviano webhook. |

## Interfaccia e contenuti

Documenti di tema: [ui-content.md](product/ui-content.md) e
[brand-foundation.md](brand/brand-foundation.md).

| ID | Decisione | Perché |
|---|---|---|
| D-021…D-023 | Otto messaggi IT/EN personalizzabili, fallback inglese, massimo 200 caratteri e mai vuoti. | Checkout multilingua con testi leggibili. |
| D-062 | Home come centro operativo guidato, non dashboard. | I KPI sarebbero artificiali per un'app verticale. |
| D-063, D-073 | Onboarding in quattro passaggi, riapribile; la checklist sparisce a setup completo. | Percorso guidato senza checklist permanente. |
| D-064, D-065 | Azioni Home separate; Save Bar nativa senza auto-save. | Controllo esplicito delle modifiche. |
| D-067…D-069 | Condizione Italia visibile nel simulatore; riepilogo e simulatore locale dichiarato come anteprima; messaggi con selettore della lingua. | Il merchant vede l'effetto delle regole senza confonderlo col checkout reale. |
| D-070 | Annuale “Consigliato”; l'una tantum si chiama “Pagamento unico”. | Evitare “Lifetime”. |
| D-071 | Lingua UI da Shopify, senza selettore, fallback inglese. | Ogni staff vede la sua lingua. |
| D-072 | FAQ in una pagina con sezioni espandibili. | Meno pagine. |
| D-078 | UI con Polaris e App Bridge Web Components. | Coerenza con l'Admin e poca manutenzione. |
| D-088 | Richiesta di recensione neutrale e non incentivata, soltanto con il prompt nativo in app; dal 10 novembre 2026 niente richieste via email. | Feedback autentico; Shopify vieta le email non richieste che sollecitano recensioni. |
| D-127 | In UI si dice «controllo nel checkout», mai «Validation». | Il termine tecnico non dice nulla al merchant. |
| D-128 | Nessuna pagina di accesso col dominio dello store. | Requisiti App Store 2.3.1 e 2.3.2. |
| D-130, D-166 | App URL `/app`, una sola voce Home visibile. | Evita il redirect nell'LCP e il menu vuoto. |
| D-144 | Bozze protette durante i salvataggi, con recupero esplicito dei conflitti; diagnosi guidata su richiesta; report aggregati di attivazione e prestazioni. | Mai un salvataggio forzato; supporto e misure dalle fonti esistenti, senza nuovi scope, provider o contenuti merchant. |
| D-149 | Gestione facoltativa delle etichette native CF e PEC e controllo delle etichette della seconda riga dell'indirizzo, con consenso, dichiarazione del merchant sull'opzione del modulo e ripristino prudente (ADR 0003). | Il merchant controlla le etichette senza perdere le sue; Shopify non espone l'opzione del modulo. |
| D-167, D-199 | La Home mostra subito lo stato D1, riceve la conferma Shopify in streaming e tiene il layout del primo paint. | LCP e CLS restano sul documento iniziale. |
| D-172 | Ogni limite si dichiara una volta, dove cambia una decisione. | Testi meno difensivi. |
| D-173 | Orari al merchant nel fuso dello store, con sigla; diagnostica in UTC. | Leggibilità per il merchant. |
| D-174 | Niente cronologia né ripristino di configurazioni precedenti. | Il ripristino riscriveva il checkout senza conferma. |
| D-176 | Assistenza con tawk.to, caricato alla prima apertura, senza dati automatici. | Supporto in app senza nuovi dati merchant. |
| D-201, D-202 | Criteri manuali Built for Shopify adottati; il dialogo “Gestisci piano” usa una bozza locale. | Requisiti di revisione BFS. |
| D-206, D-219 | Opzione facoltativa per salvare negli ordini CF maiuscolo e PEC minuscola (ADR 0008), ferma con Validation duplicate. | Richiesta merchant; la Validation non può modificare i valori. |

## Brand, sito e listing

Documenti di tema: [brand-foundation.md](brand/brand-foundation.md),
[design.md](brand/design.md) e [listing](listing/app-store-review.md).

| ID | Decisione | Perché |
|---|---|---|
| D-074 | Termini e Privacy bilingui con prevalenza italiana. | Privacy separata; i Termini includono billing e rimborsi. |
| D-075, D-151 | Sito su Cloudflare Pages a `cfready.it`, app Production su `app.cfready.it`. | URL leggibili e canonical stabili. |
| D-076, D-107 | Brand CF Ready, handle `cf-ready`; Brand Foundation vincolante. | Identità unica per UI, sito e listing. |
| D-108, D-110…D-112 | Palette, marchio «Tessera con fascia», negativo su fondi scuri, font di sistema e tracciati Jost. | Contrasto verificato e nessuna richiesta di font. |
| D-109 | Nessun colore di brand nell'app embedded. | L'app segue Polaris. |
| D-113 | Nessuna dark mode del sito. | Una superficie in meno. |
| D-114 | Icona della listing con la sigla `CF`. | Raccomandazione Shopify, non criterio di rifiuto. |
| D-100 | Screencast di review obbligatorio, video promozionale facoltativo. | Requisito App Store distinto dal marketing. |
| D-132 | Nessuno store né credenziali al reviewer. | L'app non ha login propri. |
| D-140 | Corsia organica fra sito e listing, con sole metriche aggregate. | Acquisizione verso le 50 installazioni BFS senza tracker. |
| D-224 | Le Guide crescono senza attendere trazione: una nuova ogni due settimane, scelta dalle ricerche lette ogni lunedì in Search Console e Bing; IndexNow a ogni deploy del sito. Supera la parte di D-140 su nuove pagine solo dopo trazione misurata e niente contenuto ricorrente. Deciso dall'owner il 12 novembre 2026. | Con 4 Guide e nessuna lettura regolare il sito non intercettava le domande dei merchant; FiscalBay mostra che Guide mirate escono in poche settimane. |
| D-152 | `robots.txt` con `ai-train=no`. | Indicizzazione e citazione sì, addestramento no. |
| D-153 | `supporto@cfready.it` per l'assistenza, `info@cfready.it` per il resto. | Recapiti di dominio. |
| D-200, D-212 | La Privacy indica i fornitori per categoria e descrive l'opzione ordini senza qualificare il ruolo di Temisfera. | Art. 13.1.e GDPR e testi coerenti con D-206. |

## Architettura, dati e infrastruttura

Documenti di tema: [architecture.md](engineering/architecture.md) e
[operations.md](runbooks/operations.md).

| ID | Decisione | Perché |
|---|---|---|
| D-032…D-034, D-036 | React Router e TypeScript su Cloudflare Workers, Function in TypeScript, D1 come unico database e session storage (ADR 0001). | Percorso Shopify raccomandato, un linguaggio, poca manutenzione. |
| D-037, D-104 | Un solo metafield JSON della Validation, in `$app:cf-ready-validation`. | Lettura unica e aggiornamento atomico. |
| D-099 | Niente ORM, i18n, state manager, framework CSS o codegen GraphQL. | Codice mirato e piattaforma nativa. |
| D-105 | Function API, Admin GraphQL e webhook `2026-10`; Partner API `2026-07`. | Ultima versione stabile per superficie. |
| D-133 | Webhook in Cloudflare Queues dopo il claim D1 e prima dell'ACK (ADR 0002). | Retry durevoli senza secondo stato. |
| D-142, D-165 | Web Vitals attribuiti alla rotta iniziale, inviati da uno script inline firmato HMAC. | Campioni coerenti anche quando l'iframe si chiude. |
| D-164, D-178 | Rinnovo anticipato dei token offline nel ciclo periodico, a lotti variabili. | Toglie il token exchange dal percorso LCP. |
| D-168 | Webhook dei manifest con URI assoluti sull'origine dell'ambiente. | Un URI relativo finiva su `/app/webhooks`. |
| D-169, D-171 | `shop/update` con Paese invariato riconosciuto senza D1; ACK senza coda per il solo store indicato in `SHOP_UPDATE_ACK_ONLY_SHOP`. | Timeout Shopify su consegne frequenti. |
| D-181, D-182 | Un solo Cron Trigger ogni cinque minuti; retention e fasi orarie in minuti distinti. | Slot di cron condivisi e CPU attribuibile per fase. |
| D-183 | CLI `cf` e `cloudflare.config.ts` come unica configurazione Workers; Wrangler solo per i comandi elencati (ADR 0004). | Una configurazione, mode esplicite. |
| D-184, D-185 | Code, D1 e R2 di entrambi gli ambienti nella jurisdiction `eu`. | Residenza dei dati coerente. |
| D-186 | Nessuna sezione `[events]` nei manifest. | Le sottoscrizioni restano webhook. |
| D-210 | `[network_access] allowed_sources` con origine del Worker e `tawk.to`. | Raccomandato da Shopify, anticipa un obbligo. |
| D-211 | La sottoscrizione `orders/create` si crea per store dall'azione Regole. | Il manifest accetta solo webhook coperti da scope obbligatori. |
| D-213 | `ORDER_NORMALIZATION_ENABLED` governa l'opzione ordini per ambiente. | Esposizione dopo l'approvazione Shopify. |
| D-216 | Soglie Cloudflare calcolate sul piano Workers Paid. | L'account è Paid; oltre la quota si paga, non si ferma il servizio. |

## Sicurezza, privacy e osservabilità

Documento di tema: [security-privacy.md](engineering/security-privacy.md).

| ID | Decisione | Perché |
|---|---|---|
| D-084, D-123, D-124 | Monitoraggio Cloudflare nativo senza Sentry; Workers Logs senza invocation log; Traces solo temporanee in Development. | Niente URL e SQL nei log, nessun destinatario in più. |
| D-085, D-086 | Backup D1 cifrati in R2, settimanali e mensili; configurazione conservata per un periodo limitato dopo la disinstallazione. | Oltre il Time Travel D1, poi minimizzazione. |
| D-087 | Telemetria tecnica minima senza opt-out. | Necessaria a operatività e sicurezza. |
| D-223 | I fatti che l'app tratta come stato permanente (check-in chiuso, recensione completata, ultima attivazione della Validation, installazione registrata) stanno in colonne di `app_state` e `shops`; `app_events` resta telemetria a scadenza. Scartata l'esenzione di quegli eventi dalla retention. | La retention non deve cambiare ciò che il merchant vede né generare notifiche false. |
| D-115, D-120 | Repository pubblico con branch protection, required check e scansioni GitHub; nessuna licenza finché l'owner non la sceglie. | Gate effettivi; la visibilità non concede diritti. |
| D-175 | `npm audit` blocca ogni avviso, salvo eccezioni legate a un solo avviso e con scadenza, elencate in `scripts/security-audit.mjs`. | Un avviso senza correzione compatibile non blocca le pubblicazioni fino a scadenza. |
| D-203, D-204 | Facciata del repository neutra; registri merchant nominativi solo in `private/`, fuori da Git. | Il repository è pubblico. |
| D-205 | Allowlist Admin API Shopify con gli ASN Cloudflare verificati. | Requisito Shopify. |
| D-209 | `shopify app security check` deterministico nel job `verify`, con i soli finding motivati ammessi. | Scansione ufficiale senza LLM in CI. |

## Sviluppo, CI e pubblicazione

Documenti di tema: [development.md](engineering/development.md),
[operations.md](runbooks/operations.md#coordinatore-di-pubblicazione) e
[ADR 0009](adr/0009-publication-cycle.md).

| ID | Decisione | Perché |
|---|---|---|
| D-082 | GitHub Actions unico CI/CD. | Una pipeline per Worker, Pages e Function. |
| D-083, D-158 | Test con Vitest, fixture Function e Playwright mirato; WebKit sui percorsi sensibili e iPhone reale per la cornice Shopify. | Copertura proporzionata al rischio. |
| D-091 | Reset CLI solo in `dev`, impossibile in `prod`. | Flussi puliti senza rischi. |
| D-096 | SemVer, tag e migrazioni immutabili. | Rilasci riproducibili. |
| D-097 | Oxlint e Oxfmt, mai ESLint o Prettier. | Meno dipendenze, formato stabile. |
| D-098, D-208 | Dipendenze alla più recente stabile compatibile, `min-release-age=0`, Dependabot senza cooldown. | Correzioni subito disponibili. |
| D-116 | Una peer dependency troppo restrittiva si corregge con `packageExtensions` nel manifest root. | Niente fork o installazioni forzate. |
| D-117 | React Doctor bloccante sulle modifiche delle PR. | Feedback inline riproducibile. |
| D-118 | PR verso `develop` in squash; `main` solo promozioni con merge commit; `develop` non si elimina. | Ascendenza stabile tra i rami. |
| D-119 | Auto-merge per le sole PR Dependabot minor e patch. | Aggiornamenti ordinari senza intervento. |
| D-121 | `package.json#version` è la fonte della SemVer; Development usa `X.Y.Z-dev.<tree>`. | Production adotta la versione collaudata. |
| D-138 | La promozione riusa i gate di `develop`; una GitHub App riallinea `develop` solo per fast-forward a tree identico. | Prove immutabili verificate una volta. |
| D-141, D-163 | Soglie di coverage sulle righe modificate, sul totale, sulla Function e sui domini critici, questi ultimi anche con mutation score; report mutation incrementali. | Niente baseline da aggiornare in ogni PR. |
| D-162 | Deploy e promozione riusano i check della PR a tree identico; la mutation aggregata blocca i diff sui domini critici; un job giornaliero verifica lo schema Function. | Meno attese senza togliere gate. |
| D-187 | Controlli scelti per superficie, coverage in parallelo; il solo tooling operativo ha soglie proprie. | Metadati e tooling non avviano browser o deploy. |
| D-196 | Il coordinatore si ferma al primo job fallito, riallinea il branch a `develop` prima del push e salta un gate locale già verde sullo stesso tree. | Errori visibili subito e squash sul tree verificato. |
| D-214 | Se il commit del deploy Pages canonico non è più raggiungibile, il preflight ridistribuisce il sito. | Senza quel tree non si prova che `site/` coincida. |
| D-191 | `Pubblica` porta su Development, `Promuovi` promuove il lotto, `Pubblica in Production` fa entrambi; un lotto porta una sola SemVer. | Release per lotti, non per PR. |
| D-197, D-198 | Il coordinatore gira nel workflow `publish.yml`, usa solo REST e non usa auto-merge; i comandi npm sono l'unico percorso. | Pubblicare senza tenere acceso il Mac, anche dal cloud. |
| D-217 | Il ciclo di pubblicazione segue le regole ordinarie del repository. | Va mantenuto come il resto del codice. |
| D-218 | `yaml` tra le dipendenze di sviluppo, solo per i test dei workflow. | Test sulla struttura invece che sul testo. |

## Notifiche e Control Center owner

Documento di tema: [operations.md](runbooks/operations.md#notifiche-owner).

| ID | Decisione | Perché |
|---|---|---|
| D-134 | Outbox D1 e bot Telegram dedicato per il ciclo merchant, commerciale e operativo, con soli nome e dominio dello store. | Avvisi durevoli e idempotenti senza dati personali. |
| D-148, D-170 | Control Center Telegram di sola lettura, con le sole scritture della verifica manuale delle conversioni e dell'offerta di pagamento unico (D-221). | Stato e metriche senza nuovi scope. |
| D-157 | Avvisi deduplicati per incidenti persistenti e per la loro risoluzione. | Segnalare solo problemi reali. |
| D-179, D-180 | Coorti a 28 giorni e piani Shopify degli store nel Control Center; l'obiettivo delle 50 installazioni BFS è raggiunto e non si traccia più. | Misurare conversioni e distinguere gli store di sviluppo. |
| D-188, D-189 | Vista billing per categorie con «Copia»; disinstallazioni divise fra merchant e review, storico anonimo. | Dati leggibili senza conservare identità. |
| D-190 | Menu del bot da `config/telegram-owner-menu.json`, riallineato dal ciclo owner. | Il menu segue il codice. |
| D-225 | L'utilizzo degli store, base di classifiche e prezzo del pagamento unico, si misura soprattutto con letture manuali della Dev Dashboard in un registro privato fuori da Git; `/usage` conta gli ordini con CF o PEC solo dove `read_orders` è già concesso. Scartati `read_orders` obbligatorio, ShopifyQL e un contatore D1. Deciso dall'owner il 14 novembre 2026. | Pochi store concedono `read_orders`; ShopifyQL chiede dati protetti di livello 2 e la Function non può contare. |
| D-154, D-194, D-195 | Ricavi cumulati dalle transazioni Partner; netti stimati dopo fee Shopify e Hyperwallet, cambio EUR/USD da Frankfurter; vista performance con i requisiti Web Vitals BFS. | Netti realistici senza inviare dati al provider; lo stato BFS autorevole resta quello Shopify. |

## Governance della documentazione

| ID | Decisione | Perché |
|---|---|---|
| D-220 | Il registro contiene solo decisioni vive per tema, con lo storico integrale in archivio; il ciclo di pubblicazione ha un solo ADR (0009); le regole di processo degli agenti stanno in `AGENTS.md`, non nelle memorie di un singolo agente. Eliminate D-079 (ruoli Claude e Codex) e D-106 (profilo di handover). Deciso dall'owner il 9 novembre 2026. | Regole sovrapposte, superate senza marcatura e in contraddizione fra registro, ADR, istruzioni globali e memorie. |
| D-222 | Prima di `Pubblica` un agente lavora solo in locale, commit compresi; push e PR verso `develop`, anche in bozza, li fa `Pubblica` tramite il coordinatore. Supera la parte di D-220 sulle bozze. Deciso dall'owner l'11 novembre 2026. | Branch e PR nascono quando l'owner decide di pubblicare, senza lavoro remoto in attesa. |
