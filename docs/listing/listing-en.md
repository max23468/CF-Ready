# App Store listing — English

Ready-to-paste listing copy. The Italian version is
[`listing-it.md`](listing-it.md); the two must stay aligned — if a fact changes,
change it in both within the same edit.

Italian is the primary published listing language. The Partner Dashboard
marked this aligned English listing `Live` on 23 August 2026; both languages
now appear under published languages and no unpublished language remains.

Field character limits must be **reconfirmed in the Partner Dashboard when
filling the listing in**. Actual lengths are stated below each text so a tighter
limit means trimming, not rewriting.

Sources: §14 and §24 of the
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md), `app/plans.server.ts`
for amounts, `extensions/cf-ready-validation/` for checkout behaviour.

---

## Name and identity

| Field | Value |
| --- | --- |
| App name | CF Ready - Codice Fiscale |
| Short name in Admin | CF Ready |
| Handle | `cf-ready` |
| Primary category | Store management → Finances → Taxes |
| Secondary category | Marketing and conversion → Checkout → Checkout - Other |
| Geographic requirement | merchant must ship to Italy |
| Icon | `docs/brand/assets/png/icon-app-1200.png` |
| Feature image | `docs/brand/assets/png/feature-image-en-1600.png` |

The feature image needs alt text alongside it:

> CF Ready - Codice Fiscale (Italian tax code) at checkout

It describes what is visible, not what we would like the reader to conclude: alt
text that repeats the tagline is useless to someone who cannot see the image.

## App card subtitle

> Codice Fiscale (Italian tax code) and PEC validation.

**53/62 characters.**

## Introduction

> Makes Codice Fiscale, the Italian tax code, required at checkout and formally
> validates it.

**91/100 characters.**

## App details

> Shopify shows Italian tax fields at checkout but cannot make them required or
> validate them. CF Ready does: Codice Fiscale, the Italian tax code, and PEC can
> be optional or required, with formal validation before order completion. It
> adds no fields, changes no theme, and does not require Plus. If the app is
> unavailable, checkout stays open, and foreign customers are never blocked.
> Validation is formal, not identity-based: it does not certify that a tax code
> belongs to the person entering it.

**496/500 characters.**

## Key features

1. `Codice Fiscale (Italian tax code) required and formally validated at checkout.`
2. `PEC as an independent rule: require it with Codice Fiscale or leave it out.`
3. `No theme changes: uses the tax fields Shopify already provides for Italy.`
4. `Foreign customers excluded: the rule applies only to Italian deliveries.`
5. `Never blocks on errors: checkout always stays open.`

## Search terms

`Codice Fiscale`, `PEC`, `Invoice`, `Tax`, `Checkout`.

The web-search title and meta description are shared with the primary listing
and can only be edited there.

## Channels and declared limitations

To be shown in the listing with the same weight as the benefits, not tucked at
the end.

| Scope | Status |
| --- | --- |
| Online checkout | supported |
| Accelerated checkouts (Apple Pay, Google Pay, Shop Pay, PayPal) | supported per the compatibility Shopify declares for Validation Functions |
| In-store pickup with Italian delivery | included when the fields are present |
| Mixed orders | included if at least one delivery is in Italy |
| Shopify POS | **not supported** |
| Recurring subscription generations | **not covered** |
| Non-Italian stores | the app declares the store ineligible and starts neither trial nor payment |

## Pricing and trial

A **14-day** free trial, once per store, with every feature active and no charge.

| Mode | Launch price | Note |
| --- | --- | --- |
| Monthly | € 2.99 / month | |
| Annual | € 29.90 / year | recommended |
| One-time payment | € 89.90 | one payment, no renewal, a single store |

All three modes have **identical functionality**: no artificial tiers. Launch
prices apply for the first 90 days; whoever subscribes keeps the price they
acquired. All payments go through Shopify's app billing.

Features shown for the monthly/annual plan:

- `€2.99/month or €29.90/year`
- `Codice Fiscale and PEC`
- `Checkout validation`
- `No theme changes`
- `All updates included`

Features shown for the one-time plan:

- `One payment, no renewal`
- `€89.90 for one store`
- `Checkout validation`
- `All updates included`
- `Codice Fiscale and PEC`

**The listing shows USD while the charge is in EUR.** The Partner Dashboard plan
editor has no currency field, so the amounts are entered as a USD equivalent,
rounded up so the listing never promises less than the invoice asks. The euro
price is repeated among the plan features, inside *Pricing details* — the only
area where requirements 4.2.2 and 4.2.3 allow amounts. Reasons and sources in
§14.2 of the [Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md).

Check the amounts in `app/plans.server.ts` before publishing: listing and code
must state the same figure.

## Privacy

> Your customers' tax codes and PEC addresses never reach us. The check runs
> inside Shopify's infrastructure, during checkout, and the value entered is
> never sent to our systems, never logged and never stored. The app does not read
> orders, customers, products or inventory: the only permission requested is the
> one needed to manage its own validation.

## Links

| Item | URL |
| --- | --- |
| Support | `https://cf-ready.pages.dev/en/support` (English support, localized override) |
| Developer website | `https://cf-ready.pages.dev/en/` |
| Privacy | `https://cf-ready.pages.dev/en/privacy` |
| Terms | `https://cf-ready.pages.dev/en/terms` |
| Contact | `cfready@icloud.com` |

## What must not be written

Constraints from §9.2 of the [brand](../brand/brand-foundation.md) and §24 of the
Master Plan, repeated here because the listing is where they are tempting to
break.

- no social proof, no install counts, no quoted reviews until they genuinely
  exist;
- no percentage of orders "recovered" or errors "avoided": we have no such
  measurement and will not have one;
- do not present the app as mandatory for every Italian store;
- do not state or imply a registry-based check;
- no Shopify trademarks inside the icon, feature image or screenshots.
