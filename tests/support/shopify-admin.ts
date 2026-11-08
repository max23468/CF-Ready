import type { CheckoutConfig } from "../../app/config";
import { CHECKOUT_LABEL_KEYS } from "../../app/checkout-labels/domain";

// Shopify simulato al confine GraphQL: i test passano dal codice reale, D1 compreso, e osservano
// le mutation ricevute e il nuovo stato remoto. Un'operazione sconosciuta fa fallire il test.

type Subscription = {
  id: string;
  name?: string;
  status?: string;
  createdAt?: string;
  trialDays?: number;
  test?: boolean;
  currentPeriodEnd?: string | null;
  interval?: "EVERY_30_DAYS" | "ANNUAL";
  amount?: string;
};

type Purchase = { id: string; status: "ACTIVE" | "PENDING"; createdAt?: string };

type ValidationState = {
  id: string;
  enabled: boolean;
  handle?: string;
  config?: unknown;
};

type Translation = { key: string; locale: string; marketId: string | null; value: string };

type Call = { operation: string; variables: Record<string, unknown> };

type GraphqlFailure = Error | Response | Record<string, unknown>;

export const LABEL_RESOURCE_ID = "gid://shopify/OnlineStoreThemeLocaleContent/labels";

const SOURCE_LABELS: Record<string, string> = {
  [CHECKOUT_LABEL_KEYS.taxCode]: "Codice fiscale",
  [CHECKOUT_LABEL_KEYS.pec]: "PEC",
  [CHECKOUT_LABEL_KEYS.address2]: "Interno",
  [CHECKOUT_LABEL_KEYS.optionalAddress2]: "Interno, scala, ecc. (facoltativo)",
};

const page = { hasNextPage: false, endCursor: null };

function subscriptionNode(subscription: Subscription) {
  return {
    name: "launch-monthly",
    status: "ACTIVE",
    createdAt: "2026-08-01T08:00:00Z",
    trialDays: 0,
    test: true,
    currentPeriodEnd: "2026-08-31T21:59:59Z",
    ...subscription,
    lineItems: [
      {
        plan: {
          pricingDetails: {
            interval: subscription.interval ?? "EVERY_30_DAYS",
            price: { amount: subscription.amount ?? "2.99", currencyCode: "EUR" },
          },
        },
      },
    ],
  };
}

export function shopifyAdmin() {
  const state = {
    shop: {
      name: "Negozio Demo",
      ianaTimezone: "Europe/Rome",
      plan: { partnerDevelopment: true },
      shopAddress: { countryCodeV2: "IT" },
    },
    validations: [] as ValidationState[],
    subscriptions: [] as Subscription[],
    purchases: [] as Purchase[],
    webhooks: [] as string[],
    locales: [
      { locale: "it", name: "Italiano", primary: true, published: true },
      { locale: "en", name: "English", primary: false, published: true },
    ],
    markets: [] as { id: string; name: string; locales: string[] }[],
    sourceLocale: "it",
    labels: { ...SOURCE_LABELS } as Record<string, string>,
    translations: [] as Translation[],
    digest: "digest",
  };
  const calls: Call[] = [];
  const failures = new Map<string, GraphqlFailure[]>();
  const interceptors = new Map<string, (() => void | Promise<void>)[]>();
  let holdingWrites = false;
  const heldWrites: Parameters<typeof applyTranslation>[0][] = [];

  function translation(key: string, locale: string, marketId: string | null) {
    return state.translations.find(
      (item) => item.key === key && item.locale === locale && item.marketId === marketId,
    );
  }

  function applyTranslation(item: {
    key: string;
    locale: string;
    value: string;
    marketId?: string;
  }) {
    const marketId = item.marketId ?? null;
    const current = translation(item.key, item.locale, marketId);
    if (current) current.value = item.value;
    else
      state.translations.push({
        key: item.key,
        locale: item.locale,
        value: item.value,
        marketId,
      });
  }

  function validationNodes() {
    return state.validations.map((validation) => ({
      id: validation.id,
      title: "CF Ready",
      enabled: validation.enabled,
      blockOnFailure: false,
      shopifyFunction: { handle: validation.handle ?? "cf-ready-validation" },
      metafield: validation.config === undefined ? null : { jsonValue: validation.config },
    }));
  }

  function installation() {
    const subscriptions = state.subscriptions.map(subscriptionNode);
    return {
      activeSubscriptions: subscriptions.filter(({ status }) => status === "ACTIVE"),
      allSubscriptions: { nodes: subscriptions, pageInfo: page },
      oneTimePurchases: {
        nodes: state.purchases.map((purchase) => ({
          name: "CF Ready",
          test: true,
          createdAt: "2026-08-07T08:00:00Z",
          price: { amount: "89.90", currencyCode: "EUR" },
          ...purchase,
        })),
        pageInfo: page,
      },
    };
  }

  function writeValidation(id: string | null, input: Record<string, unknown>) {
    const metafields = input.metafields as { value: string }[] | undefined;
    const config = metafields ? JSON.parse(metafields[0].value) : undefined;
    let target = state.validations.find((validation) => validation.id === id);
    if (!target) {
      target = { id: `gid://shopify/Validation/${state.validations.length + 1}`, enabled: false };
      state.validations.push(target);
    }
    target.enabled = input.enable as boolean;
    if (config !== undefined) target.config = config;
    return { validation: { id: target.id }, userErrors: [] };
  }

  const handlers: Record<string, (variables: Record<string, unknown>) => unknown> = {
    CfReadyContext: () => ({
      shop: state.shop,
      validations: { nodes: validationNodes(), pageInfo: page },
    }),
    CfReadyHomeSnapshot: () => ({
      shop: state.shop,
      validations: { nodes: validationNodes(), pageInfo: page },
      currentAppInstallation: installation(),
    }),
    CfReadyBilling: () => ({ currentAppInstallation: installation() }),
    CfReadySubscriptionCreate: () => ({
      appSubscriptionCreate: { confirmationUrl: "https://shopify.test/approve", userErrors: [] },
    }),
    CfReadyOneTimeCreate: () => ({
      appPurchaseOneTimeCreate: { confirmationUrl: "https://shopify.test/approve", userErrors: [] },
    }),
    CfReadySubscriptionCancel: ({ id }) => {
      state.subscriptions = state.subscriptions.filter((item) => item.id !== id);
      return { appSubscriptionCancel: { userErrors: [] } };
    },
    CfReadyValidationCreate: ({ validation }) => ({
      validationCreate: writeValidation(null, validation as Record<string, unknown>),
    }),
    CfReadyValidationUpdate: ({ id, validation }) => ({
      validationUpdate: writeValidation(id as string, validation as Record<string, unknown>),
    }),
    CfReadyOrderWebhooks: () => ({
      webhookSubscriptions: { nodes: state.webhooks.map((id) => ({ id })) },
    }),
    CfReadyCreateOrderWebhook: () => {
      const id = `gid://shopify/WebhookSubscription/${state.webhooks.length + 1}`;
      state.webhooks.push(id);
      return { webhookSubscriptionCreate: { webhookSubscription: { id }, userErrors: [] } };
    },
    CfReadyDeleteOrderWebhook: ({ id }) => {
      state.webhooks = state.webhooks.filter((item) => item !== id);
      return { webhookSubscriptionDelete: { userErrors: [] } };
    },
    DiscoverCheckoutLabelContext: () => ({
      shopLocales: state.locales,
      markets: {
        nodes: state.markets.map(({ id, name, locales }) => ({
          id,
          name,
          webPresences: {
            nodes: [
              {
                defaultLocale: { locale: locales[0] },
                alternateLocales: locales.slice(1).map((locale) => ({ locale })),
                markets: { nodes: [{ id }], pageInfo: { hasNextPage: false } },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        })),
        pageInfo: page,
      },
    }),
    DiscoverCheckoutLabelResources: () => ({
      translatableResources: {
        nodes: [
          {
            resourceId: LABEL_RESOURCE_ID,
            translatableContent: Object.entries(state.labels).map(([key, value]) => ({
              key,
              value,
              digest: state.digest,
              locale: state.sourceLocale,
            })),
          },
        ],
        pageInfo: page,
      },
    }),
    ReadCheckoutLabelTranslations: ({ resourceId, locale, marketId }) => ({
      translatableResource: {
        resourceId,
        translations: state.translations
          .filter(
            (item) => item.locale === locale && item.marketId === ((marketId as string) ?? null),
          )
          .map((item) => ({
            key: item.key,
            value: item.value,
            locale: item.locale,
            outdated: false,
            market: item.marketId ? { id: item.marketId, name: "Mercato" } : null,
          })),
      },
    }),
    RegisterCheckoutLabelTranslations: ({ translations }) => {
      const written = translations as {
        key: string;
        locale: string;
        value: string;
        marketId?: string;
      }[];
      if (holdingWrites) heldWrites.push(...written);
      else written.forEach(applyTranslation);
      return {
        translationsRegister: {
          translations: written.map(({ key, value, locale, marketId }) => ({
            key,
            value,
            locale,
            market: marketId ? { id: marketId } : null,
          })),
          userErrors: [],
        },
      };
    },
    RemoveCheckoutLabelTranslations: ({ translationKeys, locales, marketIds }) => {
      const keys = translationKeys as string[];
      const removedLocales = locales as string[];
      const markets: (string | null)[] = (marketIds as string[] | null | undefined) ?? [null];
      state.translations = state.translations.filter(
        (item) =>
          !(
            keys.includes(item.key) &&
            removedLocales.includes(item.locale) &&
            markets.includes(item.marketId)
          ),
      );
      return {
        translationsRemove: {
          translations: keys.map((key) => ({
            key,
            value: "",
            locale: removedLocales[0],
            market: null,
          })),
          userErrors: [],
        },
      };
    },
  };

  const admin = {
    graphql: async (query: string, options?: { variables?: Record<string, unknown> }) => {
      const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "";
      const variables = options?.variables ?? {};
      calls.push({ operation, variables });
      await interceptors.get(operation)?.shift()?.();
      const failure = failures.get(operation)?.shift();
      if (failure instanceof Error) throw failure;
      if (failure instanceof Response) return failure;
      if (failure) return Response.json(failure);
      const handler = handlers[operation];
      if (!handler) throw new Error(`Operazione Shopify non simulata: ${operation}`);
      return Response.json({ data: handler(variables) });
    },
  };

  return {
    admin,
    state,
    calls,
    // Le chiamate ricevute per una o più operazioni, nell'ordine di arrivo.
    callsTo: (...operations: string[]) =>
      calls.filter(({ operation }) => operations.includes(operation)),
    // La prossima risposta a `operation` è il guasto indicato, poi Shopify torna regolare.
    failNext(operation: string, failure: GraphqlFailure) {
      failures.set(operation, [...(failures.get(operation) ?? []), failure]);
    },
    // Esegue `effect` subito prima di rispondere alla prossima `operation`.
    beforeNext(operation: string, effect: () => void | Promise<void>) {
      interceptors.set(operation, [...(interceptors.get(operation) ?? []), effect]);
    },
    // Shopify accetta le scritture ma le rende visibili soltanto dopo `releaseWrites`.
    holdWrites() {
      holdingWrites = true;
    },
    releaseWrites() {
      holdingWrites = false;
      heldWrites.splice(0).forEach(applyTranslation);
    },
    addValidation(config: CheckoutConfig | unknown, enabled = false, id?: string) {
      const validation = {
        id: id ?? `gid://shopify/Validation/${state.validations.length + 1}`,
        enabled,
        config,
      };
      state.validations.push(validation);
      return validation;
    },
    setTranslation(key: string, locale: string, value: string | null, marketId?: string | null) {
      const scope = marketId ?? null;
      state.translations = state.translations.filter(
        (item) => !(item.key === key && item.locale === locale && item.marketId === scope),
      );
      if (value !== null) state.translations.push({ key, locale, value, marketId: scope });
    },
    translation: (key: string, locale: string, marketId?: string | null) =>
      translation(key, locale, marketId ?? null)?.value ?? null,
  };
}

export type ShopifyAdminFake = ReturnType<typeof shopifyAdmin>;
