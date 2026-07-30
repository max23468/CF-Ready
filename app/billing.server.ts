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

// La generazione è acquisita quando lo store diventa idoneo e non cambia più: `value` resta
// un'ipotesi interna e non viene mai assegnata automaticamente.
export function pricingGeneration(eligibleOn: string): PricingGeneration {
  return eligibleOn <= LAUNCH_WINDOW_END ? "launch" : "balanced";
}

// Il giorno di avvio è il giorno 1 e l'accesso vale fino alla fine del giorno 14 locale.
export function trialEnd(startedOn: string) {
  return addDays(startedOn, TRIAL_DAYS - 1);
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

export function entitlementFor(trial: Trial | null, today: string): Entitlement {
  if (trial?.status === "active" && trial.ends_at && trial.ends_at >= today) {
    return { kind: "trial", validThrough: trial.ends_at };
  }
  // ponytail: sottoscrizioni e una tantum entrano qui con i blocchi successivi di M5.
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
