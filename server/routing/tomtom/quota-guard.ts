/**
 * Quota guard — TomTom Routing API
 *
 * Traccia il numero di richieste giornaliere in app_settings.
 * Chiave: tomtom_request_count_day
 * Soglia warning: 2.000 richieste/giorno
 * Limite hard: 2.500 richieste/giorno (piano gratuito TomTom)
 * Reset: ogni giorno alle 00:01 UTC (cron schedulato all'avvio)
 */

import { storage } from "../../storage";

export const TOMTOM_QUOTA_LIMIT = 2_500;
export const TOMTOM_DEFAULT_WARNING = 2_000;

const QUOTA_KEY = "tomtom_request_count_day";

export interface TomTomQuotaStatus {
  ok: boolean;
  used: number;
  limit: number;
  percent: number;
  resets_at: string;
}

function nextDailyReset(): string {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 1, 0));
  return tomorrow.toISOString();
}

export async function checkQuota(): Promise<TomTomQuotaStatus> {
  const countSetting = await storage.getAppSetting(QUOTA_KEY);
  const used = parseInt(countSetting?.value ?? "0", 10) || 0;
  const percent = Math.round((used / TOMTOM_QUOTA_LIMIT) * 100);

  if (used >= TOMTOM_DEFAULT_WARNING && used < TOMTOM_QUOTA_LIMIT) {
    console.warn(`[TomTom] ⚠ Quota warning: ${used}/${TOMTOM_QUOTA_LIMIT} richieste (${percent}%)`);
  }

  return {
    ok: used < TOMTOM_QUOTA_LIMIT,
    used,
    limit: TOMTOM_QUOTA_LIMIT,
    percent,
    resets_at: nextDailyReset(),
  };
}

export async function incrementQuota(): Promise<void> {
  const current = await storage.getAppSetting(QUOTA_KEY);
  const used = parseInt(current?.value ?? "0", 10) || 0;
  await storage.upsertAppSetting(QUOTA_KEY, String(used + 1));
}

async function resetQuota(): Promise<void> {
  await storage.upsertAppSetting(QUOTA_KEY, "0");
  console.log("[TomTom] Quota giornaliera azzerata (reset cron)");
}

export function scheduleDailyReset(): void {
  function msUntilNextReset(): number {
    return Math.max(0, new Date(nextDailyReset()).getTime() - Date.now());
  }

  function scheduleNext() {
    const delay = msUntilNextReset();
    const hours = Math.round(delay / 3_600_000);
    console.log(`[TomTom] Quota reset schedulato tra ~${hours}h (${nextDailyReset()})`);

    setTimeout(async () => {
      await resetQuota().catch((e) => console.error("[TomTom] Errore reset quota:", e));
      scheduleNext();
    }, delay);
  }

  scheduleNext();
}
