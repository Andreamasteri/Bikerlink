/**
 * Quota guard — Mapbox Directions
 *
 * Traccia il numero di richieste mensili a Mapbox in app_settings.
 * Chiave: mapbox_request_count_month
 * Soglia warning: 80 000 richieste (configurabile via app_settings)
 * Limite hard: 100 000 richieste/mese (piano gratuito Mapbox)
 * Reset: 1° del mese alle 00:01 Europe/Rome (cron schedulato all'avvio)
 */

import { storage } from "../../storage";
import { withJobGate } from "../../ai/coordinator/gated-job";

export const MAPBOX_QUOTA_LIMIT = 100_000;
export const MAPBOX_DEFAULT_WARNING = 80_000;

const QUOTA_KEY = "mapbox_request_count_month";
const WARNING_KEY = "mapbox_quota_warning_threshold";

export interface QuotaStatus {
  ok: boolean;
  used: number;
  limit: number;
  percent: number;
  warning_threshold: number;
  resets_at: string;
}

/**
 * Calcola il timestamp UTC del prossimo reset: 1° del mese alle 00:01 Europe/Rome.
 * Gestisce correttamente CET (UTC+1) e CEST (UTC+2) tramite Intl.
 */
function nextResetDate(): string {
  const now = new Date();

  // Ottieni mese e anno correnti in fuso Europe/Rome
  const romeNow = now.toLocaleString("sv-SE", { timeZone: "Europe/Rome" }).split(" ")[0];
  const [romeYear, romeMonth] = romeNow.split("-").map(Number);

  const nextMonth = romeMonth === 12 ? 1 : romeMonth + 1;
  const nextYear = romeMonth === 12 ? romeYear + 1 : romeYear;

  const pad = (n: number) => String(n).padStart(2, "0");
  const dayPfx = `${nextYear}-${pad(nextMonth)}-01`;

  // Riferimento: mezzogiorno UTC sul 1° del mese (lontano da transizioni DST)
  const refUtc = new Date(`${dayPfx}T12:00:00Z`);
  // Orario Rome per quel riferimento UTC
  const refRomeStr = refUtc.toLocaleString("sv-SE", { timeZone: "Europe/Rome" }).replace(" ", "T") + "Z";
  // Offset Rome rispetto a UTC (ms): quanto Rome è avanti
  const romeOffsetMs = new Date(refRomeStr).getTime() - refUtc.getTime();

  // 00:01:00 Rome = 00:01:00 UTC − offset
  const resetBase = new Date(`${dayPfx}T00:01:00Z`);
  return new Date(resetBase.getTime() - romeOffsetMs).toISOString();
}

/**
 * Legge il contatore corrente e determina se la quota è disponibile.
 */
export async function checkQuota(): Promise<QuotaStatus> {
  const [countSetting, warnSetting] = await Promise.all([
    storage.getAppSetting(QUOTA_KEY),
    storage.getAppSetting(WARNING_KEY),
  ]);

  const used = parseInt(countSetting?.value ?? "0", 10) || 0;
  const warning_threshold = parseInt(warnSetting?.value ?? String(MAPBOX_DEFAULT_WARNING), 10)
    || MAPBOX_DEFAULT_WARNING;

  const percent = Math.round((used / MAPBOX_QUOTA_LIMIT) * 100);

  if (used >= warning_threshold && used < MAPBOX_QUOTA_LIMIT) {
    console.warn(`[Mapbox] ⚠ Quota warning: ${used}/${MAPBOX_QUOTA_LIMIT} richieste (${percent}%)`);
  }

  return {
    ok: used < MAPBOX_QUOTA_LIMIT,
    used,
    limit: MAPBOX_QUOTA_LIMIT,
    percent,
    warning_threshold,
    resets_at: nextResetDate(),
  };
}

/**
 * Incrementa il contatore mensile di 1.
 */
export async function incrementQuota(): Promise<void> {
  const current = await storage.getAppSetting(QUOTA_KEY);
  const used = parseInt(current?.value ?? "0", 10) || 0;
  await storage.upsertAppSetting(QUOTA_KEY, String(used + 1));
}

/**
 * Azzera il contatore mensile (chiamato dal cron il 1° del mese).
 */
async function resetQuota(): Promise<void> {
  await storage.upsertAppSetting(QUOTA_KEY, "0");
  console.log("[Mapbox] Quota mensile azzerata (reset cron)");
}

/**
 * setTimeout sicuro per delay > 2^31-1 ms (limite Node.js 32-bit int).
 * Suddivide il delay in chunk da MAX_SAFE_TIMEOUT_MS per evitare overflow.
 */
const MAX_SAFE_TIMEOUT_MS = 2_000_000_000; // ~23 giorni, sotto il limite 32-bit

function safeSetTimeout(callback: () => void, delayMs: number): void {
  if (delayMs > MAX_SAFE_TIMEOUT_MS) {
    setTimeout(() => safeSetTimeout(callback, delayMs - MAX_SAFE_TIMEOUT_MS), MAX_SAFE_TIMEOUT_MS);
  } else {
    setTimeout(callback, Math.max(0, delayMs));
  }
}

/**
 * Schedula il reset automatico del contatore il 1° di ogni mese alle 00:01 Europe/Rome.
 * Deve essere chiamato da server/index.ts all'avvio.
 */
export function scheduleMonthlyReset(): void {
  function msUntilNextReset(): number {
    return Math.max(0, new Date(nextResetDate()).getTime() - Date.now());
  }

  // Task #9 — gate SOLO sul reset vero e proprio; scheduleNext() resta fuori
  // dal gate (stesso pattern di map-matching-job.ts): se il ri-arm vivesse
  // dentro la funzione gated, un singolo skip fermerebbe il loop per sempre.
  const gatedReset = withJobGate("mapbox-quota-reset", async () => {
    await resetQuota().catch((e) => console.error("[Mapbox] Errore reset quota:", e));
  });

  async function fireAndReschedule() {
    await gatedReset();
    scheduleNext();
  }

  function scheduleNext() {
    const delay = msUntilNextReset();
    const days = Math.round(delay / 86_400_000);
    console.log(`[Mapbox] Quota reset schedulato tra ~${days} giorni (${nextResetDate()})`);

    safeSetTimeout(() => { void fireAndReschedule(); }, delay);
  }

  scheduleNext();
}
