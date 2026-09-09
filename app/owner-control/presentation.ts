import type { TelegramInlineKeyboard, TelegramRichMessage } from "../telegram/client.server";
import { callbackData, type OwnerControlAction, type ShopsFilter } from "./model";
import { SHOPS_PAGE_SIZE, type ShopRow } from "./queries.server";

type Row = [string, string];
type Section = { title: string; rows: Row[] };
export type OwnerControlMessage = {
  richMessage: TelegramRichMessage;
  replyMarkup?: TelegramInlineKeyboard;
};

const DATE = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});
const MONEY = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function dashboardMessage(
  data: Record<string, number | string | null | undefined>,
  growth?: { days7: Record<string, number>; days28: Record<string, number>; cachedAt: string },
  environment = "Production",
): OwnerControlMessage {
  return panel(
    `CF Ready · ${environment}`,
    [
      section("🏪 Store", [
        ["Attivi", value(data.active_shops)],
        ["Onboarding completato", value(data.onboarding_completed)],
        ["Validation attive", value(data.validation_active)],
        ["Con errore aperto", value(data.shops_with_error)],
      ]),
      section("💳 Commerciale", [
        ["Trial attivi", value(data.trials_active)],
        ["Mensili", value(data.monthly)],
        ["Annuali", value(data.annual)],
        ["Pagamento unico", value(data.one_time)],
        ["Omaggio", value(data.complimentary)],
        ["In scadenza", value(data.ending)],
      ]),
      section("📈 Growth", growthRows(growth)),
      section("⚙️ Operatività", [
        ["Errori · 7 gg", value(data.errors_7d)],
        ["Webhook falliti", value(data.failed_webhooks)],
        ["Notifiche fallite", value(data.failed_notifications)],
        ["Partner sync", formatDate(data.partner_synced_at)],
      ]),
    ],
    navigation(true),
    growth ? `Growth aggiornato: ${formatDate(growth.cachedAt)}` : "Growth non disponibile",
  );
}

export function shopsMessage(
  data: { shops: ShopRow[]; count: number; page: number },
  filter: ShopsFilter,
): OwnerControlMessage {
  const rows: Row[] = data.shops.map((shop) => [shopName(shop), shopSummary(shop)]);
  if (!rows.length) rows.push(["Risultato", "Nessuno store"]);
  return panel(
    `Store · ${filterLabel(filter)}`,
    [section(`🏪 ${data.count} store`, rows)],
    pagination(
      "shops",
      data.page,
      data.count,
      { filter },
      data.shops.map((shop) => [
        button(`Apri · ${shopName(shop)}`, { view: "shop", shopId: shop.id }),
      ]),
    ),
  );
}

export function shopMessage(
  shop: ShopRow,
  activity: Array<{ event_name: string; occurred_at: string }> = [],
): OwnerControlMessage {
  return panel(
    "Dettaglio store",
    [
      section("🏪 Store", [
        ["Nome", shop.display_name ?? "—"],
        ["Dominio", shop.shop_domain],
        ["Installazione", label(shop.installation_status)],
        ["Installato", formatDate(shop.installed_at)],
        ["Paese", shop.country_code ?? "—"],
      ]),
      section("⚙️ Operatività", [
        ["Onboarding", label(shop.onboarding_status)],
        ["Validation", shop.validation_enabled ? "Attiva" : "Non attiva"],
        ["Ultimo sync", formatDate(shop.last_sync_at)],
        ["Errore aperto", shop.last_error_code ?? "Nessuno"],
        ["Schema config", value(shop.config_schema_version)],
        ["Revisione", value(shop.validation_state_revision)],
        ["Hash config", shortHash(shop.config_hash)],
      ]),
      section("💳 Commerciale", [
        ["Diritto", entitlement(shop)],
        ["Piano", label(shop.plan_kind)],
        ["Trial", label(shop.trial_status)],
        ["Scadenza", formatDate(shop.current_period_end ?? shop.trial_ends_at)],
      ]),
      ...(activity.length
        ? [
            section(
              "🕒 Attività recente",
              activity.map((event) => [label(event.event_name), formatDate(event.occurred_at)]),
            ),
          ]
        : []),
    ],
    keyboard([[button("‹ Store", { view: "shops", filter: "all", page: 0 })]]),
  );
}

export function shopMatchesMessage(shops: ShopRow[]): OwnerControlMessage {
  return panel(
    "Scegli uno store",
    [
      section(
        "Risultati",
        shops.map((shop) => [shopName(shop), shop.shop_domain]),
      ),
    ],
    keyboard(shops.map((shop) => [button(shopName(shop), { view: "shop", shopId: shop.id })])),
  );
}

export function growthMessage(data: {
  days7: Record<string, number>;
  days28: Record<string, number>;
  cachedAt: string;
}): OwnerControlMessage {
  return panel(
    "Growth",
    [
      section("📈 Ultimi 7 giorni", growthRows({ ...data, days28: data.days7 })),
      section("📊 Ultimi 28 giorni", relationshipRows(data.days28)),
    ],
    keyboard([
      [button("Aggiorna", { view: "growth", refresh: true })],
      [button("‹ Dashboard", { view: "dashboard" })],
    ]),
    `Fonte Shopify Partner · ${formatDate(data.cachedAt)}`,
  );
}

export function billingMessage(data: {
  rows: Array<{ entitlement_status: string; plan_kind: string; count: number }>;
  complimentary: number;
  trials: number;
  mrr: number;
  arr: number;
}): OwnerControlMessage {
  const count = (kind: string, status = "active") =>
    data.rows
      .filter((row) => row.plan_kind === kind && row.entitlement_status === status)
      .reduce((sum, row) => sum + row.count, 0);
  return panel(
    "Billing",
    [
      section("💳 Stato", [
        ["Trial attivi", String(data.trials)],
        ["Mensili attivi", String(count("monthly"))],
        ["Annuali attivi", String(count("annual"))],
        ["Pagamento unico", String(count("one_time"))],
        ["Omaggio", String(data.complimentary)],
        [
          "In scadenza",
          String(
            data.rows
              .filter((row) => row.entitlement_status === "ending")
              .reduce((sum, row) => sum + row.count, 0),
          ),
        ],
        [
          "Scaduti",
          String(
            data.rows
              .filter((row) => row.entitlement_status === "expired")
              .reduce((sum, row) => sum + row.count, 0),
          ),
        ],
        [
          "Rimborsati",
          String(
            data.rows
              .filter((row) => row.entitlement_status === "refunded")
              .reduce((sum, row) => sum + row.count, 0),
          ),
        ],
      ]),
      section("📐 Run-rate", [
        ["MRR run-rate", MONEY.format(data.mrr)],
        ["ARR run-rate", MONEY.format(data.arr)],
      ]),
    ],
    back(),
  );
}

export function trialsMessage(data: {
  trials: Array<{
    id: number;
    shop_domain: string;
    display_name: string | null;
    ends_at: string;
    validation_enabled: number;
  }>;
  count: number;
  endingSoon: number;
  page: number;
}): OwnerControlMessage {
  const rows: Row[] = data.trials.map((trial) => [
    trial.display_name ?? trial.shop_domain,
    `${daysRemaining(trial.ends_at)} gg · Validation ${trial.validation_enabled ? "attiva" : "non attiva"}`,
  ]);
  if (!rows.length) rows.push(["Trial", "Nessun trial attivo"]);
  return panel(
    "Trial",
    [section(`🧪 ${data.count} attivi · ${data.endingSoon} in scadenza`, rows)],
    pagination("trials", data.page, data.count),
  );
}

export function funnelMessage(rows: Array<Record<string, unknown>>): OwnerControlMessage {
  return panel(
    "Funnel di attivazione",
    [
      section(
        "Coorti · 28 giorni",
        rows
          .flatMap((row) => [
            [
              String(row.cohort),
              `${row.installed} installati · ${row.rules_observed} regole · ${row.trial_observed} trial · ${row.activation_observed} attivazioni`,
            ] as Row,
            ...(row.evidence === "small_cohort"
              ? [["Campione", "Piccolo, dato indicativo"] as Row]
              : []),
          ])
          .slice(-16),
      ),
    ],
    back(),
    "Milestone osservate; le assenze non provano abbandono né un ordine obbligatorio.",
  );
}

export function issuesMessage(
  data: Record<string, Record<string, unknown> | undefined>,
): OwnerControlMessage {
  const partnerAt = data.partner?.synced_at;
  const partnerStale =
    typeof partnerAt !== "string" || Date.now() - Date.parse(partnerAt) > 15 * 60 * 1000;
  return panel(
    "Problemi",
    [
      section("⚠️ Anomalie azionabili", [
        ["Store con errore", value(data.stores?.count)],
        ["Webhook falliti", value(data.webhooks?.failed)],
        ["Webhook stale", value(data.webhooks?.stale)],
        ["Notifiche fallite", value(data.notifications?.failed)],
        ["Notifiche stale", value(data.notifications?.stale)],
        ["Control Center fallito", value(data.control?.failed)],
        ["Partner sync", partnerStale ? "Stale" : "Regolare"],
        ["Regressioni performance", value(data.performance?.regressions)],
      ]),
    ],
    back(),
  );
}

export function errorsMessage(
  rows: Array<{ error_code: string; count: number; last_at: string }>,
): OwnerControlMessage {
  return panel(
    "Errori",
    [
      section(
        "Ultimi errori aggregati",
        rows.length
          ? rows.map((row) => [row.error_code, `${row.count} · ${formatDate(row.last_at)}`])
          : [["Stato", "Nessun errore"]],
      ),
    ],
    back(),
  );
}

export function notificationsMessage(
  data: Record<string, number | string | null> | null,
): OwnerControlMessage {
  return panel(
    "Pipeline Telegram outbound",
    [
      section("📨 Notifiche", [
        ["Pending", value(data?.pending)],
        ["Processing", value(data?.processing)],
        ["Inviate · 7 gg", value(data?.sent_7d)],
        ["Failed", value(data?.failed)],
        ["Pending più vecchia", formatDate(data?.oldest_pending_at)],
        ["Ultimo invio", formatDate(data?.last_sent_at)],
        ["Ultimo fallimento", formatDate(data?.last_failed_at)],
        ["Tentativi massimi", value(data?.max_failed_attempts)],
      ]),
    ],
    back(),
  );
}

export function activityMessage(
  rows: Array<{
    event_name: string;
    occurred_at: string;
    shop_domain: string | null;
    display_name: string | null;
  }>,
): OwnerControlMessage {
  return panel(
    "Attività recente",
    [
      section(
        "🕒 Eventi",
        rows.length
          ? rows.map((row) => [
              label(row.event_name),
              `${row.display_name ?? row.shop_domain ?? "Sistema"} · ${formatDate(row.occurred_at)}`,
            ])
          : [["Stato", "Nessuna attività"]],
      ),
    ],
    back(),
  );
}

export function healthMessage(
  data: Record<string, Record<string, unknown> | boolean | undefined>,
  webhook?: {
    configured: boolean;
    matchesExpectedUrl: boolean;
    pendingUpdateCount: number;
    lastErrorAt: string | null;
    checkedAt: string;
  },
): OwnerControlMessage {
  const partnerAt = (data.partner as Record<string, unknown> | undefined)?.synced_at;
  const partnerOk =
    typeof partnerAt === "string" && Date.now() - Date.parse(partnerAt) <= 15 * 60 * 1000;
  const notifications = data.notifications as Record<string, unknown> | undefined;
  const inbound = data.inbound as Record<string, unknown> | undefined;
  return panel(
    "Health",
    [
      section("🩺 Componenti osservabili", [
        ["Worker", "Operativo"],
        ["D1", data.d1 ? "OK" : "Errore"],
        ["Partner sync", partnerOk ? formatDate(partnerAt) : "Stale o assente"],
        ["Telegram inbound", formatDate(inbound?.last_processed_at)],
        ["Telegram inbound falliti", value(inbound?.failed)],
        [
          "Telegram webhook",
          webhook?.configured && webhook.matchesExpectedUrl
            ? `Attivo · ${webhook.pendingUpdateCount} pending`
            : webhook
              ? "Configurazione non corrispondente"
              : "Non verificato",
        ],
        ["Errore webhook Telegram", formatDate(webhook?.lastErrorAt)],
        ["Telegram outbound", formatDate(notifications?.last_sent_at)],
        ["Notifiche pending", value(notifications?.pending)],
        ["Notifiche processing", value(notifications?.processing)],
        ["Notifiche fallite", value(notifications?.failed)],
        ["Pending più vecchia", formatDate(notifications?.oldest_pending_at)],
        ["Ultimo fallimento", formatDate(notifications?.last_failed_at)],
        [
          "Webhook app falliti",
          value((data.webhooks as Record<string, unknown> | undefined)?.failed),
        ],
        ["Webhook app stale", value((data.webhooks as Record<string, unknown> | undefined)?.stale)],
      ]),
    ],
    keyboard([
      [button("Aggiorna", { view: "health", refresh: true })],
      [button("‹ Dashboard", { view: "dashboard" })],
    ]),
    webhook ? `Telegram verificato: ${formatDate(webhook.checkedAt)}` : undefined,
  );
}

export function performanceMessage(data: {
  groups: Array<{
    metric: string;
    app_version: string;
    app_route: string;
    sample_count: number;
    p75: number;
    status: string;
  }>;
  comparison: {
    previous_version: string;
    current_version: string;
    alerts: Array<{ route: string; metric: string; delta: number | null }>;
  } | null;
}): OwnerControlMessage {
  const rows = data.groups;
  const overall = rows.filter((row) => row.app_version === "all" && row.app_route === "all");
  const alerts = data.comparison?.alerts ?? [];
  return panel(
    "Performance",
    [
      section(
        "📊 p75 · 28 giorni",
        overall.length
          ? overall.map((row) => [
              row.metric,
              `${formatMetric(row.metric, row.p75)} · n=${row.sample_count} · ${statusLabel(row.status)}`,
            ])
          : [["Campione", "Nessun dato"]],
      ),
      ...(alerts.length
        ? [
            section(
              "⚠️ Regressioni",
              alerts
                .slice(0, 8)
                .map((alert) => [
                  `${alert.route} · ${alert.metric}`,
                  formatDelta(alert.metric, alert.delta),
                ]),
            ),
          ]
        : []),
    ],
    back(),
    data.comparison
      ? `Confronto ${data.comparison.previous_version} → ${data.comparison.current_version}. Campioni insufficienti non generano regressioni.`
      : "Servono due versioni osservate e campioni sufficienti per classificare regressioni.",
  );
}

export function versionMessage(data: {
  appVersion: string;
  environment: string;
  workerId?: string;
  workerTag?: string;
  deployedAt?: string;
}): OwnerControlMessage {
  return panel(
    "Versione",
    [
      section("CF Ready", [
        ["App", data.appVersion],
        ["Ambiente", data.environment],
        ["Worker version", data.workerId ?? "Non disponibile"],
        ["Worker tag", data.workerTag ?? "—"],
        ["Deploy", formatDate(data.deployedAt)],
      ]),
    ],
    back(),
  );
}

export function helpMessage(): OwnerControlMessage {
  return panel(
    "Owner Control Center",
    [
      section("Comandi", [
        ["/dashboard", "Riepilogo e navigazione"],
        ["/shops [filtro]", "Store e paginazione"],
        ["/shop nome_o_dominio", "Diagnostica store"],
        ["/growth", "Eventi Partner 7/28 gg"],
        ["/billing · /trials", "Stato commerciale"],
        ["/funnel · /performance", "Report operativi"],
        ["/issues · /errors", "Anomalie tecniche"],
        ["/notifications · /activity", "Pipeline e attività"],
        ["/health · /version", "Runtime e deploy"],
      ]),
      section("Filtri store", [["Disponibili", "trial · paid · validation_off · issues"]]),
    ],
    back(),
    "Console privata read-only.",
  );
}

export function noticeMessage(title: string, text: string): OwnerControlMessage {
  return panel(title, [section("Informazione", [["Stato", text]])], back());
}

function panel(
  title: string,
  sections: Section[],
  replyMarkup?: TelegramInlineKeyboard,
  footer?: string,
): OwnerControlMessage {
  return {
    richMessage: {
      blocks: [
        { type: "heading", text: title, size: 2 },
        { type: "divider" },
        ...sections.map((item) => ({
          type: "table",
          caption: item.title,
          is_bordered: true,
          is_striped: true,
          is_compact: true,
          cells: item.rows.map(([name, current]) => [
            { text: { type: "bold", text: name }, is_header: true },
            { text: current },
          ]),
        })),
        ...(footer ? [{ type: "footer", text: footer }] : []),
        { type: "footer", text: `Aggiornato: ${formatDate(new Date().toISOString())}` },
      ],
      skip_entity_detection: true,
    },
    replyMarkup,
  };
}

function section(title: string, rows: Row[]): Section {
  return { title, rows };
}
function button(text: string, action: OwnerControlAction) {
  return { text, callback_data: callbackData(action) };
}
function keyboard(
  rows: Array<Array<{ text: string; callback_data: string }>>,
): TelegramInlineKeyboard {
  return { inline_keyboard: rows };
}
function back() {
  return keyboard([[button("‹ Dashboard", { view: "dashboard" })]]);
}
function navigation(refresh = false) {
  return keyboard([
    [button("Store", { view: "shops", filter: "all" }), button("Growth", { view: "growth" })],
    [button("Billing", { view: "billing" }), button("Funnel", { view: "funnel" })],
    [button("Problemi", { view: "issues" }), button("Health", { view: "health" })],
    [button("Performance", { view: "performance" }), button("Attività", { view: "activity" })],
    ...(refresh ? [[button("Aggiorna", { view: "dashboard", refresh: true })]] : []),
  ]);
}
function pagination(
  view: "shops" | "trials",
  page: number,
  count: number,
  extra: Pick<OwnerControlAction, "filter"> = {},
  itemRows: Array<Array<{ text: string; callback_data: string }>> = [],
) {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [...itemRows];
  const controls = [];
  if (page > 0) controls.push(button("‹", { view, page: page - 1, ...extra }));
  if ((page + 1) * SHOPS_PAGE_SIZE < count)
    controls.push(button("›", { view, page: page + 1, ...extra }));
  if (controls.length) rows.push(controls);
  rows.push([button("‹ Dashboard", { view: "dashboard" })]);
  return keyboard(rows);
}
function relationshipRows(counts: Record<string, number>): Row[] {
  return [
    ["Installazioni", value(counts.RELATIONSHIP_INSTALLED)],
    ["Riattivazioni", value(counts.RELATIONSHIP_REACTIVATED)],
    ["Disattivazioni", value(counts.RELATIONSHIP_DEACTIVATED)],
    ["Disinstallazioni", value(counts.RELATIONSHIP_UNINSTALLED)],
  ];
}
function growthRows(data?: {
  days7: Record<string, number>;
  days28: Record<string, number>;
}): Row[] {
  return data ? relationshipRows(data.days7) : [["Stato", "Non disponibile"]];
}
function value(input: unknown) {
  return input === null || input === undefined ? "—" : String(input);
}
function formatDate(input: unknown) {
  if (typeof input !== "string" || !Number.isFinite(Date.parse(input))) return "—";
  return DATE.format(new Date(input));
}
function shopName(shop: Pick<ShopRow, "display_name" | "shop_domain">) {
  return shop.display_name ?? shop.shop_domain;
}
function shopSummary(shop: ShopRow) {
  return `${shop.shop_domain} · ${label(shop.plan_kind ?? shop.trial_status)} · Validation ${shop.validation_enabled ? "attiva" : "non attiva"}${shop.last_error_code ? ` · ${shop.last_error_code}` : ""}`;
}
function filterLabel(filter: ShopsFilter) {
  return {
    all: "Tutti",
    trial: "Trial",
    paid: "Paganti",
    validation_off: "Validation non attiva",
    issues: "Con problemi",
  }[filter];
}
function label(input: unknown) {
  if (typeof input !== "string" || !input) return "—";
  return input.replaceAll("_", " ").replace(/^./, (char) => char.toLocaleUpperCase("it-IT"));
}
function entitlement(shop: ShopRow) {
  if (
    shop.complimentary_status === "active" &&
    !["active", "ending"].includes(shop.entitlement_status ?? "")
  )
    return "Omaggio";
  if (shop.entitlement_status === "active" || shop.entitlement_status === "ending")
    return label(shop.entitlement_status);
  if (shop.trial_status === "active") return "Trial";
  return "Nessuno";
}
function shortHash(hash: string | null) {
  return hash ? `${hash.slice(0, 12)}…` : "—";
}
function daysRemaining(date: string) {
  return Math.max(0, Math.ceil((Date.parse(`${date}T00:00:00.000Z`) - Date.now()) / 86_400_000));
}
function formatMetric(metric: string, value: number) {
  return metric === "CLS" ? value.toFixed(3) : `${Math.round(value)} ms`;
}
function formatDelta(metric: string, value: number | null) {
  return value === null ? "—" : `+${formatMetric(metric, value)}`;
}
function statusLabel(status: string) {
  return (
    { pass: "OK", fail: "Soglia superata", insufficient_samples: "Campione insufficiente" }[
      status
    ] ?? status
  );
}
