# Bozza 1 — Documentazione dei target dei localized field

**Pubblicato:** 13 settembre 2026, [topic 37612](https://community.shopify.dev/t/cart-and-checkout-validation-docs-localized-field-error-target-shown-in-three-different-forms-plural-example-silently-blocks-checkout/37612). La versione pubblicata contiene ancora la frase precedente sul Developer Support. Chiuso su decisione dell'owner: nessuna modifica al post e nessuna risposta al caso del supporto.

**Dove:**

1. nuovo topic su [community.shopify.dev](https://community.shopify.dev/c/shopify-functions/15), categoria Functions (la pagina di reference non offre un modulo di feedback);
2. risposta al caso Developer Support del 30 luglio 2026, con il link al topic.

**Verifica:** il 13 settembre 2026 la tabella mostra ancora `$.cart.localizedfield.key` e gli esempi JavaScript e Rust usano ancora `$.cart.localizedFields.<key>`.

---

**Title:** Cart and Checkout Validation docs: localized field error target shown in three different forms (plural example silently blocks checkout)

**API and version:** Cart and Checkout Validation Function API, 2026-07 (same content on the 2026-10 page)

**Summary**

The documentation shows three different paths for a localized field error target:

| Location | Target shown |
| --- | --- |
| Validation Function API, "Supported checkout field targets" table | `$.cart.localizedfield.key` |
| Validation Function API, JavaScript and Rust examples for required localized fields | `$.cart.localizedFields.${field.key}` |
| Checkout UI extensions, Localized Fields API | `$.cart.localizedField.${taxIdField.key}` |

Only `$.cart.localizedField.<KEY>` (singular, camelCase, uppercase key) renders. With the plural path used in the Function examples, checkout is blocked and no message is shown anywhere.

**Observed** (29 July 2026, development store, API 2026-07)

- `$.cart.localizedFields.TAX_CREDENTIAL_IT`: order blocked, no message. Same result with one-page and three-page checkout, with the order confirmation step on and off, and with a plain ASCII message.
- `$.cart.localizedField.TAX_CREDENTIAL_IT`: message rendered under the field.

As of 13 September 2026 the table and both examples still show these forms.

**Expected**

Copying the official example renders the error under the field.

**Requests**

1. Use `$.cart.localizedField.<KEY>` in the table and in every example, ideally with a real key such as `TAX_CREDENTIAL_IT`.
2. Report an unrecognized target during development (CLI, function replay or run log) instead of discarding the error silently.

**Impact**

An app that follows the official example ships a validation that blocks checkout without telling the buyer what to fix.
