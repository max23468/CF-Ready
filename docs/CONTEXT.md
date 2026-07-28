# Contesto corrente

Aggiornato il 28 luglio 2026.

## Stato

M0 è completata. Sono disponibili:

- repository GitHub privato `max23468/CF-Ready`;
- app Shopify Development, Testing e Production nell’organizzazione Temisfera;
- progetto Cloudflare Pages `cf-ready`;
- sottodominio Workers `tmsf.workers.dev`;
- database D1 `cf-ready-db-test` e `cf-ready-db-prod`;
- bucket R2 `cf-ready-backups-test` e `cf-ready-backups-prod`, con location hint
  Europa occidentale;
- nomi definiti per i Worker secondo il Master Plan;
- baseline documentale, ADR, inventario secret e configurazione GitHub.

I Worker non vengono creati senza codice placeholder: `cf-ready-test` nascerà
con il deploy Testing di M1 e `cf-ready` prima del primo deploy Production.

## Vincoli osservati

- Il repository resta privato sul piano GitHub Free. L’assenza di branch
  protection, required checks, deployment environment protetti, secret scanning
  e push protection è accettata dall’owner e non blocca la `1.0.0`.
  Vulnerability alerts, Dependabot, PR operative, CI verde verificata prima del
  merge, solo squash merge e controlli locali sui secret costituiscono la
  baseline applicabile. Rivalutare il piano solo se entrano collaboratori o
  cambia materialmente il profilo di rischio.
- Secret e callback reali restano da configurare per ambiente durante M1: non
  appartengono al repository.

## Prossimo passo

Avviare M1 dal proof of concept Testing: adattamento Workers/D1, sessioni,
login embedded, webhook HMAC e Function minimale. Il primo deploy deve creare
`cf-ready-test`, usare solo risorse Testing e produrre ricevuta, readback e
rollback.
