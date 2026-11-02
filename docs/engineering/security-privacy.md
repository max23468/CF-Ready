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

## Minaccia principale: blocco errato del checkout

Le mitigazioni sono logica Function piccola e pura, fail-open su stato incerto,
massimo due errori, fixture geografiche complete, disattivazione rapida, rollback
della Function e nessuna chiamata esterna durante il checkout.

## Privacy by design

L'app non legge né conserva CF o PEC degli acquirenti, ordini, indirizzi, fatture o
prodotti. La Function riceve i valori in Shopify, li valuta localmente e restituisce
soltanto errori. Il backend Cloudflare non partecipa al checkout.

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
messaggio separato.

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
