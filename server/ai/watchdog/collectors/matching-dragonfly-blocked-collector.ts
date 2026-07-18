// Collector: rileva quando il map-matching è bloccato da rifiuti consecutivi
// del lock distribuito DragonflyDB per un periodo prolungato (> soglia).
//
// Scenario d'origine: DragonflyDB parzialmente irraggiungibile ma
// isRedisAvailable()=true (client inizializzato); Redlock.acquire() fallisce →
// ogni tentativo di ciclo restituisce "already_running" (source "dragonfly")
// senza attivare il fallback in-memory → matching silenzioso per ore.
//
// Il collector:
//   - Legge il tail della history del lock (getDragonflyRejectionStreak)
//   - Mantiene in-process il timestamp di inizio blocco (latch)
//   - Se il blocco dura > soglia (default 60 min, configurabile via AppSetting
//     "matching_dragonfly_alert_min") emette segnale "high"
//   - Quando il blocco si risolve emette un segnale info di recovery
//
// Il segnale "high" è poi gestito in alerts.ts con un blocco dedicato
// (come gli altri segnali high non critical, es. db.overload_sustained).
import { isRedisAvailable } from "../../../cache/redis";
import { getDragonflyRejectionStreak } from "../../../cache/matching-lock";
import { storage } from "../../../storage";
import type { Signal } from "../types";

// Se l'ultimo rifiuto dragonfly è più vecchio di REJECTION_STALE_MS il blocco
// si è probabilmente risolto — il matching viene tentato ogni ~1 min e un gap
// di 5 min senza nuovi rifiuti è un segnale affidabile di recovery.
const REJECTION_STALE_MS = 5 * 60_000;

// Soglia default (60 min): coerente con il cooldown push degli altri alert.
const DEFAULT_ALERT_THRESHOLD_MIN = 60;

// Cache AppSetting: evita N query DB per ciclo (TTL 10 min).
let cachedThresholdMs: number | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 10 * 60_000;

// Stato in-process del collector.
// `blockedSinceAt`: timestamp (ms) del primo rifiuto dragonfly del blocco corrente;
//   null = matching non bloccato.
// `recoveryEmittedAt`: evita di emettere più recovery consecutivi per lo stesso rientro.
let blockedSinceAt: number | null = null;
let recoveryEmittedAt: number | null = null;

async function getAlertThresholdMs(): Promise<number> {
  const now = Date.now();
  if (cachedThresholdMs !== null && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedThresholdMs;
  }
  try {
    const row = await storage.getAppSetting("matching_dragonfly_alert_min");
    const n = row?.value ? parseInt(row.value, 10) : NaN;
    if (Number.isFinite(n) && n >= 1) {
      cachedThresholdMs = n * 60_000;
      cacheLoadedAt = now;
      return cachedThresholdMs;
    }
  } catch { /* fallback al default */ }
  cachedThresholdMs = DEFAULT_ALERT_THRESHOLD_MIN * 60_000;
  cacheLoadedAt = now;
  return cachedThresholdMs;
}

export async function collectMatchingDragonflyBlocked(): Promise<Signal[]> {
  const signals: Signal[] = [];
  const now = Date.now();

  const { mostRecentRejectedAt, consecutiveCount } = getDragonflyRejectionStreak();

  // "Rifiuto recente": l'ultimo evento del lock è un rifiuto dragonfly emesso
  // negli ultimi 5 minuti (il matching è tentato ~ogni 1 min).
  const isRejecting =
    mostRecentRejectedAt !== null && now - mostRecentRejectedAt < REJECTION_STALE_MS;

  // Il blocking interessa SOLO quando DragonflyDB è "pensato" disponibile
  // (isRedisAvailable()=true) ma il Redlock.acquire() fallisce. Se
  // isRedisAvailable()=false il fallback in-memory è attivo e il matching
  // gira normalmente → non è un blocco da segnalare qui.
  const isUsingDragonfly = isRedisAvailable();

  const isBlocked = isRejecting && isUsingDragonfly;

  if (isBlocked) {
    if (blockedSinceAt === null) {
      // Primo rifiuto della finestra corrente: usa il timestamp del rifiuto come
      // inizio del blocco (più preciso di "now", che arriva ~60s dopo).
      // mostRecentRejectedAt non è null qui (isRejecting=true lo garantisce).
      blockedSinceAt = mostRecentRejectedAt ?? now;
      recoveryEmittedAt = null;
    }
    const blockedMs = now - blockedSinceAt;
    const blockedMin = Math.floor(blockedMs / 60_000);
    const thresholdMs = await getAlertThresholdMs();
    if (blockedMs >= thresholdMs) {
      signals.push({
        source: "matching",
        metric: "dragonfly_blocked",
        value: blockedMin,
        unit: "min",
        severity: "high",
        details: {
          blockedSinceAt: new Date(blockedSinceAt).toISOString(),
          consecutiveCount,
          thresholdMin: Math.floor(thresholdMs / 60_000),
          message: `Map-matching bloccato da ${blockedMin}min — lock distribuito DragonflyDB rifiuta l'acquisizione`,
        },
      });
    }
  } else {
    // Non bloccato: se lo eravamo, emetti recovery (una sola volta per rientro).
    if (blockedSinceAt !== null && recoveryEmittedAt === null) {
      const blockedMin = Math.floor((now - blockedSinceAt) / 60_000);
      recoveryEmittedAt = now;
      signals.push({
        source: "matching",
        metric: "dragonfly_blocked_recovered",
        value: blockedMin,
        unit: "min",
        severity: "info",
        details: {
          blockedSinceAt: new Date(blockedSinceAt).toISOString(),
          blockedMin,
          recoveredAt: new Date(now).toISOString(),
          message: `Map-matching ripristinato dopo ${blockedMin}min di blocco DragonflyDB`,
        },
      });
      blockedSinceAt = null;
    }
  }

  return signals;
}

/** Esposto solo per i test di unità: azzera lo stato in-process. */
export function _resetMatchingDragonflyBlockedStateForTests(): void {
  blockedSinceAt = null;
  recoveryEmittedAt = null;
  cachedThresholdMs = null;
  cacheLoadedAt = 0;
}
