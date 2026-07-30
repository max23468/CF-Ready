# Changelog

Le versioni seguono SemVer e la cadenza per milestone descritta nel
[Master Plan](docs/plans/2026-07-28-CF-Ready-Master-Plan.md) §19.5. Ogni voce
corrisponde a uno snapshot rilasciato; le note pubbliche IT/EN e il tag Git
restano requisiti delle sole release Production.

## 0.2.1 — 30 luglio 2026

Correzioni emerse dai gate live di M4 sul dev store.

- `shop/redact` cancella i dati solo se lo store risulta ancora disinstallato:
  Shopify invia il topic 48 ore dopo la disinstallazione e non annulla l'invio
  se lo store reinstalla nel frattempo. Con un'installazione attiva la richiesta
  viene presa in carico e registrata, senza toccare dati né ricevute;
- l'installazione è registrata una volta per ciclo di vita: con la managed
  installation il rinnovo del token completa un'autenticazione e rieseguiva
  l'evento. La riconciliazione resta a ogni autenticazione.

## 0.2.0 — 30 luglio 2026

Milestone M4, dati, auth e lifecycle. Rilasciata in Development.

- stato tecnico in D1: `app_state`, `webhook_events` e `app_events`;
- webhook idempotenti per ID, con rielaborazione dei soli retry dopo errore;
- topic `shop/update` e i tre topic di compliance su endpoint dedicato;
- gate geografico fail-open: fuori Italia la Validation viene disattivata e lo
  store marcato, il ritorno in Italia non riattiva nulla da solo;
- riconciliazione Shopify/D1 a installazione, apertura della Home,
  `shop/update` e dopo un errore di scrittura;
- installazione, disinstallazione e cancellazione dati registrate;
- eventi e log sanitizzati con codici errore stabili per auth, webhook e
  lifecycle;
- il percorso proof of concept diventa il lifecycle definitivo;
- una chiave di cifratura ruotata invalida le sessioni invece di bloccare
  l'app, con procedura di rotazione documentata.

Nota: lo snapshot intermedio `0.1.0-dev.ff878ab` è stato sostituito da questa
release e resta solo nella cronologia Shopify.

## 0.1.0 — 29 luglio 2026

Milestone M3, motore di validazione. Primo snapshot Development fisso.

- Function di validazione con Codice Fiscale a 16 e 11 cifre, omocodia,
  checksum, PEC, geografia e fail-open;
- contratto di configurazione schema v2 nel metafield della Validation;
- backend Development minimo sull'URL persistente del Worker.
