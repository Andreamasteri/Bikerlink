/**
 * Helper condiviso — legge il flag "thinkcentre_powered_off" da AppSettings.
 * Default: false (ThinkCentre considerato acceso).
 * Quando true: tutte le probe saltate, zero push inviate, routing su cloud.
 * Utilizzato da: thinkcentre-monitor, maps-health-checks, router-selector.
 *
 * Cache TTL 60s con stale-while-revalidate: se il DB è sotto pressione e la
 * lettura fallisce, viene restituito l'ultimo valore noto invece di propagare
 * l'errore. Questo interrompe la storm di "Failed query: select ... from
 * app_settings" che si verifica quando il bg-db-limiter kill-switch è attivo.
 * Invalida la cache chiamando resetThinkCentrePoweredOffCache() dopo ogni
 * write admin su questo flag.
 */
import { db, withDbRetry } from "../db";
import { appSettings } from "@shared/db";
import { eq } from "drizzle-orm";
import { dedupWarn } from "./dedup-logger";

const CACHE_TTL_MS = 60_000;

let cachedValue = false;
let cachedAt = 0;
let cacheInitialized = false;

export async function isThinkCentrePoweredOff(): Promise<boolean> {
  const now = Date.now();
  if (cacheInitialized && now - cachedAt < CACHE_TTL_MS) return cachedValue;
  try {
    const [row] = await withDbRetry(() =>
      db
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, "thinkcentre_powered_off"))
        .limit(1),
    );
    cachedValue = row?.value === "true";
    cachedAt = Date.now();
    cacheInitialized = true;
    return cachedValue;
  } catch (err) {
    dedupWarn("thinkcentre-powered-off", "errore lettura AppSetting powered_off (uso cache, non-fatal)", err);
    return cacheInitialized ? cachedValue : false;
  }
}

/** Invalida la cache — chiamare dopo ogni write admin su thinkcentre_powered_off. */
export function resetThinkCentrePoweredOffCache(): void {
  cacheInitialized = false;
  cachedAt = 0;
}
