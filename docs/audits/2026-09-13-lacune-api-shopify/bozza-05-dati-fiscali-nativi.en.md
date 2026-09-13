# Bozza 5 — Dati fiscali nativi oltre CF e PEC

**Pubblicato:** 13 settembre 2026, categoria Markets, [topic 37614](https://community.shopify.dev/t/feature-request-localized-checkout-fields-for-the-italian-vat-number-and-sdi-recipient-code/37614). Contenuto verificato online.

**Dove:** nuovo topic su [community.shopify.dev, categoria Markets](https://community.shopify.dev/c/markets/26), la stessa dell'invio 4, perché i localized field sono dati richiesti per Paese. In alternativa la categoria [Functions](https://community.shopify.dev/c/shopify-functions/15), se si vuole parlare soprattutto a chi sviluppa validazioni.

**Verifica:** 13 settembre 2026.

- Documentato: guida [VAT validation](https://help.shopify.com/en/manual/taxes/shopify-tax/vat-validate).
- Schema verificato con Shopify Dev MCP (`2026-07`): `LocalizedFieldKey`, `CompanyLocation.taxSettings.taxRegistrationId`, `Order.localizedFields`.
- Motivazione di prodotto: Master Plan D-005, D-006 e §5.3.

**Dati:** il testo non contiene store, merchant, ID né contenuti del caso di supporto. Non contiene affermazioni normative oltre il bisogno generale di fatturazione.

---

**Title:** Feature request: localized checkout fields for the Italian VAT number and SDI recipient code

**Context**

We build CF Ready, a public app that validates the Italian localized checkout fields `TAX_CREDENTIAL_IT` (Codice Fiscale) and `TAX_EMAIL_IT` (PEC) with a Cart and Checkout Validation Function, on all plans and without theme changes.

Italian merchants who invoice business customers usually also need the buyer's VAT number (Partita IVA) and, for electronic invoices, the SDI recipient code (Codice Destinatario) or the PEC. We decided not to support these two fields because there is no native path equivalent to the existing localized fields: the alternatives are theme changes, cart attributes or checkout UI extensions, which don't behave the same across plans, checkout types and accelerated checkouts.

**What exists today** (Admin GraphQL API and Functions 2026-07)

- `LocalizedFieldKey` has two Italian keys: `TAX_CREDENTIAL_IT` and `TAX_EMAIL_IT`.
- The Shopify Tax VAT number field only covers eligible cross-border EU/UK sales for reverse charge. Its options are "Don't include" and "Optional", it requires Shopify Tax and it isn't available in B2B-specific checkouts. We couldn't find documented access to it from the Admin API or a Function.
- `CompanyLocation.taxSettings.taxRegistrationId` exists, but it belongs to B2B company locations, not to a guest or regular customer checkout.

**Requests**

1. **Italian VAT number as a localized field**, separate from `TAX_CREDENTIAL_IT`:
   - available for domestic Italy-to-Italy sales;
   - configurable as required;
   - readable from the Cart and Checkout Validation Function and usable as an error target (`$.cart.localizedField.<KEY>`);
   - saved on the order in `Order.localizedFields`;
   - collected independently of VAT exemption and tax calculation.
2. **SDI recipient code as a localized field**, with the same properties. How it relates to the PEC should stay a merchant or app rule.
3. **Conditional requiredness declared by the app.** Today, a rule such as "PEC is required when Company is filled in" exists only in our Function, so the checkout doesn't show the field as required and the error timing isn't native. We'd like to mark a localized field as required, optionally depending on another field, and have checkout show the required indicator, accessibility state and error timing natively.

**Expected result**

An Italy-to-Italy order from a guest or a logged-in customer can require the VAT number and SDI recipient code when the buyer is a business, shows inline errors, stores the values in `Order.localizedFields` and doesn't change tax calculation.
