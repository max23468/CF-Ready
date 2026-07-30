import { APP_URL } from "./env.server";
import { recordEvent } from "./events.server";
import { sha256Hex } from "./hash.server";

// Data di lancio provvisoria: la generazione Launch copre i primi 90 giorni. Finché il lancio
// non è avvenuto la finestra non è ancora aperta, quindi vale comunque il prezzo di lancio.
export const LAUNCH_WINDOW_END = "2026-11-29";
export const TRIAL_DAYS = 14;

export type PricingGeneration = "launch" | "balanced" | "value";
export type TrialStatus = "not_started" | "active" | "expired" | "converted";
export type Entitlement = {
  kind: "trial" | "subscription" | "one_time" | "none";
  validThrough: string | null;
};

export type Trial = {
  status: TrialStatus;
  started_at: string | null;
  ends_at: string | null;
  pricing_generation: PricingGeneration;
};

export type EntitlementStatus = "trial" | "active" | "ending" | "expired" | "refunded" | "none";

export type BillingAccount = {
  entitlement_status: EntitlementStatus;
  plan_kind: "monthly" | "annual" | "one_time" | "none";
  pricing_generation: PricingGeneration;
  shopify_charge_gid: string | null;
  current_period_end: string | null;
};

export type ShopifyBilling = {
  subscription: {
    id: string;
    name: string;
    currentPeriodEnd: string | null;
    interval: "EVERY_30_DAYS" | "ANNUAL" | null;
    amount: string | null;
    currency: string | null;
  } | null;
  oneTime: { id: string; createdAt: string; amount: string | null; currency: string | null } | null;
};

// La generazione è acquisita quando lo store diventa idoneo e non cambia più: `value` resta
// un'ipotesi interna e non viene mai assegnata automaticamente.
export function pricingGeneration(eligibleOn: string): PricingGeneration {
  return eligibleOn <= LAUNCH_WINDOW_END ? "launch" : "balanced";
}

// Il giorno di avvio è il giorno 1 e l'accesso vale fino alla fine del giorno 14 locale.
export function trialEnd(startedOn: string) {
  return addDays(startedOn, TRIAL_DAYS - 1);
}

// Giorni di prova ancora da consumare, oggi incluso: sono quelli che Shopify riceve come
// `trialDays`, così la sottoscrizione non riavvia la prova né la accorcia.
export function remainingTrialDays(trial: Trial | null, today: string) {
  if (trial?.status !== "active" || !trial.ends_at || trial.ends_at < today) return 0;
  return Math.round((Date.parse(trial.ends_at) - Date.parse(today)) / 86_400_000) + 1;
}

// Un formatter per fuso: costruirlo è costoso e ogni store ne usa sempre lo stesso.
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function localDate(timeZone: string, now = new Date()) {
  let formatter = dateFormatters.get(timeZone);

  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" });
    } catch {
      // Fuso sconosciuto: UTC è una scelta prudente, sposta la scadenza di poche ore.
      return now.toISOString().slice(0, 10);
    }
    dateFormatters.set(timeZone, formatter);
  }

  return formatter.format(now);
}

// Il diritto pagato prevale sulla prova: chi sottoscrive durante la prova non perde i giorni
// residui, perché Shopify li riceve come `trialDays` della sottoscrizione.
export function entitlementFor(
  trial: Trial | null,
  today: string,
  account?: BillingAccount | null,
): Entitlement {
  if (account?.plan_kind === "one_time" && account.entitlement_status === "active") {
    return { kind: "one_time", validThrough: null };
  }
  if (
    (account?.entitlement_status === "active" || account?.entitlement_status === "ending") &&
    account.current_period_end &&
    account.current_period_end >= today
  ) {
    return { kind: "subscription", validThrough: account.current_period_end };
  }
  if (trial?.status === "active" && trial.ends_at && trial.ends_at >= today) {
    return { kind: "trial", validThrough: trial.ends_at };
  }
  return { kind: "none", validThrough: null };
}

// Uno store non idoneo non consuma la prova: la riga nasce solo quando lo store è italiano.
export async function syncTrial(
  db: D1Database,
  shopDomain: string,
  { eligible, today }: { eligible: boolean; today: string },
): Promise<Trial | null> {
  const now = new Date().toISOString();
  let trial = await readTrial(db, shopDomain);

  if (!trial && eligible) {
    // Una prova già fruita resta nel registro anche dopo la cancellazione dei dati: la
    // reinstallazione la ritrova esaurita invece di ottenerne una nuova.
    const consumed = await db
      .prepare("SELECT trial_ends_at, pricing_generation FROM trial_ledger WHERE shop_hash = ?")
      .bind(await sha256Hex(shopDomain))
      .first<{ trial_ends_at: string | null; pricing_generation: PricingGeneration }>();

    await db
      .prepare(
        `INSERT INTO trials (
           shop_id, status, eligible_at, started_at, ends_at, pricing_generation,
           created_at, updated_at
         )
         SELECT id, ?, ?, ?, ?, ?, ?, ? FROM shops WHERE shop_domain = ?
         ON CONFLICT(shop_id) DO NOTHING`,
      )
      .bind(
        consumed ? "expired" : "active",
        now,
        consumed ? null : now,
        consumed ? consumed.trial_ends_at : trialEnd(today),
        consumed ? consumed.pricing_generation : pricingGeneration(today),
        now,
        now,
        shopDomain,
      )
      .run();

    trial = await readTrial(db, shopDomain);

    if (trial?.status === "active") {
      await recordEvent(db, {
        shopDomain,
        name: "trial_started",
        class: "billing",
        metadata: { pricing_generation: trial.pricing_generation },
      });
    }
  }

  if (!trial) return null;
  if (trial.status !== "active" || !trial.ends_at || trial.ends_at >= today) return trial;

  const expired = await db
    .prepare(
      `UPDATE trials SET status = 'expired', updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?) AND status = 'active'
       RETURNING shop_id`,
    )
    .bind(now, shopDomain)
    .first<{ shop_id: number }>();

  if (expired) {
    await recordEvent(db, {
      shopDomain,
      name: "trial_expired",
      class: "billing",
      metadata: { pricing_generation: trial.pricing_generation },
    });
  }

  return { ...trial, status: "expired" };
}

export const BILLING_QUERY = `#graphql
  query CfReadyBilling {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
        currentPeriodEnd
        lineItems {
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                interval
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
      oneTimePurchases(first: 10, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          name
          status
          test
          createdAt
          price {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

type BillingResponse = {
  data?: {
    currentAppInstallation: {
      activeSubscriptions: {
        id: string;
        name: string;
        status: string;
        test: boolean;
        currentPeriodEnd: string | null;
        lineItems: {
          plan: {
            pricingDetails: {
              interval?: "EVERY_30_DAYS" | "ANNUAL";
              price?: { amount: string; currencyCode: string };
            };
          };
        }[];
      }[];
      oneTimePurchases: {
        nodes: {
          id: string;
          status: string;
          test: boolean;
          createdAt: string;
          price: { amount: string; currencyCode: string } | null;
        }[];
      };
    };
  };
  errors?: { message: string }[];
};

// Shopify è la fonte autorevole: lo stato commerciale si legge sempre da qui, mai dal
// ritorno di un redirect di approvazione. Gli addebiti della modalità sbagliata vengono
// ignorati, altrimenti un addebito di prova concederebbe il diritto in Production.
export async function readBilling(
  admin: { graphql: (query: string) => Promise<Response> },
  isTest: boolean,
): Promise<ShopifyBilling> {
  const response = await admin.graphql(BILLING_QUERY);
  const body = (await response.json()) as BillingResponse;
  if (!body.data || body.errors?.length) {
    throw new Response("Lettura billing Shopify non riuscita", { status: 502 });
  }

  const subscription = body.data.currentAppInstallation.activeSubscriptions.find(
    (candidate) => candidate.test === isTest,
  );
  const pricing = subscription?.lineItems[0]?.plan.pricingDetails;
  const oneTime = body.data.currentAppInstallation.oneTimePurchases.nodes.find(
    (purchase) => purchase.status === "ACTIVE" && purchase.test === isTest,
  );

  return {
    subscription: subscription
      ? {
          id: subscription.id,
          name: subscription.name,
          currentPeriodEnd: subscription.currentPeriodEnd,
          interval: pricing?.interval ?? null,
          amount: pricing?.price?.amount ?? null,
          currency: pricing?.price?.currencyCode ?? null,
        }
      : null,
    oneTime: oneTime
      ? {
          id: oneTime.id,
          createdAt: oneTime.createdAt,
          amount: oneTime.price?.amount ?? null,
          currency: oneTime.price?.currencyCode ?? null,
        }
      : null,
  };
}

const CREATE_SUBSCRIPTION = `#graphql
  mutation CfReadySubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $trialDays: Int
    $test: Boolean
    $replacementBehavior: AppSubscriptionReplacementBehavior
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      trialDays: $trialDays
      test: $test
      replacementBehavior: $replacementBehavior
      lineItems: $lineItems
    ) {
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

const CREATE_ONE_TIME = `#graphql
  mutation CfReadyOneTimeCreate($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean) {
    appPurchaseOneTimeCreate(name: $name, price: $price, returnUrl: $returnUrl, test: $test) {
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

// L'addebito si crea qui e si restituisce l'URL di conferma, che il client apre a livello
// superiore: il redirect gestito dalla libreria non sopravvive a una richiesta fetch dentro
// l'iframe embedded e faceva fallire l'intera pagina.
export async function createCharge(
  admin: {
    graphql: (
      query: string,
      options?: { variables?: Record<string, unknown> },
    ) => Promise<Response>;
  },
  charge: {
    name: string;
    amount: number;
    currency: string;
    interval: "EVERY_30_DAYS" | "ANNUAL" | null;
    trialDays: number;
    test: boolean;
    returnUrl: string;
  },
) {
  const oneTime = charge.interval === null;
  const response = await admin.graphql(oneTime ? CREATE_ONE_TIME : CREATE_SUBSCRIPTION, {
    variables: oneTime
      ? {
          name: charge.name,
          price: { amount: charge.amount, currencyCode: charge.currency },
          returnUrl: charge.returnUrl,
          test: charge.test,
        }
      : {
          name: charge.name,
          returnUrl: charge.returnUrl,
          trialDays: charge.trialDays,
          test: charge.test,
          // I cambi fra mensile e annuale usano il comportamento nativo Shopify.
          replacementBehavior: "STANDARD",
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: { amount: charge.amount, currencyCode: charge.currency },
                  interval: charge.interval,
                },
              },
            },
          ],
        },
  });

  const body = (await response.json()) as {
    data?: Record<
      string,
      { confirmationUrl?: string; userErrors: { message: string }[] } | undefined
    >;
    errors?: { message: string }[];
  };
  const result = body.data?.[oneTime ? "appPurchaseOneTimeCreate" : "appSubscriptionCreate"];

  if (body.errors?.length || !result || result.userErrors.length || !result.confirmationUrl) {
    // Il messaggio arriva da Shopify e non contiene dati del merchant: senza, un rifiuto
    // dell'addebito resta indistinguibile da un guasto di rete.
    console.error(
      JSON.stringify({
        event: "charge_create_failed",
        class: "error",
        shopify: [...(body.errors ?? []), ...(result?.userErrors ?? [])]
          .map(({ message }) => message)
          .slice(0, 3),
      }),
    );
    return { confirmationUrl: null, error: "charge_create_failed" };
  }
  return { confirmationUrl: result.confirmationUrl, error: null };
}

// Al ritorno dall'approvazione il merchant deve ritrovarsi dentro l'admin: senza `shop` e
// `host` atterra sul Worker nudo, fuori da Shopify.
export function returnUrlFor(request: Request, shopDomain: string) {
  const incoming = new URL(request.url).searchParams;
  const target = new URL("/app", APP_URL);
  target.searchParams.set("shop", incoming.get("shop") ?? shopDomain);
  const host = incoming.get("host");
  if (host) target.searchParams.set("host", host);
  return target.toString();
}

export const CANCEL_SUBSCRIPTION = `#graphql
  mutation CfReadySubscriptionCancel($id: ID!, $prorate: Boolean!) {
    appSubscriptionCancel(id: $id, prorate: $prorate) {
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// La proratazione è nativa Shopify e serve solo al passaggio a una tantum: la cancellazione
// ordinaria non ne ha, l'accesso resta fino a fine periodo già pagato.
export async function cancelSubscription(
  admin: {
    graphql: (
      query: string,
      options?: { variables?: Record<string, unknown> },
    ) => Promise<Response>;
  },
  id: string,
  { prorate }: { prorate: boolean },
) {
  const response = await admin.graphql(CANCEL_SUBSCRIPTION, { variables: { id, prorate } });
  const body = (await response.json()) as {
    data?: { appSubscriptionCancel?: { userErrors: { message: string }[] } };
    errors?: { message: string }[];
  };
  const userErrors = body.data?.appSubscriptionCancel?.userErrors;

  if (body.errors?.length || !userErrors) return "subscription_cancel_failed";
  return userErrors.length ? "subscription_cancel_failed" : null;
}

// Credito informativo sul solo ciclo corrente: niente cumulo storico, niente giorni di prova.
// Shopify resta la fonte dell'importo effettivo, questa è una stima da mostrare.
export function proratedCredit({
  amount,
  interval,
  periodEnd,
  today,
}: {
  amount: string | null;
  interval: "EVERY_30_DAYS" | "ANNUAL" | null;
  periodEnd: string | null;
  today: string;
}) {
  if (!amount || !interval || !periodEnd) return null;

  const cycleDays = interval === "ANNUAL" ? 365 : 30;
  const remaining = Math.round((Date.parse(periodEnd) - Date.parse(today)) / 86_400_000);
  if (remaining <= 0) return 0;

  return Math.round(Number(amount) * Math.min(remaining, cycleDays) * 100) / cycleDays / 100;
}

// Normalizza lo stato Shopify in D1. Una sottoscrizione cancellata sparisce subito dalle
// attive, ma la cancellazione ordinaria lascia l'accesso fino a fine periodo: quel periodo
// vive qui come stato `ending`, non come diritto inventato.
export async function syncBillingAccount(
  db: D1Database,
  shopDomain: string,
  billing: ShopifyBilling,
  {
    today,
    timeZone,
    pricingGeneration,
  }: { today: string; timeZone: string; pricingGeneration: PricingGeneration },
): Promise<BillingAccount> {
  const stored = await readBillingAccount(db, shopDomain);

  const next = nextAccount(stored, billing, { today, timeZone, pricingGeneration });
  const now = new Date().toISOString();
  const oneTimePurchasedAt = billing.oneTime ? billing.oneTime.createdAt : null;

  await db
    .prepare(
      `INSERT INTO billing_accounts (
         shop_id, entitlement_status, plan_kind, pricing_generation, shopify_charge_gid,
         current_period_start, current_period_end, one_time_purchased_at, last_reconciled_at,
         created_at, updated_at
       )
       SELECT id, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ? FROM shops WHERE shop_domain = ?
       ON CONFLICT(shop_id) DO UPDATE SET
         entitlement_status = excluded.entitlement_status,
         plan_kind = excluded.plan_kind,
         pricing_generation = excluded.pricing_generation,
         shopify_charge_gid = excluded.shopify_charge_gid,
         current_period_end = excluded.current_period_end,
         one_time_purchased_at = COALESCE(excluded.one_time_purchased_at, billing_accounts.one_time_purchased_at),
         last_reconciled_at = excluded.last_reconciled_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      next.entitlement_status,
      next.plan_kind,
      next.pricing_generation,
      next.shopify_charge_gid,
      next.current_period_end,
      oneTimePurchasedAt,
      now,
      now,
      now,
      shopDomain,
    )
    .run();

  const changed =
    next.entitlement_status !== stored?.entitlement_status ||
    next.shopify_charge_gid !== stored?.shopify_charge_gid;

  if (changed && next.shopify_charge_gid) {
    await recordBillingEvent(db, shopDomain, {
      gid: next.shopify_charge_gid,
      type: next.entitlement_status,
      planKind: next.plan_kind,
      amount: billing.subscription?.amount ?? billing.oneTime?.amount ?? null,
      currency: billing.subscription?.currency ?? billing.oneTime?.currency ?? null,
      periodEnd: next.current_period_end,
      occurredAt: now,
    });
  }

  return next;
}

function nextAccount(
  stored: BillingAccount | null,
  billing: ShopifyBilling,
  {
    today,
    timeZone,
    pricingGeneration,
  }: { today: string; timeZone: string; pricingGeneration: PricingGeneration },
): BillingAccount {
  const generation = stored?.pricing_generation ?? pricingGeneration;

  if (billing.oneTime) {
    return {
      entitlement_status: "active",
      plan_kind: "one_time",
      pricing_generation: generation,
      shopify_charge_gid: billing.oneTime.id,
      current_period_end: null,
    };
  }

  if (billing.subscription) {
    return {
      entitlement_status: "active",
      plan_kind: billing.subscription.interval === "ANNUAL" ? "annual" : "monthly",
      pricing_generation: generation,
      shopify_charge_gid: billing.subscription.id,
      current_period_end: billing.subscription.currentPeriodEnd
        ? localDate(timeZone, new Date(billing.subscription.currentPeriodEnd))
        : null,
    };
  }

  // Un acquisto una tantum non scade: se sparisce dagli attivi è stato rimborsato per intero.
  // Un rimborso parziale non cambia lo stato Shopify e quindi conserva il diritto.
  if (stored?.plan_kind === "one_time" && stored.entitlement_status === "active") {
    return { ...stored, entitlement_status: "refunded" };
  }

  const inGracePeriod =
    (stored?.entitlement_status === "active" || stored?.entitlement_status === "ending") &&
    stored.plan_kind !== "one_time" &&
    stored.current_period_end !== null &&
    stored.current_period_end >= today;

  if (inGracePeriod) {
    return { ...stored, entitlement_status: "ending" };
  }

  return {
    entitlement_status: stored && stored.entitlement_status !== "none" ? "expired" : "none",
    plan_kind: "none",
    pricing_generation: generation,
    shopify_charge_gid: stored?.shopify_charge_gid ?? null,
    current_period_end: stored?.current_period_end ?? null,
  };
}

// Registro append-only: l'indice univoco su risorsa e tipo rende innocuo ogni retry.
async function recordBillingEvent(
  db: D1Database,
  shopDomain: string,
  event: {
    gid: string;
    type: string;
    planKind: string;
    amount: string | null;
    currency: string | null;
    periodEnd: string | null;
    occurredAt: string;
  },
) {
  await db
    .prepare(
      `INSERT INTO billing_events (
         shop_id, shopify_resource_gid, event_type, status, amount_minor, currency,
         period_start, period_end, occurred_at, created_at
       )
       SELECT id, ?, ?, ?, ?, ?, NULL, ?, ?, ? FROM shops WHERE shop_domain = ?
       ON CONFLICT (shopify_resource_gid, event_type) DO NOTHING`,
    )
    .bind(
      event.gid,
      event.type,
      event.planKind,
      event.amount === null ? null : Math.round(Number(event.amount) * 100),
      event.currency,
      event.periodEnd,
      event.occurredAt,
      event.occurredAt,
      shopDomain,
    )
    .run();
}

// Scritto prima della cancellazione dei dati: conserva solo un identificatore non reversibile,
// la scadenza della prova e la generazione acquisita, come previsto dalla retention.
export async function recordTrialLedger(db: D1Database, shopDomain: string) {
  await db
    .prepare(
      `INSERT INTO trial_ledger (shop_hash, trial_ends_at, pricing_generation, recorded_at)
       SELECT ?, t.ends_at, t.pricing_generation, ?
       FROM trials t JOIN shops s ON s.id = t.shop_id
       WHERE s.shop_domain = ?
       ON CONFLICT(shop_hash) DO NOTHING`,
    )
    .bind(await sha256Hex(shopDomain), new Date().toISOString(), shopDomain)
    .run();
}

// I giorni di prova residui sono rinunciati con l'acquisto: la prova risulta convertita,
// non scaduta, e non produce più eventi di scadenza.
export async function markTrialConverted(db: D1Database, shopDomain: string) {
  await db
    .prepare(
      `UPDATE trials SET status = 'converted', updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?) AND status = 'active'`,
    )
    .bind(new Date().toISOString(), shopDomain)
    .run();
}

// Cache operativa: serve anche quando Shopify non risponde, per non perdere lo stato noto.
export function readBillingAccount(db: D1Database, shopDomain: string) {
  return db
    .prepare(
      `SELECT b.entitlement_status, b.plan_kind, b.pricing_generation, b.shopify_charge_gid,
              b.current_period_end
       FROM billing_accounts b JOIN shops s ON s.id = b.shop_id
       WHERE s.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<BillingAccount>();
}

function readTrial(db: D1Database, shopDomain: string) {
  return db
    .prepare(
      `SELECT t.status, t.started_at, t.ends_at, t.pricing_generation
       FROM trials t JOIN shops s ON s.id = t.shop_id
       WHERE s.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<Trial>();
}

function addDays(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
