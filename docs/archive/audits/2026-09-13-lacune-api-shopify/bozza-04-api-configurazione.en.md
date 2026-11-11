# Bozza 4 — API di configurazione del checkout

**Pubblicato:** 13 settembre 2026, categoria Markets, [topic 37613](https://community.shopify.dev/t/feature-request-admin-api-support-for-native-checkout-field-labels-and-checkout-form-settings/37613). Contenuto verificato online e identico alla bozza.

**Dove:** nuovo topic su [community.shopify.dev, categoria Markets](https://community.shopify.dev/c/markets/26), che copre localizzazione e traduzioni. Non esiste una categoria dedicata alle feature request.

**Verifica:** 13 settembre 2026, schema Admin GraphQL `2026-07` validato con Shopify Dev MCP: topic webhook, `compareDigest`, `translationsRegister`, `marketLocalizationsRegister`, `themeFilesUpsert`. Le quattro chiavi provengono da `app/checkout-labels/domain.ts`.

**Dati:** il testo non contiene store, merchant, ID né contenuti del caso di supporto.

---

**Title:** Feature request: Admin API support for native checkout field labels and checkout form settings

**Context**

We build CF Ready, a public app that validates the Italian localized checkout fields `TAX_CREDENTIAL_IT` and `TAX_EMAIL_IT` with a Cart and Checkout Validation Function. To keep the checkout labels consistent with the merchant's rules, the app reads these keys of `ONLINE_STORE_THEME_LOCALE_CONTENT` and, with the merchant's consent, writes their translations (Admin GraphQL API 2026-07):

- `shopify.checkout.localized_fields.additional_information.tax_credential_it`
- `shopify.checkout.localized_fields.additional_information.tax_email_it`
- `shopify.checkout.contact.address2_label`
- `shopify.checkout.contact.optional_address2_label`

We hit five gaps. Each one turns into a manual step during onboarding or a conservative workaround in the app.

**1. Source text in the primary language**

`translationsRegister` manages translations only. When a store's primary language is Italian, the Italian label buyers see is the source content of the theme locale file. As far as we can tell, the only programmatic way to change it is `themeFilesUpsert` with `write_themes`, which means editing theme files to change four checkout strings.

Request: a narrowly scoped way to read and update the source text of specific checkout keys, without theme write access.

**2. Effective text per locale and market**

To find these keys we page through every `ONLINE_STORE_THEME_LOCALE_CONTENT` resource, then combine shop locales, `Market.webPresences`, global translations and market-specific translations. Inherited or ambiguous market contexts can't be resolved reliably, so we ask the merchant to check the live checkout.

Request: a query by key, locale and market that returns the text the buyer actually sees, where it comes from (source, global translation or market override) and whether it can be written. Please also document which overrides apply to checkout keys.

**3. Checkout form settings**

We couldn't find a way to read:

- whether "Address line 2" is required, optional or hidden;
- whether "Require a confirmation step" (Settings > General > Order processing) is enabled.

The first decides which label buyers see, so today the merchant has to declare it manually. The second changes how validation errors behave on the review step, and we can't tell merchants when it matters for them.

Request: read access to these checkout form settings. Write access isn't needed.

**4. Conditional writes for translations**

`metafieldsSet` supports `compareDigest`, `TranslationInput` doesn't. `translatableContentDigest` protects against changes to the source content, not against a translation changed in the meantime, for example with Translate & Adapt. Between our read and our write there is a window in which we could overwrite the merchant's change.

Request: compare-and-set on resource, key, locale and market for `translationsRegister` and `translationsRemove`.

**5. Change events**

`WebhookSubscriptionTopic` includes `LOCALES_UPDATE` and `MARKETS_UPDATE`, but no topics for translation changes, checkout form settings or validations. To detect changes made outside the app we have to read translations and validation state again.

Request: webhook topics for changes to translations of checkout keys, to checkout form settings and to validations owned by the app.

**Expected result**

A merchant whose primary language is Italian can set up the app without manual checks on labels or form settings, and a label changed by someone else in the meantime produces a conflict instead of being overwritten.
