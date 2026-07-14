/**
 * Helper condiviso — "ThinkCentre offline completo".
 *
 * Ritorna true quando `thinkcentre_powered_off=true` OPPURE
 * `thinkcentre_maintenance_mode=true`. In entrambi i casi il sistema deve
 * smettere immediatamente di interagire con i servizi self-hosted del
 * ThinkCentre (Ollama, Whisper, routing, map-matching, Photon): niente
 * timeout di rete da attendere, niente retry, fallback cloud istantaneo.
 *
 * Le due AppSetting vengono lette con cache in-memory TTL 3 minuti: così le
 * letture su `app_settings` avvengono al massimo ogni 3 minuti invece di ogni
 * ciclo (~65s), e quando il pool è saturo le letture fallite NON cambiano il
 * comportamento (si riusa l'ultimo valore valido in cache).
 *
 * `ignore_for_tests` resta separato (non attiva il fallback cloud — serve solo
 * a silenziare gli alert in dev/CI).
 */
import { db, withDbRetry } from "../db";
import { appSettings } from "@shared/db";
import { inArray } from "drizzle-orm";
import { dedupWarn } from "./dedup-logger";

const CACHE_TTL_MS = 3 * 60_000;

let cachedOffline = false;
let cachedAt = 0;
let cacheInitialized = false;

const OFFLINE_KEYS = ["thinkcentre_powered_off", "thinkcentre_maintenance_mode"];

/**
 * true se il ThinkCentre è da considerare offline (spento O in manutenzione).
 * Letture DB throttlate a una ogni 3 minuti; in caso di errore DB restituisce
 * l'ultimo valore noto (o false se non ancora inizializzato).
 */
export async function isThinkCentreOffline(): Promise<boolean> {
  const now = Date.now();
  if (cacheInitialized && now - cachedAt < CACHE_TTL_MS) {
    return cachedOffline;
  }
  try {
    const rows = await withDbRetry(() =>
      db
        .select({ key: appSettings.key, value: appSettings.value })
        .from(appSettings)
        .where(inArray(appSettings.key, OFFLINE_KEYS)),
    );
    cachedOffline = rows.some((r) => r.value === "true");
    cachedAt = Date.now();
    cacheInitialized = true;
    return cachedOffline;
  } catch (err) {
    dedupWarn(
      "thinkcentre-offline",
      "errore lettura AppSetting offline (uso cache/last-known, non-fatal)",
      err,
    );
    // Riusa l'ultimo valore noto: una lettura fallita sotto pool saturo non
    // deve cambiare il comportamento (la cache è ancora la verità migliore).
    return cacheInitialized ? cachedOffline : false;
  }
}

/** Invalida la cache (es. dopo un cambio manuale degli switch da admin). */
export function resetThinkCentreOfflineCache(): void {
  cacheInitialized = false;
  cachedAt = 0;
  cachedOffline = false;
}
