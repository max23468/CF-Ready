# Indice documentazione

Le evidenze sono ricevute storiche chiuse: versioni e commit al loro interno
descrivono quel rilascio e non vanno aggiornati ai bump successivi. Lo stato
corrente si legge da codice, configurazioni e `package.json`.

- [Master Plan](plans/2026-07-28-CF-Ready-Master-Plan.md) — requisiti,
  decisioni, milestone e gate.
- [Contratti tecnici M1](contracts/m1-technical-contracts.md) — runtime,
  autenticazione, Home embedded, D1 e Validation del proof of concept.
- [Contratti tecnici M4](contracts/m4-technical-contracts.md) — stato tecnico
  D1, ciclo webhook, eventi, codici errore e riconciliazione.
- [Contratti tecnici M5](contracts/m5-technical-contracts.md) — prova, piani,
  stato commerciale, diritto per il checkout e flussi con effetti economici.
- [Contratti tecnici M6](contracts/m6-technical-contracts.md) — lingua UI,
  configurazione, stato merchant, onboarding e recensioni.
- [Evidenze M1](evidence/2026-07-28-m1-proof-of-concept.md) — target, prove sul
  dev store, CPU e confini operativi.
- [Rendering errori checkout](evidence/2026-07-29-checkout-validation-rendering.md)
  — target verificato, limite della review, chiusura M10 e gate checkout M11.
- [Operazioni Development M4](evidence/2026-07-30-m4-development-migration.md)
  — migrazione D1, deploy, snapshot Shopify e verifiche live.
- [Rilascio Development M5](evidence/2026-07-30-m5-development-release.md)
  — migrazioni, deploy e gate billing residui.
- [Rilascio Development M6](evidence/2026-07-31-m6-ui-completa.md) — snapshot
  Development, gate UI e verifiche live della milestone.
- [Operazioni M7](evidence/2026-08-01-m7-sito-legale-supporto.md) — pubblicazione
  del sito, snapshot Development, gate della milestone e residui.
- [Hardening M8](evidence/2026-08-02-m8-hardening.md) — matrice delle prove,
  ricevute operative e limiti dichiarati della milestone.
- [Controlled Launch M11](evidence/2026-08-25-m11-controlled-launch.md) —
  prerequisito M10, precheck Function API e gate ancora aperti per `1.0.0`.
- [Audit pre-submission App Store](audits/2026-08-03-app-store-pre-submission.md)
  — requisiti scaricati dalla fonte, esiti e punti da chiudere.
- [Readiness Built for Shopify](audits/2026-08-05-built-for-shopify-readiness.md)
  — integrazione, UI embedded, accessibilità verificabile e matrice checkout.
- [Progresso tecnico Built for Shopify](audits/2026-08-25-built-for-shopify-technical-progress.md)
  — stato recente, bootstrap App Bridge, budget client e gate live residui.
- [Listing italiana](listing/listing-it.md) e
  [inglese](listing/listing-en.md) — testi della listing App Store.
- [Reviewer instructions](listing/reviewer-instructions.md) — store di prova,
  valori sintetici e risultati attesi per la review Shopify.
- [Copione dello screencast](listing/screencast-script.md) — scaletta della demo
  obbligatoria.
- [Screenshot della listing](listing/screenshots.md) — piano di cattura e
  didascalie IT/EN.
- [Release readiness 1.0](runbooks/release-readiness-1.0.md) — ogni gate con la
  sua prova, o la dichiarazione che manca.
- [Outreach Controlled Launch](runbooks/controlled-launch-outreach.md) — target,
  messaggi, feedback e stop condition per un'eventuale attività futura,
  opzionale e fuori dai gate M11.
- [ADR 0001](adr/0001-stack.md) — stack applicativo e provider.
- [ADR 0002](adr/0002-webhook-queue.md) — ACK webhook rapido con retry durevoli.
- [Brand Foundation](brand/brand-foundation.md) — identità e tono.
- [Brand board](brand/brand-board.html) — riferimento visuale.
- [Asset del brand](brand/assets/README.md) — file e modalità d’uso.
- [Inventario secret](runbooks/secret-inventory.md) — soli nomi e destinazioni.
- [Operazioni](runbooks/operations.md) — capacità, matrice browser,
  backup/restore, Workers Logs, Traces Development e ricevute.
- [Manutenzione sicurezza](runbooks/security-maintenance.md) — audit periodici
  di repository, dipendenze e provider Development.
- [Changelog](../CHANGELOG.md) — versioni rilasciate e sintesi per milestone.
- [README](../README.md) — setup e comandi correnti.
- [Sicurezza](../SECURITY.md) — canale privato e disclosure coordinata.
- [Contributi](../CONTRIBUTING.md) — issue, pull request e dati vietati.
