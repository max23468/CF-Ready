# Matrice Development — Etichette checkout `1.7.0`

**Data:** 9 settembre 2026  
**Ambiente:** Development  
**Store condiviso:** `cf-ready-dev.myshopify.com`  
**Promozione Production:** non eseguita

Questa ricevuta collega le capacità dell’implementazione alle prove disponibili
senza assimilare il readback Admin al rendering nel checkout.

## Snapshot distribuito

| Prova | Esito |
| --- | --- |
| Commit `develop` | `33b42296895bc30905340fed265c675c093cec25` |
| Tree | `6e73b066c5cd8cace1cbc8e0b3de63eebf5a8548` |
| Snapshot Shopify | `1.7.0-dev.6e73b066c5cd` |
| Workflow Development | [run `34359242062`](https://github.com/max23468/CF-Ready/actions/runs/34359242062), verde |
| D1 | migrazioni `0018_checkout_labels.sql` e `0019_checkout_label_decision.sql` applicate e rilette |
| Worker | deploy, smoke e capacità verdi |
| Admin reale | sezione caricata; azioni “Concedi i permessi” e “Mantieni le mie etichette” visibili |

## Capacità per tipo di slot

| Contesto | Lettura | Scrittura | Prova richiesta |
| --- | --- | --- | --- |
| contenuto sorgente della lingua primaria | sì | `read_only` | modifica nell’editor Shopify e conferma nel checkout reale |
| traduzione globale `en` secondaria | sì | `automatic` | readback della mutation e checkout reale nella stessa lingua |
| altro codice IT/EN, compresi `it-IT` ed `en-GB` | sì, senza normalizzare il codice | `guided` | conferma del merchant sul checkout reale |
| override specifico di mercato | sì | `guided` | checkout reale nello stesso mercato e locale |
| unica presenza web non assegnata direttamente al mercato | sì | `guided`, contesto `inherited` | checkout reale nel mercato figlio |
| zero, più presenze web o pagina incompleta | fallback sulle lingue pubblicate | `guided`, contesto `ambiguous` | risoluzione manuale del contesto prima della conferma |
| scope opzionali assenti o revocati | no | no | la Validation resta disponibile; il merchant può scegliere di conservare le proprie etichette |

La discovery usa `Market.webPresences`, perché Shopify consente più presenze e
aggiunge al mercato figlio quelle ereditate. `Market.webPresence` non viene più
usato. Un contesto non univoco resta visibile come “mercato da verificare” e
non abilita scritture automatiche.

## Matrice delle prove

| Scenario | Stato al 9 settembre 2026 | Evidenza o confine |
| --- | --- | --- |
| allowlist delle quattro chiavi | verde | test dominio e discovery |
| risorsa mancante o ambigua | verde | test fail-closed |
| presenza diretta, ereditata e ambigua | verde | test dominio e banner UI |
| scelta “mantieni le mie etichette” senza scope | verde | test route, servizio, D1 e UI browser |
| invalidazione della scelta dopo un nuovo snapshot | verde | revisione persistita e test servizio |
| ownership, ripristino e modifica esterna | verde | test repository e servizio |
| informative Privacy e Supporto IT/EN | aggiornate | descrivono testi osservati, copie per ownership e ripristino, permessi e assenza di dati cliente |
| deploy Development integrato | verde | run `34359242062` sul tree indicato sopra |
| consenso agli scope opzionali | da eseguire dall’owner | il piano richiede che l’owner completi personalmente il consenso Shopify |
| confronto API IT/EN e override sullo store condiviso | in attesa del consenso | nessuna scrittura parte prima del consenso e della conferma |
| checkout reale desktop e mobile per locale e mercato | in attesa del consenso | il readback Admin non costituisce questa prova |
| lingua primaria diversa, cambio lingua e disinstallazione | richiede store sacrificabile | non viene eseguito sullo store Development condiviso |

## Limiti residui registrati

L’organizzazione mantiene un solo dev store permanente. Gli scenari distruttivi
restano quindi aperti finché non viene messo a disposizione uno store
sacrificabile. Lo snapshot corrente conserva la funzione disattivata e non
modifica etichette finché il merchant non concede gli scope e conferma la prima
scrittura.
