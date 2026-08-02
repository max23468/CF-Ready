# Operazioni M7 — Sito, legale e supporto

**Data:** 1–2 agosto 2026 · **Ambienti:** Cloudflare Pages (sito pubblico) e
Development (app). Registra gli snapshot rilasciati, il deploy del sito, i gate
eseguiti e i residui dichiarati. La numerazione segue il
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md) §19.5: `0.5.0` apre
la milestone e ogni snapshot successivo incrementa la patch.

## Sito pubblico su Cloudflare Pages

Progetto `cf-ready`, già riservato in M0 e mai usato in produzione fino a oggi:
prima di questa milestone `https://cf-ready.pages.dev/` rispondeva `404` e tutti
i deployment erano di anteprima.

| Deployment | Ambiente | Commit | Contenuto |
| --- | --- | --- | --- |
| `12a52ecd-8a65-4af5-ad63-3e2d2c9119b8` | Production | `99dc94c` | prima pubblicazione delle otto pagine |
| `af9443c1-29b4-46ab-9bfb-6d6c3822fdb1` | Production | `4f38c17` | Home riscritta per spiegare e convincere |
| `4092e97d-6825-4c4f-a704-6a92d1cc3f3c` | Production | `9017045` | ritmo verticale e spaziatura del sito riallineati |
| `202782f9-5258-4ea2-8cd2-f865cb1db347` | Production | `1920917` | menu agganciato, scorrimento accompagnato e copy rifinito |
| `5ead87ec-1ef4-4dfa-8d8c-54f13270e6ac` | Production | `b5b9c21` | menu e griglie responsive corretti |
| `d948ce04-0df1-408a-b3ab-d23e0ef7569a` | Production | `b0298b3` | ritiro del menu mobile ritardato |
| `746baf9c-baa6-4035-a105-1216fc3accf3` | Production | `bc5acb8` | Cloudflare Web Analytics abilitata |
| `ffed353e-b31d-445c-9ccb-ad4078ec396a` | Production | `e953488` | endpoint RUM consentito dalla Content-Security-Policy |
| `d235e721-b71a-497c-b9f3-f551246ca4b1` | Production | `aa5d4e7` | correzioni finali al sito e ai documenti pubblici |
| `d7017616-ed79-4af0-9750-a676c12bc095` | Production | `e5f730f` | chiusura documentale M7 e pianificazione della corsia Pages M8 |

Il rollback è il deployment precedente della stessa lista, che Pages conserva e
ripristina senza ricostruire nulla. Nessuna migrazione e nessun backup: il sito
è statico e non ha stato.

### Readback degli URL pubblici

Verificati sul dominio pubblico dopo l'ultimo deploy, tutti `200`:

```text
/            /privacy            /terms            /support
/en/         /en/privacy         /en/terms         /en/support
```

`/(...).html` risponde `308` verso il percorso senza estensione, quindi gli URL
canonici di §18.3 sono quelli effettivamente serviti. Gli header di
`site/_headers` sono applicati: `Content-Security-Policy: default-src 'none'`,
`Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`. La Home non
carica risorse di terzi oltre al beacon automatico Cloudflare Web Analytics da
`static.cloudflareinsights.com`; il readback browser ha osservato il `POST` a
`cloudflareinsights.com/cdn-cgi/rum` concluso con `204`.

Durante la chiusura, un'esecuzione di `site:deploy` dal branch `develop` ha
creato la sola preview `d05b3ab8-bce8-4da0-9b2d-e9d1781a5088`, senza cambiare
il dominio canonico. La causa era il branch Pages derivato dal checkout: la PR
`#144` ha fissato esplicitamente il target Production `main`, coperto dal test
documentale, e il deploy successivo `d7017616-…` ha superato il readback live.

### Una trappola nel deploy

`wrangler pages` legge `.wrangler/deploy/config.json`, l'artefatto che
`react-router build` lascia per il Worker, e da lì viene dirottato sulla
configurazione dell'app: il sito non parte e il comando fallisce con i binding
D1 in errore. Pages non accetta un file di configurazione alternativo — `--config`
è esplicitamente rifiutato — quindi gli script `site:dev` e `site:deploy`
rimuovono quell'artefatto prima di invocare Pages. Viene rigenerato alla build
successiva.

## Snapshot Development rilasciati

| Versione | Commit | Worker | Versione Shopify | Workflow |
| --- | --- | --- | --- | --- |
| `0.5.2` | `4f38c17` | `9bc3aadf-801e-4883-b8a1-a0b99f005bda` | `1072951492609` | `30718590672` |
| `0.5.10` | `aa5d4e7` | `a7519816-7e68-4014-bc1e-cdc819e7efcd` | `1073017978881` | `30724380570` |

La `0.5.0` e la `0.5.1` non hanno avuto uno snapshot Shopify proprio: la prima
non toccava l'app, la seconda è la correzione sulle Validation duplicate entrata
da un'altra PR. Il deploy `0.5.2` le comprende entrambe. Deployment Worker
`03a89f9a-691c-4141-a77b-85807a3470c1`; il rollback è la versione Worker
precedente e, per Shopify, lo snapshot precedente. Nessuna migrazione D1 in
quello snapshot: `support_requests` non viene creata, per la decisione
registrata in §22.

Lo snapshot `0.5.10` ha applicato `0009_shop_retention.sql`, poi ha confermato
zero migrazioni pendenti. Deployment Worker
`87661ab6-da8f-4471-9c58-55a834b8782e`; rollback coordinato allo snapshot
`0.5.2` sul commit `4f38c17`.

Tutti i passi dei workflow rilasciati sono risultati verdi, inclusi preflight,
readback delle migrazioni, readback del Worker, smoke e readback della versione
Shopify attiva, verificata da ultimo come `0.5.10`.

## Gate della milestone

| Gate | Esito |
| --- | --- |
| URL pubblici | **superato.** Otto pagine `200` sul dominio pubblico, header applicati |
| Segnalazione vulnerabilità | **superato.** Il sito Pages espone soltanto il primo contatto email senza dettagli sfruttabili, per decisione dell'owner; nel repository Private Vulnerability Reporting è attivato e verificato separatamente |
| Testi coerenti fra sito, app e futura listing | **superato.** Stessa casella di assistenza ovunque, stessi limiti dichiarati con le stesse parole, nessun claim vietato da §4.4 |

## Verifiche manuali

- **Resa grafica del sito:** verificata con successo dall'owner.
- **Percorso di assistenza dentro l'Admin:** apertura del collegamento `mailto:`
  precompilato verificata con successo dall'owner sul dev store.
- **Notifica del canale vulnerabilità:** ricezione sulla casella prevista
  verificata con successo dall'owner.

## Residui dichiarati

- **Identità del titolare.** Privacy e Termini indicano `Temisfera` senza
  denominazione completa né indirizzo, per decisione dell'owner. Il
  completamento è programmato in M9, prima della submission.
- **Link alla listing.** I richiami all'installazione puntano a
  `https://apps.shopify.com/cf-ready`, che oggi risponde `404`. Accettabile
  finché il sito non è collegato da nessuna superficie pubblica; da sostituire
  in M11.
- **Screenshot dell'app.** La Home non ne contiene: quelli reali nascono in M9.
- **`shop/redact` di prova.** Non ancora arrivato; quando arriverà lo store deve
  restare intatto con un evento `shop_redact_skipped`. Non appartiene a M7.
