import { saveOneTimeOffer } from "../billing/repository.server";
import { noticeMessage } from "./presentation-format";
import { findShops } from "./queries.server";

const TITLE = "Pagamento unico";
const USAGE =
  "Usa /lifetime dominio.myshopify.com 99,90 oppure /lifetime dominio.myshopify.com off.";
const MAX_AMOUNT_MINOR = 1_000_000;
const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

// "99,90", "99.90" e "99" diventano centesimi; "off" revoca l'offerta.
function parseOfferAmount(text: string): number | null | undefined {
  if (text.toLowerCase() === "off") return null;
  const match = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(text);
  if (!match) return undefined;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
  return minor > 0 && minor <= MAX_AMOUNT_MINOR ? minor : undefined;
}

// D-221: l'offerta vale solo per il dominio esatto, mai per una corrispondenza parziale.
export async function assignOneTimeOffer(db: D1Database, argument: string | undefined, now: Date) {
  const [domain, amountText, ...rest] = (argument ?? "").trim().toLowerCase().split(/\s+/);
  const amountMinor = amountText ? parseOfferAmount(amountText) : undefined;
  if (!domain || amountMinor === undefined || rest.length) return noticeMessage(TITLE, USAGE);

  const shop = (await findShops(db, domain)).find((row) => row.shop_domain === domain);
  if (!shop) return noticeMessage(TITLE, "Store non trovato: serve il dominio myshopify esatto.");

  const changed = await saveOneTimeOffer(db, shop.id, amountMinor, now.toISOString());
  const name = shop.display_name ?? shop.shop_domain;
  if (amountMinor === null) {
    return noticeMessage(
      TITLE,
      changed ? `Offerta revocata per ${name}.` : `${name} non aveva un'offerta attiva.`,
    );
  }
  return noticeMessage(
    TITLE,
    `Offerta di ${EURO.format(amountMinor / 100)} assegnata a ${name}. Il merchant la vede nella pagina piani dell'app.`,
  );
}
