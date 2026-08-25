# Progresso tecnico Built for Shopify

**Data:** 25 agosto 2026

**Baseline Production osservata:** `0.9.40`

**Candidato locale:** `0.9.42`, ramo `codex/bfs-technical-readiness`

Questo aggiornamento considera soltanto requisiti tecnici. Recensioni, rating,
adozione merchant, materiali commerciali e altri obiettivi non tecnici sono
esclusi. Anche VoiceOver è escluso per indicazione del proprietario.

## Stato recente osservato

Il Partner Dashboard mostra, sulla finestra mobile di 28 giorni, valori p75
entro soglia ma ancora meno di 100 campioni:

| Metrica |      p75 | Campioni | Soglia tecnica |
| ------- | -------: | -------: | -------------: |
| LCP     | 2.252 ms |       75 |     ≤ 2.500 ms |
| INP     |    56 ms |       54 |       ≤ 200 ms |
| CLS     |     0,01 |       75 |          ≤ 0,1 |

Il dato giornaliero del 24 agosto mostra LCP `1.373 ms`, INP `64 ms` e CLS
`0,27`, con 18–19 campioni. Non è attribuibile alla `0.9.40`: nella giornata
sono passate più versioni e il deploy `0.9.40` è terminato il 25 agosto alle
00:55 CEST. Il segnale CLS va quindi ricontrollato soltanto su campioni
successivi al prossimo deploy, senza usare la giornata mista come regressione
confermata.

Il controllo automatico del Dashboard riconosce l'app come embedded, ma non
marca ancora App Bridge corrente e session token come completati. Il codice usa
`authenticate.admin` su ogni route embedded e il token exchange della libreria
Shopify; non è emerso un secondo meccanismo di autenticazione da aggiungere.

## Correzioni locali

- La chiave pubblica è dichiarata nel meta `shopify-api-key`; App Bridge e
  Polaris vengono caricati una sola volta nel `head` del documento, prima del
  bundle React, anziché dal wrapper di route nel `body`.
- La navigazione `shopify:navigate` resta intercettata da React Router, così i
  clic interni non trasformano CF Ready in una pagina autonoma senza sidebar
  Shopify.
- Se il clic nasce nell'App Window dell'onboarding, la route viene inoltrata
  alla Home che l'ha aperta: la finestra si chiude prima della navigazione e la
  sidebar Shopify non viene coperta dalla Home caricata nel frame sbagliato.
- La guardia già esistente continua a riaprire nell'Admin qualsiasi rotta
  `/app` caricata fuori dalla cornice embedded.
- Il build misura tutto il JavaScript client e fallisce oltre `350 KiB` gzip.
  Il candidato corrente misura `126 KiB` gzip.
- Una regressione SSR prova posizione e unicità degli script; regressioni
  dedicate provano navigazione client-side e ripristino della cornice.

## Audit automatizzabile senza VoiceOver

La scansione del codice corrente non trova CSS custom, rimozioni dell'outline,
`tabindex` positivi, elementi grafici senza `alt` o controlli di form visibili
senza etichetta. Le pagine usano `s-page`, componenti Polaris e layout a
contenitore; i soli `button` HTML sono le azioni richieste da `ui-save-bar`.

Questa prova statica non sostituisce il passaggio live sulla build distribuita.
Dopo un deploy Development servono, sulla UI corrente:

1. navigazione ripetuta Home, Regole, Messaggi, Guida e onboarding, verificando
   a ogni clic che la sidebar Shopify resti visibile;
2. viewport a 320 CSS px e zoom Chrome al 200%, senza overflow o contenuti
   tagliati;
3. percorso completo da tastiera, inclusi Save Bar, dialoghi, `Escape` e ritorno
   del focus;
4. rilettura del `head` live per confermare un solo App Bridge e un solo Polaris;
5. rilettura del Partner Dashboard dopo la nuova telemetria, separando i
   campioni per data di deploy.

## Limite operativo

Il ramo non è stato distribuito. Nessun dato Production successivo può quindi
attestare queste correzioni e il contatore inferiore a 100 campioni resta un
vincolo esterno. Deploy, verifica Development e successiva promozione Production
richiedono il relativo ciclo autorizzato.
