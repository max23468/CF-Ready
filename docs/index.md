# Indice documentazione

Le evidenze sono ricevute storiche chiuse: versioni e commit al loro interno
descrivono quel rilascio e non vanno aggiornati ai bump successivi. Lo stato
corrente si legge da codice, configurazioni e `package.json`.

## Dove guardare

- [Prodotto](product/product.md): problema, perimetro, esclusioni.
- [Requisiti](product/requirements.md): disponibilità, regole, validazione, FR e NFR
  generali.
- [Billing](product/billing.md): prezzi, prova, piani, requisiti FR-070…FR-085.
- [Interfaccia e contenuti](product/ui-content.md): pagine, lingue, assistenza,
  recensioni, requisiti FR-060…FR-066 e FR-090…FR-095.
- [Glossario](product/glossario.md): termini canonici IT/EN.
- [Architettura](engineering/architecture.md): Function, Validation, dati, auth,
  webhook, Cloudflare.
- [Sviluppo e rilascio](engineering/development.md): ambienti, versioni, CI,
  dipendenze, test, riferimenti ufficiali.
- [Sicurezza e privacy](engineering/security-privacy.md): controlli, retention,
  telemetria, documenti legali.
- [Registro decisioni](decisions.md): tutte le `D-nnn`.
- [Roadmap](roadmap.md): prossimi lavori, idee da validare, temi in attesa.

## Altre cartelle

- `plans/`: piani temporanei di lavori in corso, archiviati a lavoro chiuso.
- `audits/` ed `evidence/`: audit e ricevute datate, chiuse.
- `archive/`: storia. I rimandi `§n` di ricevute e audit indicano il Master Plan
  archiviato.

## Archivio

- [Master Plan](archive/2026-07-28-cf-ready-master-plan.md).
- [Contratti tecnici](archive/contracts/) delle milestone M1, M4, M5 e M6.
- [Piani conclusi](archive/plans/).
- [Release readiness 1.0](archive/release-readiness-1.0.md).

## Ricevute, audit e materiali

- [Evidenze M1](evidence/2026-07-28-m1-proof-of-concept.md) — target, prove sul
  dev store, CPU e confini operativi.
- [Rendering errori checkout](evidence/2026-07-29-checkout-validation-rendering.md)
  — target verificato, limite della review, chiusura M10 e gate checkout M11.
- [Validazione automatica nel checkout](evidence/2026-09-08-checkout-validation-automatic.md)
  — prova Development di Interaction inline, consegna risolta e pagamenti manuali.
- [Matrice etichette checkout 1.7.0](evidence/2026-09-09-checkout-labels-capability-matrix.md)
  — capacità per lingua e mercato, prove Development e confini live residui.
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
- [Qualificazione CPU Workers Free](evidence/2026-09-20-workers-free-cpu.md) —
  attribuzione per percorso, candidato locale e blocco del readback Cloudflare.
- [Controlled Launch M11](evidence/2026-08-25-m11-controlled-launch.md) —
  prerequisito M10, gate checkout, deploy Production e chiusura `v1.0.0`.
- [Built for Shopify M12](evidence/2026-08-26-m12-built-for-shopify.md) —
  criteri combinati, baseline iniziale e readback del 3 ottobre 2026.
- [Audit pre-submission App Store](audits/2026-08-03-app-store-pre-submission.md)
  — requisiti scaricati dalla fonte, esiti e punti da chiudere.
- [Readiness Built for Shopify](audits/2026-08-05-built-for-shopify-readiness.md)
  — integrazione, UI embedded, accessibilità verificabile e matrice checkout.
- [Progresso tecnico Built for Shopify](audits/2026-08-25-built-for-shopify-technical-progress.md)
  — stato recente, bootstrap App Bridge, budget client e gate live residui.
- [Listing italiana](listing/listing-it.md) e
  [inglese](listing/listing-en.md) — testi della listing App Store.
- [Review App Store](listing/app-store-review.md) — requisiti a ogni submission,
  materiali e Built for Shopify.
- [Reviewer instructions](listing/reviewer-instructions.md) — store di prova,
  valori sintetici e risultati attesi per la review Shopify.
- [Copione dello screencast](listing/screencast-script.md) — scaletta della demo
  obbligatoria.
- [Screenshot della listing](listing/screenshots.md) — piano di cattura e
  didascalie IT/EN.
- [Outreach Controlled Launch](growth/controlled-launch-outreach.md) — target,
  messaggi, feedback e stop condition per un'eventuale attività futura,
  opzionale e fuori dai gate M11.
- [Mappa pubblica delle opportunità di risposta](growth/2026-08-31-community-response-map.md)
  — thread, blog e forum pertinenti, interventi già attribuiti e bozze
  sottoposte a valutazione manuale.
- [Registro contatti merchant](growth/merchant-outreach.md) — conteggi, criteri e testi dei contatti.
- [ADR 0001](adr/0001-stack.md) — stack applicativo e provider.
- [ADR 0002](adr/0002-webhook-queue.md) — ACK webhook rapido con retry durevoli.
- [ADR 0003](adr/0003-native-checkout-labels.md) — lettura, gestione e ripristino prudente delle etichette native del checkout.
- [ADR 0004](adr/0004-cf-cli.md) — CLI `cf`, `cloudflare.config.ts` e residui Wrangler.
- [ADR 0007](adr/0007-coordinator-in-actions.md) — coordinatore di pubblicazione in GitHub Actions.
- [ADR 0008](adr/0008-order-field-formatting.md) — Codice Fiscale e PEC uniformati negli ordini.
- [Brand Foundation](brand/brand-foundation.md) — identità e tono.
- [Design del sito](brand/design.md) — linguaggio visivo di sito, listing e materiali.
- [Brand board](brand/brand-board.html) — riferimento visuale.
- [Asset del brand](brand/assets/README.md) — file e modalità d’uso.
- [Inventario secret](runbooks/secret-inventory.md) — soli nomi e destinazioni.
- [Operazioni](runbooks/operations.md) — capacità, matrice browser,
  backup/restore, Workers Logs, Traces Development e ricevute.
- [Riconciliazione finanziaria billing](runbooks/billing-financial-reconciliation.md)
  — separazione tra contratto, vendita, incasso e payout; gate manuale per
  rimborsi, crediti e conversioni storiche.
- [Diagnosi dei run della Validation Function](runbooks/function-run-diagnosis.md)
  — ricostruzione dei rami fail-open da input e output del Dev Dashboard.
- [Manutenzione sicurezza](runbooks/security-maintenance.md) — audit periodici
  di repository, dipendenze e provider Development.
- [Controlli ufficiali Shopify a ogni release](runbooks/shopify-release-security-checks.md)
  — scansione locale, review incrementale del coding agent e prova del candidato.
- [Baseline controlli Shopify](evidence/shopify-security/baseline.md) — ultima
  review completa, esiti per check e falsi positivi motivati.
- [Changelog](../CHANGELOG.md) — versioni rilasciate e sintesi per milestone.
- [Sviluppo locale](engineering/development.md#sviluppo-locale) — setup e comandi correnti.
- [Sicurezza](../SECURITY.md) — canale privato.
- [Diagnosi installazioni](runbooks/installation-diagnostics.md) — aperture app, primo ingresso onboarding e feedback di disinstallazione Shopify.
