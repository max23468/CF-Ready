export const SHOPS_PAGE_SIZE = 8;

const COMMAND_CODES = {
  dashboard: "d",
  shops: "s",
  shop: "o",
  growth: "g",
  billing: "b",
  uninstalls: "u",
  trials: "t",
  funnel: "f",
  issues: "i",
  errors: "e",
  notifications: "n",
  activity: "a",
  health: "h",
  performance: "p",
  version: "v",
  help: "x",
  lifetime: "l",
  usage: "w",
} as const;

// Le viste di chiusura conversione esistono solo come pulsanti della scheda store (D-170).
const BUTTON_VIEW_CODES = {
  conversion_review: "c",
  conversion_close: "k",
  conversion_confirm: "j",
} as const;

type OwnerControlCommand = keyof typeof COMMAND_CODES;
type OwnerControlView = OwnerControlCommand | keyof typeof BUTTON_VIEW_CODES;

const OWNER_CONTROL_COMMANDS = Object.keys(COMMAND_CODES) as OwnerControlCommand[];

const VIEW_CODES: Record<OwnerControlView, string> = { ...COMMAND_CODES, ...BUTTON_VIEW_CODES };
const CODE_VIEWS = Object.fromEntries(
  Object.entries(VIEW_CODES).map(([view, code]) => [code, view]),
) as Record<string, OwnerControlView>;

export const SHOP_FILTERS = ["all", "trial", "paid", "validation_off", "issues"] as const;
export type ShopsFilter = (typeof SHOP_FILTERS)[number];

export type OwnerControlAction = {
  view: OwnerControlView;
  argument?: string;
  filter?: ShopsFilter;
  page?: number;
  shopId?: number;
  conversionId?: number;
  refresh?: boolean;
  copy?: boolean;
};

function isShopsFilter(value: string | undefined): value is ShopsFilter {
  return (SHOP_FILTERS as readonly (string | undefined)[]).includes(value);
}

export function parseCommand(text: string): OwnerControlAction | null {
  if (text.length > 160) return null;
  const match = /^\/([a-z]+)(?:\s+([^\s].*))?$/.exec(text.trim());
  const commands: readonly string[] = OWNER_CONTROL_COMMANDS;
  if (!match || !commands.includes(match[1])) return null;
  const view = match[1] as OwnerControlCommand;
  const argument = match[2]?.trim();
  if (view === "shops") {
    const filter = argument ?? "all";
    return isShopsFilter(filter) ? { view, filter, page: 0 } : null;
  }
  if (view === "shop") {
    return argument && argument.length <= 100 ? { view, argument } : { view };
  }
  if (view === "lifetime") return argument ? { view, argument } : { view };
  return argument ? null : { view };
}

export function callbackData(action: OwnerControlAction) {
  const parts = ["oc1", VIEW_CODES[action.view]];
  if (action.shopId !== undefined)
    parts.push(
      action.shopId.toString(36) +
        (action.view === "conversion_confirm" && action.conversionId !== undefined
          ? `~${action.conversionId.toString(36)}`
          : ""),
    );
  else if (action.filter) parts.push(action.filter);
  else parts.push("-");
  parts.push(String(action.page ?? 0));
  if (action.refresh) parts.push("r");
  else if (action.copy) parts.push("c");
  return parts.join(":");
}

export function copyTarget(action: OwnerControlAction): OwnerControlAction {
  return {
    view:
      action.view === "conversion_close" || action.view === "conversion_confirm"
        ? "shop"
        : action.view,
    ...(action.shopId !== undefined ? { shopId: action.shopId } : {}),
    ...(action.filter ? { filter: action.filter } : {}),
    page: action.page ?? 0,
  };
}

// Telegram limita callback_data a 64 byte.
export function parseCallback(data: string): OwnerControlAction | null {
  if (new TextEncoder().encode(data).byteLength > 64) return null;
  const [version, code, target, pageText, refresh, ...rest] = data.split(":");
  const view = CODE_VIEWS[code];
  const page = Number(pageText);
  const copy = refresh === "c" ? { copy: true } : {};
  if (
    version !== "oc1" ||
    !view ||
    rest.length ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page > 10_000 ||
    (refresh !== undefined && refresh !== "r" && refresh !== "c")
  ) {
    return null;
  }
  if (view === "conversion_confirm") {
    const match = /^([0-9a-z]+)~([0-9a-z]+)$/.exec(target ?? "");
    if (!match || refresh !== undefined) return null;
    const shopId = Number.parseInt(match[1], 36);
    const conversionId = Number.parseInt(match[2], 36);
    return [shopId, conversionId].every((id) => Number.isSafeInteger(id) && id > 0)
      ? { view, shopId, conversionId, page, refresh: false }
      : null;
  }
  if (view === "shop" || view === "conversion_review" || view === "conversion_close") {
    if (!target || !/^[0-9a-z]+$/.test(target)) return null;
    const shopId = Number.parseInt(target, 36);
    return Number.isSafeInteger(shopId) && shopId > 0
      ? { view, shopId, page, refresh: refresh === "r", ...copy }
      : null;
  }
  if (view === "shops") {
    if (!isShopsFilter(target)) return null;
    return { view, filter: target, page, refresh: refresh === "r", ...copy };
  }
  if (target !== "-") return null;
  return { view, page, refresh: refresh === "r", ...copy };
}
