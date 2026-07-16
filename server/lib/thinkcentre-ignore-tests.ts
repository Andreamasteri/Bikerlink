/**
 * Helper condiviso — legge il flag "thinkcentre_ignore_for_tests" da AppSettings.
 * Default: false (alerting normale attivo).
 * Quando true: il proposer AI watchdog, il monitor ThinkCentre e le push notifiche
 * per servizi offline saltano tutte le segnalazioni relative al ThinkCentre.
 * Il routing cloud fallback rimane invariato — solo gli alert vengono soppressi.
 * Utilizzato da: watchdog/proposer, jobs/thinkcentre-monitor, route admin thinkcentre-health.
 *
 * Cache TTL 60s con stale-while-revalidate: se il DB è sotto pressione e la
 * lettura fallisce, viene restituito l'ultimo valore noto invece di propagare
 * l'errore. Invalida la cache chiamando resetThinkCentreIgnoreForTestsCache()
 * dopo ogni write admin su questo flag.
 */
import { db, withDbRetry } from "../db";
import { appSettings } from "@shared/db";
import { eq } from "drizzle-orm";
import { dedupWarn } from "./dedup-logger";

const CACHE_TTL_MS = 60_000;

let cachedValue = false;
let cachedAt = 0;
let cacheInitialized = false;

export async function isThinkCentreIgnoredForTests(): Promise<boolean> {
  const now = Date.now();
  if (cacheInitialized && now - cachedAt < CACHE_TTL_MS) return cachedValue;
  try {
    const [row] = await withDbRetry(() =>
      db
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, "thinkcentre_ignore_for_tests"))
        .limit(1),
    );
    cachedValue = row?.value === "true";
    cachedAt = Date.now();
    cacheInitialized = true;
    return cachedValue;
  } catch (err) {
    dedupWarn("thinkcentre-ignore-tests", "errore lettura AppSetting ignore_for_tests (uso cache, non-fatal)", err);
    return cacheInitialized ? cachedValue : false;
  }
}

/** Invalida la cache — chiamare dopo ogni write admin su thinkcentre_ignore_for_tests. */
export function resetThinkCentreIgnoreForTestsCache(): void {
  cacheInitialized = false;
  cachedAt = 0;
}
