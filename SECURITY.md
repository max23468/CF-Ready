# Sicurezza

## Versioni supportate

CF Ready è ancora in sviluppo e non ha release pubbliche. Le correzioni di
sicurezza vengono applicate alla linea corrente di sviluppo e promosse secondo
il flusso `develop` → `main`.

## Segnalare una vulnerabilità

Non aprire issue pubbliche per vulnerabilità, credenziali o dettagli
sfruttabili. Usa la
[segnalazione privata di GitHub](https://github.com/max23468/CF-Ready/security/advisories/new).
Se non puoi accedere a GitHub, scrivi a
[cfready@icloud.com](mailto:cfready@icloud.com) indicando nell'oggetto che si
tratta di una segnalazione di sicurezza.

Includi:

- componente e versione o commit interessato;
- impatto e passaggi minimi per riprodurre il problema;
- eventuale proposta di mitigazione;
- solo dati sintetici, mai dati di merchant o clienti.

Confermeremo la presa in carico indicativamente entro 3 giorni lavorativi e una
prima classificazione entro 7 giorni lavorativi. Sono obiettivi operativi, non
uno SLA. Aggiorniamo il segnalante a ogni cambiamento rilevante e comunque alla
pubblicazione della correzione. L'app è mantenuta da una sola persona: se un
tempo indicativo non viene rispettato lo diciamo, invece di lasciare la
segnalazione senza risposta.

Se hai pubblicato accidentalmente una credenziale, revocala subito presso il
provider prima di inviare la segnalazione.

## Disclosure coordinata

Coordiniamo tempi e contenuto della disclosure con il segnalante. Chiediamo di
non divulgare pubblicamente prima che una correzione sia disponibile o prima di
90 giorni dalla presa in carico. Pubblicata la correzione, riconosciamo il
contributo se il segnalante lo desidera. Non offriamo ricompense in denaro.

## Fuori perimetro

Non sono vulnerabilità di questo progetto:

- le segnalazioni sull'infrastruttura di Shopify o Cloudflare, da inviare ai
  rispettivi programmi;
- la validazione formale che non verifica il Codice Fiscale presso l'Agenzia
  delle Entrate: è un comportamento documentato e voluto;
- il comportamento fail-open, per cui un errore dell'app non blocca il
  checkout: è una decisione di progetto che protegge le vendite legittime;
- output di scanner automatici senza impatto dimostrato.
