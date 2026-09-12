import {
  CHECKOUT_LABEL_KEYS,
  automaticCheckoutLabelCapability,
  checkoutLabelFamily,
  checkoutLabelName,
  checkoutLabelsRevision,
  classifyAddress2,
  type CheckoutLabelLocale,
  type CheckoutLabelMarket,
  type CheckoutLabelKey,
  type CheckoutLabelSlot,
  type CheckoutLabelsSnapshot,
} from "./domain";

type Admin = {
  graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
};

type GraphqlEnvelope<T> = {
  data?: T;
  errors?: Array<{ message?: string; extensions?: { code?: string } }>;
  extensions?: {
    cost?: {
      requestedQueryCost?: number;
      throttleStatus?: { currentlyAvailable?: number; restoreRate?: number };
    };
  };
};

type ResourceNode = {
  resourceId: string;
  translatableContent: Array<{
    key: string;
    value: string;
    digest: string;
    locale: string;
  }>;
};

type TranslationNode = {
  key: string;
  value: string;
  locale: string;
  outdated: boolean;
  market: { id: string; name: string } | null;
};

type MarketNode = {
  id: string;
  name: string;
  webPresences: {
    nodes: Array<{
      defaultLocale: { locale: string };
      alternateLocales: Array<{ locale: string }>;
      markets: { nodes: Array<{ id: string }>; pageInfo: { hasNextPage: boolean } };
    }>;
    pageInfo: { hasNextPage: boolean };
  };
};

type DiscoveryContextData = {
  shopLocales: Array<{
    locale: string;
    name: string;
    primary: boolean;
    published: boolean;
  }>;
  markets: {
    nodes: MarketNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

type DiscoveryResourcesData = {
  translatableResources: {
    nodes: ResourceNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

const DISCOVER_CHECKOUT_LABEL_CONTEXT = `#graphql
  query DiscoverCheckoutLabelContext($after: String) {
    shopLocales {
      locale
      name
      primary
      published
    }
    markets(first: 10, after: $after) {
      nodes {
        id
        name
        webPresences(first: 5) {
          nodes {
            defaultLocale { locale }
            alternateLocales { locale }
            markets(first: 10) { nodes { id } pageInfo { hasNextPage } }
          }
          pageInfo { hasNextPage }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const DISCOVER_CHECKOUT_LABEL_RESOURCES = `#graphql
  query DiscoverCheckoutLabelResources($first: Int!, $after: String) {
    translatableResources(
      first: $first
      after: $after
      resourceType: ONLINE_STORE_THEME_LOCALE_CONTENT
    ) {
      nodes {
        resourceId
        translatableContent { key value digest locale }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const READ_CHECKOUT_LABEL_TRANSLATIONS = `#graphql
  query ReadCheckoutLabelTranslations($resourceId: ID!, $locale: String!, $marketId: ID) {
    translatableResource(resourceId: $resourceId) {
      resourceId
      translations(locale: $locale, marketId: $marketId) {
        key
        value
        locale
        outdated
        market { id name }
      }
    }
  }
`;

const REGISTER_CHECKOUT_LABEL_TRANSLATIONS = `#graphql
  mutation RegisterCheckoutLabelTranslations(
    $resourceId: ID!
    $translations: [TranslationInput!]!
  ) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      translations { key value locale market { id } }
      userErrors { code field message }
    }
  }
`;

const REMOVE_CHECKOUT_LABEL_TRANSLATIONS = `#graphql
  mutation RemoveCheckoutLabelTranslations(
    $resourceId: ID!
    $translationKeys: [String!]!
    $locales: [String!]!
    $marketIds: [ID!]
  ) {
    translationsRemove(
      resourceId: $resourceId
      translationKeys: $translationKeys
      locales: $locales
      marketIds: $marketIds
    ) {
      translations { key value locale market { id } }
      userErrors { code field message }
    }
  }
`;

export async function readCheckoutLabels(admin: Admin): Promise<CheckoutLabelsSnapshot> {
  const [context, resources] = await Promise.all([
    readCheckoutLabelContext(admin),
    readCheckoutLabelResources(admin),
  ]);
  const { locales, markets } = context;

  const candidates = new Map<string, ResourceNode[]>();
  for (const resource of resources) {
    for (const content of resource.translatableContent) {
      if (!checkoutLabelName(content.key)) continue;
      const current = candidates.get(content.key) ?? [];
      current.push(resource);
      candidates.set(content.key, current);
    }
  }

  const issues: CheckoutLabelsSnapshot["issues"] = [];
  const selected = new Set<ResourceNode>();
  for (const key of Object.values(CHECKOUT_LABEL_KEYS)) {
    const found = candidates.get(key) ?? [];
    if (found.length === 0) issues.push({ code: "checkout_labels_resource_missing", key });
    if (found.length > 1) issues.push({ code: "checkout_labels_resource_ambiguous", key });
    if (found.length === 1) selected.add(found[0]);
  }

  const translationEntries = await Promise.all(
    [...selected].flatMap((resource) =>
      locales.flatMap((locale) =>
        [null, ...markets.filter((market) => market.locales.includes(locale.locale))].map(
          (market) => {
            const marketId = market?.id ?? null;
            return graphqlData<{
              translatableResource: {
                resourceId: string;
                translations: TranslationNode[];
              } | null;
            }>(admin, READ_CHECKOUT_LABEL_TRANSLATIONS, {
              resourceId: resource.resourceId,
              locale: locale.locale,
              marketId,
            }).then(
              (body) =>
                [
                  translationMapKey(resource.resourceId, locale.locale, marketId),
                  body.translatableResource?.translations ?? [],
                ] as const,
            );
          },
        ),
      ),
    ),
  );
  const translations = new Map<string, TranslationNode[]>(translationEntries);

  const slots: CheckoutLabelSlot[] = [];
  for (const resource of selected) {
    for (const content of resource.translatableContent) {
      const name = checkoutLabelName(content.key);
      if (!name || candidates.get(content.key)?.length !== 1) continue;
      for (const locale of locales) {
        const globalMatching = (
          translations.get(translationMapKey(resource.resourceId, locale.locale, null)) ?? []
        ).filter((translation) => translation.key === content.key);
        if (locale.locale === content.locale) {
          slots.push({
            resourceId: resource.resourceId,
            key: content.key as CheckoutLabelSlot["key"],
            name,
            locale: locale.locale,
            family: locale.family,
            marketId: null,
            marketName: null,
            kind: "source",
            capability: automaticCheckoutLabelCapability(name, "source", locale),
            currentValue: content.value,
            inheritedValue: null,
            sourceValue: content.value,
            sourceDigest: content.digest,
            outdated: false,
          });
        }

        const global = globalMatching.find((translation) => translation.market === null);
        if (locale.locale !== content.locale || global) {
          slots.push({
            resourceId: resource.resourceId,
            key: content.key as CheckoutLabelSlot["key"],
            name,
            locale: locale.locale,
            family: locale.family,
            marketId: null,
            marketName: null,
            kind: "global_translation",
            capability: automaticCheckoutLabelCapability(name, "global_translation", locale),
            currentValue: global?.value ?? null,
            inheritedValue: content.value,
            sourceValue: content.value,
            sourceDigest: content.digest,
            outdated: global?.outdated ?? false,
          });
        }

        const marketContexts = new Map<string, string>();
        for (const market of markets) {
          if (market.locales.includes(locale.locale)) {
            marketContexts.set(market.id, market.name);
          }
        }
        for (const [marketId, marketName] of marketContexts) {
          const translation = (
            translations.get(translationMapKey(resource.resourceId, locale.locale, marketId)) ?? []
          ).find((item) => item.key === content.key);
          slots.push({
            resourceId: resource.resourceId,
            key: content.key as CheckoutLabelSlot["key"],
            name,
            locale: locale.locale,
            family: locale.family,
            marketId,
            marketName,
            kind: "market_translation",
            capability: automaticCheckoutLabelCapability(name, "market_translation", locale),
            currentValue: translation?.value ?? null,
            inheritedValue: global?.value ?? content.value,
            sourceValue: content.value,
            sourceDigest: content.digest,
            outdated: translation?.outdated ?? false,
          });
        }
      }
    }
  }

  const address2 = classifyAddress2(slots);
  const snapshotWithoutRevision = { locales, markets, slots, issues, address2 };
  return {
    ...snapshotWithoutRevision,
    revision: await checkoutLabelsRevision(snapshotWithoutRevision),
  };
}

async function readCheckoutLabelContext(admin: Admin) {
  let locales: CheckoutLabelLocale[] = [];
  const markets: CheckoutLabelMarket[] = [];
  let after: string | null = null;
  const cursors = new Set<string | null>();

  do {
    if (cursors.has(after)) throw new Error("checkout_labels_readback_failed");
    cursors.add(after);
    const body: DiscoveryContextData = await graphqlData(admin, DISCOVER_CHECKOUT_LABEL_CONTEXT, {
      after,
    });
    if (locales.length === 0) {
      locales = body.shopLocales.flatMap((locale) => {
        const family = checkoutLabelFamily(locale.locale);
        return family ? [{ ...locale, family }] : [];
      });
    }
    markets.push(
      ...body.markets.nodes.map((market) => {
        const presences = market.webPresences.nodes;
        const ambiguous =
          market.webPresences.pageInfo.hasNextPage ||
          presences.length !== 1 ||
          presences.some(({ markets }) => markets.pageInfo.hasNextPage);
        const defaultLocale = ambiguous ? null : presences[0].defaultLocale.locale;
        const discoveredLocales = presences.flatMap((presence) => [
          presence.defaultLocale.locale,
          ...presence.alternateLocales.map(({ locale }) => locale),
        ]);
        const fallbackLocales = locales.flatMap(({ locale, published }) =>
          published ? [locale] : [],
        );
        return {
          id: market.id,
          name: market.name,
          defaultLocale,
          locales: (discoveredLocales.length > 0 ? discoveredLocales : fallbackLocales).filter(
            (locale, index, all) => all.indexOf(locale) === index,
          ),
          resolution: ambiguous
            ? ("ambiguous" as const)
            : presences[0].markets.nodes.some(({ id }) => id === market.id)
              ? ("direct" as const)
              : ("inherited" as const),
        };
      }),
    );
    after = body.markets.pageInfo.hasNextPage ? body.markets.pageInfo.endCursor : null;
  } while (after);
  return { locales, markets };
}

async function readCheckoutLabelResources(admin: Admin) {
  const resources: ResourceNode[] = [];
  let after: string | null = null;
  const cursors = new Set<string | null>();
  do {
    if (cursors.has(after)) throw new Error("checkout_labels_readback_failed");
    cursors.add(after);
    const body: DiscoveryResourcesData = await graphqlData(
      admin,
      DISCOVER_CHECKOUT_LABEL_RESOURCES,
      { first: 50, after },
    );
    resources.push(...body.translatableResources.nodes);
    after = body.translatableResources.pageInfo.hasNextPage
      ? body.translatableResources.pageInfo.endCursor
      : null;
  } while (after);
  return resources;
}

export async function registerCheckoutLabelTranslations(
  admin: Admin,
  resourceId: string,
  translations: Array<{
    locale: string;
    key: CheckoutLabelKey;
    value: string;
    translatableContentDigest: string;
    marketId?: string;
  }>,
) {
  assertTranslationInputs(resourceId, translations);
  await translationMutation(
    admin,
    REGISTER_CHECKOUT_LABEL_TRANSLATIONS,
    { resourceId, translations },
    "translationsRegister",
  );
}

export async function removeCheckoutLabelTranslation(admin: Admin, slot: CheckoutLabelSlot) {
  assertWritableSlot(slot);
  await translationMutation(
    admin,
    REMOVE_CHECKOUT_LABEL_TRANSLATIONS,
    {
      resourceId: slot.resourceId,
      translationKeys: [slot.key],
      locales: [slot.locale],
      marketIds: slot.marketId ? [slot.marketId] : null,
    },
    "translationsRemove",
  );
}

async function graphqlData<T>(admin: Admin, query: string, variables: Record<string, unknown>) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const body = await graphqlRequest<T>(admin, query, variables);
    if (!body.errors?.length && body.data) return body.data;
    if (attempt === 0 && throttled(body.errors)) {
      await waitForThrottle(body);
      continue;
    }
    throw new Error("checkout_labels_readback_failed");
  }
  throw new Error("checkout_labels_readback_failed");
}

async function translationMutation(
  admin: Admin,
  query: string,
  variables: Record<string, unknown>,
  field: "translationsRegister" | "translationsRemove",
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const body = await graphqlRequest<
      Record<typeof field, { userErrors: Array<{ code?: string; message?: string }> }>
    >(admin, query, variables);
    if (body.errors?.length || !body.data) {
      if (attempt === 0 && throttled(body.errors)) {
        await waitForThrottle(body);
        continue;
      }
      throw new Error("checkout_labels_readback_failed");
    }
    const errors = body.data[field].userErrors;
    if (attempt === 0 && errors.some(({ code }) => code === "THROTTLED")) {
      await waitForThrottle(body);
      continue;
    }
    assertNoTranslationErrors(errors);
    return;
  }
}

async function graphqlRequest<T>(admin: Admin, query: string, variables: Record<string, unknown>) {
  const response = await admin.graphql(query, { variables });
  if (!response.ok) throw new Error("checkout_labels_readback_failed");
  return (await response.json()) as GraphqlEnvelope<T>;
}

function throttled(errors: GraphqlEnvelope<unknown>["errors"]) {
  return Boolean(
    errors?.some(
      ({ message, extensions }) =>
        extensions?.code === "THROTTLED" || message?.toLowerCase().includes("throttled"),
    ),
  );
}

async function waitForThrottle(body: GraphqlEnvelope<unknown>) {
  const cost = body.extensions?.cost;
  const missing = Math.max(
    0,
    (cost?.requestedQueryCost ?? 0) - (cost?.throttleStatus?.currentlyAvailable ?? 0),
  );
  const restoreRate = cost?.throttleStatus?.restoreRate ?? 0;
  const waitMs = Math.min(
    2_000,
    Math.max(100, restoreRate > 0 ? (missing / restoreRate) * 1_000 : 250),
  );
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

function assertNoTranslationErrors(errors: Array<{ code?: string; message?: string }>) {
  if (errors.length === 0) return;
  const stale = errors.some(({ code, message }) => {
    const text = `${code ?? ""} ${message ?? ""}`.toLowerCase();
    return text.includes("digest") || text.includes("outdated");
  });
  throw new Error(stale ? "checkout_labels_stale_digest" : "checkout_labels_partial_sync");
}

function translationMapKey(resourceId: string, locale: string, marketId: string | null) {
  return `${resourceId}\u0000${locale}\u0000${marketId ?? ""}`;
}

function assertTranslationInputs(
  resourceId: string,
  translations: Array<{ key: CheckoutLabelKey; locale: string }>,
) {
  if (!resourceId || translations.length === 0) throw new Error("checkout_labels_partial_sync");
  for (const input of translations) {
    if (!checkoutLabelName(input.key) || !checkoutLabelFamily(input.locale)) {
      throw new Error("checkout_labels_partial_sync");
    }
  }
}

function assertWritableSlot(slot: CheckoutLabelSlot) {
  if (
    !slot.resourceId ||
    !checkoutLabelName(slot.key) ||
    !checkoutLabelFamily(slot.locale) ||
    slot.kind === "source"
  ) {
    throw new Error("checkout_labels_partial_sync");
  }
}

export const checkoutLabelsGraphql = {
  discover: DISCOVER_CHECKOUT_LABEL_CONTEXT,
  resources: DISCOVER_CHECKOUT_LABEL_RESOURCES,
  translations: READ_CHECKOUT_LABEL_TRANSLATIONS,
  register: REGISTER_CHECKOUT_LABEL_TRANSLATIONS,
  remove: REMOVE_CHECKOUT_LABEL_TRANSLATIONS,
};
