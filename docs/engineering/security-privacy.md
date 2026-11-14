# Sicurezza, privacy e telemetria

Il canale per le vulnerabilità è in [SECURITY.md](../../SECURITY.md), la risposta
agli incidenti nel [runbook](../runbooks/security-incident-response.md), le verifiche
periodiche in [manutenzione sicurezza](../runbooks/security-maintenance.md).

## Confini di fiducia

Input non affidabili: parametri e session token dal browser, form amministrativi,
webhook, redirect di billing, metafield Shopify, variabili di ambiente, righe D1
esistenti, input della Function. Ogni confine richiede validazione esplicita:
provenire dall'Admin embedded non sostituisce autenticazione e autorizzazione lato
server.

## Controlli

- CSP e header coerenti con un'app embedded;
- origine e host Shopify validati, token di sessione verificati;
- webhook HMAC sui byte originali;
- redirect in allowlist, query D1 preparate, output escapato dal framework;
- secret solo negli archivi di Cloudflare, GitHub e Shopify, mai in repository,
  artifact o log;
- token cifrati at rest;
- errori pubblici generici, dettagli solo nei log;
- rate limiting applicativo solo se emerge abuso reale;
- nessuna route di reset in Production;
- azioni billing idempotenti, confronto lato server di importi e valuta;
- nessun diritto concesso in base al solo `returnUrl`.

## Accesso Admin API per rete

L'app pubblica Production applica nella Dev Dashboard Shopify una allowlist per
reti ASN Cloudflare: `13335`, `132892` e `14789` (D-205). Non sono imposti limiti
di Paese: il Worker, i cron e i consumer Queues possono chiamare Shopify dalla
rete globale. Il Paese del checkout non determina il Paese di uscita del server.
La configurazione è lato Shopify, separata dal manifest e dai deploy del codice.
L'app Development è distinta e questa configurazione riguarda solo Production.

Prima di cambiare provider o origine delle chiamate Admin API, verificare gli
ASN reali nei log Shopify e nei registri di rete e usare **Esegui test**. Non
aggiungere reti soltanto per eliminare un blocco senza identificarne la fonte.
Il 5 novembre 2026 il test sul traffico disponibile dal 17 ottobre al 5 novembre
ha mostrato rispettivamente 9.714 richieste bloccate con il solo `13335`, 182
con `13335` e `132892`, e **0 su 10.737** con tutti e tre gli ASN. RIPEstat ha
identificato `2a06:98c0:3600::103` come `132892` e i quattro IPv4 residui come
`14789`; APNIC e ARIN ne hanno confermato l'appartenenza a Cloudflare.
Il salvataggio con **Applicazione** attiva è stato riletto dopo un reload della
dashboard. L'apertura successiva di CF Ready su Numismatica Leonessa ha mostrato
una conferma Shopify aggiornata alle 20:19 CET.
Il relativo log Admin API `CfReadyHomeSnapshot` del 5 novembre 2026 alle 20:19:27
CET riporta **QUERY OK**, IP `172.71.114.140`, ASN `13335`, durata 138 ms,
API `2026-10` e ID richiesta
`6a1956f9-45b1-479a-b011-b4420125037c-1793906366`.
La verifica finale dello stesso giorno ha riconfermato la policy attiva dopo
una nuova apertura della dashboard e **0 richieste bloccate su 10.741**.

Per una verifica o un ripristino usare **Impostazioni → Allowlist IP → Gestisci**
dell'app Production: conservare prima lo stato attuale, testare la policy e
rileggere dopo il salvataggio. Lo stato precedente a questa attivazione era
**Disattivato**, senza indirizzi configurati; ripristinarlo rimuove la protezione
e richiede l'autorizzazione prevista per una riduzione delle misure di sicurezza.
Non servono migrazioni D1, nuovi scope o un deploy per modificare la allowlist.

Fonti: [requisito Shopify del 5 novembre 2026](https://shopify.dev/changelog/posts/ip-allowlists-are-now-required-for-public-apps)
e [supporto ASN](https://shopify.dev/changelog/posts/app-ip-allowlists-now-support-apps-with-serverless-hosting).

## Minaccia principale: blocco errato del checkout

Le mitigazioni sono logica Function piccola e pura, fail-open su stato incerto,
massimo due errori, fixture geografiche complete, disattivazione rapida, rollback
della Function e nessuna chiamata esterna durante il checkout.

## Privacy by design

L'app non conserva CF o PEC degli acquirenti, ordini, indirizzi, fatture o
prodotti. La Function riceve i valori in Shopify, li valuta localmente e restituisce
soltanto errori. Il backend Cloudflare non partecipa al checkout; legge e
riscrive CF e PEC di un ordine solo per l'opzione ordini, in memoria (NFR-030).

## Retention

| Dato | Retention |
|---|---|
| Sessioni e token | fino a scadenza o disinstallazione; eliminazione immediata alla disinstallazione |
| Configurazione e onboarding dopo disinstallazione | 90 giorni |
| Ultima configurazione salvata (`configuration_history`) | solo l'ultima, massimo 90 giorni (D-174) |
| Errori tecnici dettagliati | 90 giorni |
| Outbox notifiche owner | 90 giorni |
| Barriera HMAC antireplay notifiche | 12 mesi da `shop/redact` |
| Telemetria essenziale `app_events` | 12 mesi |
| Fatti permanenti dello store: check-in chiuso, recensione completata, ultima attivazione, installazione registrata (D-223) | fino a `shop/redact` |
| Storico anonimo disinstallazioni e contatori aggregati | senza scadenza; nessun riferimento allo store (D-189) |
| Campioni `performance_samples` | 90 giorni |
| Ricevute webhook | 90 giorni |
| Ricevute Control Center | 7 giorni |
| Prova e generazione pseudonimizzate | a lungo termine, per prevenire abusi e preservare condizioni |
| Stato billing D1 e riferimenti Shopify | fino a `shop/redact` |
| Backup settimanali | ultime 8 copie |
| Backup mensili | 12 mesi |
| Dati acquirente | mai conservati |

Shopify invia `shop/redact` circa 48 ore dopo la disinstallazione e la cancellazione
è immediata. I 90 giorni sono il limite residuale: la retention oraria cancella gli
store ancora disinstallati in batch da 25, come fallback se il webhook non arriva.
Uno store reinstallato non soddisfa la query.

## `shop/redact`

Elimina sessioni, token, configurazione, onboarding e log riferibili non necessari.
Sopravvivono soltanto:

- la riga pseudonimizzata di `trial_ledger`, per impedire una seconda prova;
- per massimo 12 mesi, la coppia HMAC del dominio e istante di redazione, perché
  replay Partner anteriori non ricreino notifiche.

Diritto una tantum e riferimenti billing non hanno copia D1: dopo una reinstallazione
si rileggono da Shopify. Base giuridica e forma della pseudonimizzazione sono state
approvate dall'owner il 2 agosto 2026.

## Telemetria

Eventi permessi: installazione e disinstallazione, onboarding completato, Validation
attivata o disattivata, prova iniziata o scaduta, piano scelto, conversione, error
code, locale amministratore, generazione tariffaria. È sempre attiva e descritta
nella Privacy Policy. Nessun cookie analytics, fingerprint o comportamento dei
clienti.

I campioni Web Vitals conservano solo identificatore tecnico, metrica, valore, Paese,
versione, rotta in allowlist, durate `Server-Timing` allowlistate e area dello
spostamento CLS. Target DOM, selettori, URL completi, query string e valori dei form
vengono scartati. Rotta e `Server-Timing` si congelano all'avvio del documento.

Le notifiche all'owner non sono telemetria merchant. Includono nome pubblico e dominio
`.myshopify.com` dello store, stato operativo, piano, dettagli della charge e istante;
mai nome dell'owner, email, shop ID, GID Shopify, Codice Fiscale, PEC o dati checkout.
Per una disinstallazione, il feedback Partner arrivato dopo l'invio genera un solo
messaggio separato. `/usage` aggiunge per gli store con `read_orders` i totali
degli ordini a 60 giorni con Codice Fiscale o PEC, mai i valori (D-225).

Il solo sito pubblico usa Cloudflare Web Analytics: niente cookie, archiviazione
locale, fingerprint o query string, e nessun accesso a checkout o app embedded. La
Privacy Policy descrive metriche, finalità, base giuridica, destinatario e retention.

I log sono JSON strutturato con correlation ID ed error code stabile, senza input
fiscali. Invocation log e Traces restano disattivati per non conservare URL e testo
SQL (D-123); Traces si accende solo per una breve riproduzione Development con dati
sintetici. Workers Builds, Logpush, OpenTelemetry e osservabilità esterna non sono
attivi (D-124).

## Documenti legali

Solo due documenti pubblici IT/EN, con la versione italiana che prevale: Privacy
Policy e Termini d'uso e condizioni commerciali. Le pagine in `site/` sono la loro
unica fonte, senza copie in `docs/`. La Privacy indica i fornitori per categoria
(D-200). I Termini incorporano prova, prezzi e rinnovi, una tantum, proratazione,
cancellazioni, rimborsi, limitazioni, assenza di consulenza fiscale, disponibilità e
cessazione, legge applicabile.

## Segnalazione vulnerabilità

`SECURITY.md` e GitHub Private Vulnerability Reporting sono attivi. Presa in carico
indicativa entro 3 giorni lavorativi, prima classificazione entro 7: sono obiettivi
operativi, non uno SLA. Il sito non espone riferimenti al repository e pubblica per
la sicurezza solo `info@cfready.it`, anche in `/.well-known/security.txt`, la cui
scadenza va rinnovata entro un anno e viene controllata da un test documentale.
