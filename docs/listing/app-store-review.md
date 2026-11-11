# Review App Store

Requisiti da rispettare a ogni submission e nuova review. I testi sono in
[listing-it.md](listing-it.md) e [listing-en.md](listing-en.md), le istruzioni per il
revisore in [reviewer-instructions.md](reviewer-instructions.md), la demo in
[screencast-script.md](screencast-script.md).

## Distribuzione

Public app, disponibile ai merchant di qualunque Paese, senza custom distribution né
requisito Plus. La listing non applica un filtro geografico. Nome pubblicato
**CF Ready | Codice Fiscale**, handle `cf-ready`, coerente tra listing, App Home, sito e
documenti.

La comunicazione si rivolge ai merchant che devono emettere fattura elettronica per
tutti o molti ordini B2C. Non presenta l'app come obbligatoria per ogni e-commerce.

## Materiali

Nessuna prova sociale inventata, nessun claim di installazioni o risultati senza
evidenza. Le specifiche si riverificano alla submission.

| Elemento | Requisito |
|---|---|
| Icona app | 1200 × 1200 px, JPEG o PNG, angoli quadrati, logo lontano dai bordi: `docs/brand/assets/png/icon-app-1200.png` |
| Feature image | 1600 × 900 px, un solo punto focale, fondo pieno, contrasto ≥ 4,5:1, alt text |
| Marchi Shopify | vietati in icona, banner e screenshot |
| Immagini | mostrano soprattutto la UI reale dell'app |

L'icona contiene la sigla `CF`: rischio accettato (D-114). Se la review la contesta,
si usa `docs/brand/assets/icon-app-notext.svg`, si rigenera il PNG a 1200 px e il
resto dell'identità non cambia. Il prezzo in euro compare solo nella descrizione dei
piani, dentro *Pricing details*.

## Screencast

Obbligatorio. Durata 3–5 minuti, in inglese o con sottotitoli inglesi. Mostra
l'approvazione billing Production senza approvare la charge.

## Istruzioni al revisore

Nessuno store né credenziali (D-132): il revisore installa l'app su un proprio
development store e configura fatturazione e consegna italiane in un checkout con
Codice Fiscale e PEC visibili.

## Audit prima della submission

- App Store requirements correnti;
- [controlli ufficiali Shopify](../runbooks/shopify-release-security-checks.md), ripetuti
  a ogni release;
- GraphQL Admin API e scope minimi;
- webhook privacy;
- billing;
- installazione pulita, disinstallazione e reinstallazione;
- store Basic;
- IT/EN complete, URL legali, supporto;
- nessun dato personale nei log;
- Function API rigenerata dalla CLI corrente e validata;
- nessuna feature descritta ma assente;
- nessun prezzo o limite ambiguo.

Ogni gate bloccante ha una prova fresca con link, ID o risultato osservato: una
casella spuntata senza prova non è readiness. Modello storico:
[release readiness 1.0](../archive/release-readiness-1.0.md).

## Built for Shopify

La fonte autorevole è la pagina Distribution dell'app nel Partner Dashboard. Prima della
candidatura si rileggono i
[requisiti ufficiali](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements)
e il changelog. Installazioni, uso e recensioni restano autentici: nulla viene
incentivato o generato per chiudere un gate. Stato e readback sono nella
[ricevuta Built for Shopify](../evidence/2026-08-26-m12-built-for-shopify.md).
