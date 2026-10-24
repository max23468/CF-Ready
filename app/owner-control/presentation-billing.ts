import type { BillingStatusCategory } from "./model";
import type { EuroExchangeRate, RevenueReport } from "./revenue.server";
import type { PartnerUninstallEvent, UninstallHistory, UninstallReport } from "./uninstalls.server";
import {
  panel,
  section,
  keyboard,
  button,
  formatDate,
  percent,
  countLabel,
  type Row,
  type OwnerControlMessage,
} from "./presentation-format";

type RevenueView = (RevenueReport & { cachedAt: string }) | { unavailable: string };
const HYPERWALLET_CONVERSION_FEE = 0.005;
const MONEY = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function billingMessage(
  data: {
    status: Record<BillingStatusCategory | "total", number>;
    mrr: number;
    arr: number;
    netMrr: number;
    netArr: number;
    regulatoryUnknown: number;
    reconciliation: {
      paid: number;
      matched: number;
      awaiting: number;
      notDue: number;
      needsReview: number;
      checkedAt: string | null;
      refreshUnavailable?: string;
    };
    shopifyFees: {
      revenueShare: number;
      processing: number;
      regulatoryOperating: Readonly<Record<string, number>>;
    };
  },
  revenue?: RevenueView,
  uninstalls?: UninstallReport,
  exchangeRate?: EuroExchangeRate,
): OwnerControlMessage {
  const fees = data.shopifyFees;
  const status = data.status;
  const reconciliation = data.reconciliation;
  // MRR e ARR contano solo i piani ricorrenti attivi: chi è in scadenza o ha pagato una
  // volta resta fuori, e la riga lo dichiara perché i numeri tornino con lo stato.
  const excluded = parts([
    [status.ending, "in scadenza", "in scadenza"],
    [status.one_time, "pagamento unico", "pagamenti unici"],
  ]);
  return panel(
    "Billing",
    [
      section(`💳 Stato · ${countLabel(status.total, "installato", "installati")}`, [
        statusGroup("Paganti", [
          [status.monthly, "mensile", "mensili"],
          [status.annual, "annuale", "annuali"],
          [status.one_time, "unico", "unici"],
          [status.ending, "in scadenza", "in scadenza"],
        ]),
        statusGroup("In prova o omaggio", [
          [status.trial, "trial", "trial"],
          [status.complimentary, "omaggio", "omaggi"],
        ]),
        statusGroup("Senza piano", [
          [status.trial_expired, "prova scaduta", "prove scadute"],
          [status.trial_never, "prova mai avviata", "prove mai avviate"],
          [status.expired, "piano scaduto", "piani scaduti"],
          [status.refunded, "rimborsato", "rimborsati"],
        ]),
        ...(status.other ? [["⚠️ Da verificare", String(status.other)] as Row] : []),
        ...uninstallRows(uninstalls),
      ]),
      section("📐 Run-rate", [
        [
          "MRR",
          `${MONEY.format(data.mrr)} · netto ${MONEY.format(data.netMrr * (1 - HYPERWALLET_CONVERSION_FEE))}`,
        ],
        [
          "ARR",
          `${MONEY.format(data.arr)} · netto ${MONEY.format(data.netArr * (1 - HYPERWALLET_CONVERSION_FEE))}`,
        ],
        ...(excluded ? [["Esclusi", excluded] as Row] : []),
        [
          "Fee",
          [
            `revenue share ${percent(fees.revenueShare)}`,
            `elaborazione ${percent(fees.processing)}`,
            `Hyperwallet ${percent(HYPERWALLET_CONVERSION_FEE)} sul netto Shopify (cambio USD/EUR)`,
            ...Object.entries(fees.regulatoryOperating).map(
              ([country, rate]) => `regolamentare ${country} ${percent(rate)}`,
            ),
            ...(data.regulatoryUnknown
              ? [`regolamentare non nota per ${data.regulatoryUnknown} abbonamenti`]
              : []),
          ].join(" · "),
        ],
      ]),
      section("🔎 Riconciliazione", [
        ["Vendite abbinate", `${reconciliation.matched}/${reconciliation.paid}`],
        ["Non ancora dovute", String(reconciliation.notDue)],
        [
          warn("In attesa della transazione Shopify", reconciliation.awaiting),
          String(reconciliation.awaiting),
        ],
        [
          warn("Conversioni da verificare", reconciliation.needsReview),
          String(reconciliation.needsReview),
        ],
        ["Ultimo controllo", formatDate(reconciliation.checkedAt)],
        ...(reconciliation.refreshUnavailable
          ? [["⚠️ Aggiornamento", `Non riuscito (${reconciliation.refreshUnavailable})`] as Row]
          : []),
      ]),
      section("💰 Ricavi cumulati · Shopify Partner", revenueRows(revenue, exchangeRate)),
    ],
    keyboard([
      [button("Aggiorna", { view: "billing", refresh: true })],
      [
        button("Store paganti", { view: "shops", filter: "paid" }),
        button("Trial", { view: "trials" }),
      ],
      [button("Disinstallazioni", { view: "uninstalls" })],
      [button("‹ Dashboard", { view: "dashboard" })],
    ]),
    [
      ...(revenue && "cachedAt" in revenue
        ? [`Ricavi Partner ${formatDate(revenue.cachedAt)}`]
        : []),
      "Disinstallazioni: il maggiore fra Partner dal lancio e contatore locale, review separate",
      "Le transazioni Partner non provano incasso della fattura merchant né payout",
      "Netti stimati dopo la commissione Hyperwallet",
    ].join(" · "),
  );
}

type CountPart = [count: number, singular: string, plural: string];

function parts(items: CountPart[]) {
  return items
    .filter(([count]) => count > 0)
    .map(([count, singular, plural]) => countLabel(count, singular, plural))
    .join(" · ");
}
function statusGroup(name: string, items: CountPart[]): Row {
  const total = items.reduce((sum, [count]) => sum + count, 0);
  const detail = parts(items);
  return [name, detail ? `${total} · ${detail}` : String(total)];
}
function warn(name: string, count: number) {
  return count > 0 ? `⚠️ ${name}` : name;
}
// Merchant e review si combinano separatamente: per ciascuno vale il maggiore fra Partner e
// contatore locale, che parte più tardi ma non dipende dalla Partner API.
function uninstallRows(report?: UninstallReport): Row[] {
  if (!report) return [["Disinstallazioni", "Non disponibile"]];
  const local = report.local;
  const localMerchant = local ? local.total - local.review : 0;
  if ("unavailable" in report.partner) {
    return local
      ? [
          [
            "Disinstallazioni merchant",
            `${localMerchant} dal ${formatDate(local.startedAt)} · Partner non disponibile`,
          ],
          ["Disinstallazioni review", String(local.review)],
        ]
      : [["Disinstallazioni", `Non disponibile (${report.partner.unavailable})`]];
  }
  const partner = report.partner;
  return [
    [
      "Disinstallazioni merchant",
      [
        String(Math.max(partner.merchant.total, localMerchant)),
        countLabel(partner.merchant.stores, "store", "store"),
        `${partner.merchant.days28} negli ultimi 28 gg`,
      ].join(" · "),
    ],
    ["Disinstallazioni review", String(Math.max(partner.review, local?.review ?? 0))],
  ];
}

export function uninstallsMessage(
  partner: PartnerUninstallEvent[] | { unavailable: string },
  history: UninstallHistory,
): OwnerControlMessage {
  const merchants = Array.isArray(partner)
    ? partner.filter((event) => event.kind === "merchant")
    : [];
  const reviews = Array.isArray(partner) ? partner.filter((event) => event.kind === "review") : [];
  const status = history.merchant.status;
  return panel(
    "Disinstallazioni",
    [
      ...(Array.isArray(partner)
        ? [
            section(
              `🏪 Merchant · ${merchants.length}`,
              merchants.length
                ? merchants.slice(0, UNINSTALL_ROWS).map(uninstallRow)
                : [["Stato", "Nessuna disinstallazione"]],
            ),
            section(
              `🧪 Review e interni · ${reviews.length}`,
              reviews.length
                ? reviews.slice(0, UNINSTALL_ROWS).map(uninstallRow)
                : [["Stato", "Nessuna disinstallazione"]],
            ),
          ]
        : [
            section("🏪 Partner", [
              ["Stato", `Partner API non disponibile (${partner.unavailable})`],
            ]),
          ]),
      section(`📊 Storico anonimo · dal ${formatDate(history.startedAt)}`, [
        ["Merchant", String(history.merchant.total)],
        statusGroup("Paganti", [
          [status.monthly, "mensile", "mensili"],
          [status.annual, "annuale", "annuali"],
          [status.one_time, "unico", "unici"],
          [status.ending, "in scadenza", "in scadenza"],
        ]),
        statusGroup("In prova o omaggio", [
          [status.trial, "trial", "trial"],
          [status.complimentary, "omaggio", "omaggi"],
        ]),
        statusGroup("Senza piano", [
          [status.trial_expired, "prova scaduta", "prove scadute"],
          [status.trial_never, "prova mai avviata", "prove mai avviate"],
          [status.expired, "piano scaduto", "piani scaduti"],
          [status.refunded, "rimborsato", "rimborsati"],
          [status.other, "da verificare", "da verificare"],
        ]),
        [
          "Durata media",
          history.merchant.averageDays === null
            ? "—"
            : countLabel(history.merchant.averageDays, "giorno", "giorni"),
        ],
        ["Con Validation attiva", String(history.merchant.validationEnabled)],
        ["Con onboarding completato", String(history.merchant.onboardingCompleted)],
        ["Review e interni", String(history.review)],
      ]),
    ],
    keyboard([
      [button("Aggiorna", { view: "uninstalls" })],
      [button("‹ Billing", { view: "billing" }), button("‹ Dashboard", { view: "dashboard" })],
    ]),
    `Elenchi letti dal vivo da Shopify Partner, ultimi ${UNINSTALL_ROWS} per gruppo, non salvati · Review: nomi app-review, appstoretest, apdev, REDACTED, store interni e di sviluppo · Lo storico anonimo non contiene nomi né domini`,
  );
}

const UNINSTALL_ROWS = 25;
const FEEDBACK_LIMIT = 80;

function uninstallRow(event: PartnerUninstallEvent): Row {
  const feedback = [event.reason, event.description]
    .filter((value): value is string => value !== null)
    .join(": ");
  return [
    event.name ?? event.domain ?? "Store senza nome",
    [
      formatDate(event.occurredAt),
      event.domain ?? "dominio non disponibile",
      ...(feedback
        ? [
            feedback.length > FEEDBACK_LIMIT
              ? `${feedback.slice(0, FEEDBACK_LIMIT - 1)}…`
              : feedback,
          ]
        : []),
    ].join(" · "),
  ];
}

function revenueRows(revenue?: RevenueView, exchangeRate?: EuroExchangeRate): Row[] {
  if (!revenue || "unavailable" in revenue) {
    return [
      [
        "Stato",
        revenue?.unavailable === "partner_api_graphql_error"
          ? "Accesso rifiutato: serve il permesso View financials"
          : `Partner API non disponibile${revenue ? ` (${revenue.unavailable})` : ""}`,
      ],
    ];
  }
  if (!revenue.currency) return [["Transazioni", "Nessuna vendita registrata"]];
  const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: revenue.currency });
  const amount = (minor: number) => money.format(minor / 100);
  const netAmount = (minor: number) =>
    minor === 0
      ? MONEY.format(0)
      : revenue.currency === "USD"
        ? exchangeRate
          ? MONEY.format(
              Math.round((minor * (1 - HYPERWALLET_CONVERSION_FEE)) / exchangeRate.usdPerEuro) /
                100,
            )
          : "Non disponibile"
        : amount(minor);
  const netDescription = (minor: number) => {
    const formatted = netAmount(minor);
    return formatted === "Non disponibile" ? formatted : `${formatted} netti`;
  };
  return [
    ["Lordo", amount(revenue.totals.grossMinor)],
    ["Commissioni Shopify", amount(revenue.totals.grossMinor - revenue.totals.netMinor)],
    ["Netto", netAmount(revenue.totals.netMinor)],
    [
      "Abbonamenti",
      `${netDescription(revenue.subscriptions.netMinor)} · ${countLabel(revenue.subscriptions.count, "addebito", "addebiti")}`,
    ],
    [
      "Lifetime",
      `${netDescription(revenue.lifetime.netMinor)} · ${countLabel(revenue.lifetime.count, "acquisto", "acquisti")}`,
    ],
    [
      "Rimborsi e crediti",
      `${netAmount(revenue.adjustments.netMinor)} · ${countLabel(revenue.adjustments.count, "movimento", "movimenti")}`,
    ],
  ];
}
