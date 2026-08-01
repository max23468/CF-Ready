# Operazioni M7 — Sito, legale e supporto

**Data:** 1 agosto 2026 · **Ambienti:** Cloudflare Pages (sito pubblico) e
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

Il rollback è il deployment precedente della stessa lista, che Pages conserva e
ripristina senza ricostruire nulla. Nessuna migrazione e nessun backup: il sito
è statico e non ha stato.

### Readback degli URL pubblici

Verificati sul dominio pubblico dopo il secondo deploy, tutti `200`:

```text
/            /privacy            /terms            /support
/en/         /en/privacy         /en/terms         /en/support
```

`/(...).html` risponde `308` verso il percorso senza estensione, quindi gli URL
canonici di §18.3 sono quelli effettivamente serviti. Gli header di
`site/_headers` sono applicati: `Content-Security-Policy: default-src 'none'`,
`Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`. La Home non
carica alcuna risorsa da domini terzi.

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

La `0.5.0` e la `0.5.1` non hanno avuto uno snapshot Shopify proprio: la prima
non toccava l'app, la seconda è la correzione sulle Validation duplicate entrata
da un'altra PR. Il deploy `0.5.2` le comprende entrambe. Deployment Worker
`03a89f9a-691c-4141-a77b-85807a3470c1`; il rollback è la versione Worker
precedente e, per Shopify, lo snapshot precedente. Nessuna migrazione D1 in
questa milestone: `support_requests` non viene creata, per la decisione
registrata in §22.

Tutti i passi del workflow sono risultati verdi, inclusi preflight, readback
delle migrazioni, readback del Worker, smoke e readback della versione Shopify
attiva, verificata come `0.5.2`.

## Gate della milestone

| Gate | Esito |
| --- | --- |
| URL pubblici | **superato.** Otto pagine `200` sul dominio pubblico, header applicati |
| Canale privato per vulnerabilità | **superato con una riserva.** Private Vulnerability Reporting attivato via API e confermato `enabled`; segnalazione di prova `GHSA-jv8v-x9hc-q5qh` creata in privato e chiusa subito dopo |
| Testi coerenti fra sito, app e futura listing | **superato.** Stessa casella di assistenza ovunque, stessi limiti dichiarati con le stesse parole, nessun claim vietato da §4.4 |
| Revisione legale | **superato.** Testi e conservazione pseudonimizzata del `trial_ledger` approvati dall'owner il 2 agosto 2026 |

La riserva sul canale vulnerabilità: la prova è stata creata dall'account
proprietario del repository, quindi dimostra che il canale esiste, è privato e
accetta segnalazioni, ma non riproduce l'invio da parte di un ricercatore
esterno, che il proprietario non può simulare su sé stesso. La conferma che la
notifica raggiunge `cfready@icloud.com` spetta a chi legge quella casella.

## Verifiche non eseguite

- **Resa grafica del sito.** Il dominio pubblico è bloccato dalla policy del
  browser integrato e le pagine del worktree vengono mostrate solo come
  istantanee statiche: struttura, link, ancore e intestazioni HTTP sono
  verificati, il giudizio visivo resta all'owner.
- **Percorso di assistenza dentro l'Admin.** Il collegamento precompilato è
  coperto dal test su `supportMailto`, ma il comportamento reale del programma
  di posta all'apertura del link non è stato provato sul dev store.

## Residui dichiarati

- **Identità del titolare.** Privacy e Termini indicano `Temisfera` senza
  denominazione completa né indirizzo, per decisione dell'owner. Va completata
  prima della submission.
- **Link alla listing.** I richiami all'installazione puntano a
  `https://apps.shopify.com/cf-ready`, che oggi risponde `404`. Accettabile
  finché il sito non è collegato da nessuna superficie pubblica; da sostituire
  in M11.
- **Screenshot dell'app.** La Home non ne contiene: quelli reali nascono in M9.
- **`shop/redact` di prova.** Non ancora arrivato; quando arriverà lo store deve
  restare intatto con un evento `shop_redact_skipped`. Non appartiene a M7.
