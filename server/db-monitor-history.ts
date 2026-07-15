// Task #64 — Scrittore + retention della history del Database Monitor.
//
// Popola db_monitor_history riusando i collector esistenti (nessuna nuova query
// DB per il carico DB): legge lo snapshot già calcolato dall'aggregator watchdog
// (pool/ping/errori/restart) + il probe di carico backend. UNA riga per tick
// (~60s). Ogni scrittura e ogni cleanup passano da withBgDbSlot così non possono
// mai competere col traffico utente sul pool (max=10).
//
// Retention 35 giorni (> 30 richiesti): il cleanup gira su timer, sempre sotto
// withBgDbSlot, e NON tocca le retention esistenti (system_signals 7g,
// resource_samples 24h).
import { db, withDbRetry, getPoolStats } from "./db";
import { dbMonitorHistory } from "@shared/db";
import { lt } from "drizzle-orm";
import { withBgDbSlot } from "./lib/bg-db-limiter";
import { getBackendLoad, startBackendLoadProbe } from "./lib/backend-load-probe";
import { dedupWarn } from "./lib/dedup-logger";

// Soglia latenza ping oltre la quale il DB è considerato sovraccarico (allineata
// a SLOW_PING_THRESHOLD_MS del db-collector).
const PING_OVERLOAD_MS = 500;
// Saturazione pool oltre la quale il DB è considerato sovraccarico.
const POOL_OVERLOAD_PCT = 90;

const RETENTION_DAYS = 35;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // ogni 6h

let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

// Lo snapshot dell'aggregator ha una forma minima che ci basta: status/score non
// servono qui, solo problems (per gli errori DB) e metrics (ping/restart).
interface SnapshotLike {
  problems: Array<{ source: string; severity: string }>;
  metrics: Record<string, number>;
}

/** Legge una metrica dallo snapshot provando le chiavi note (source.metric). */
function readMetric(metrics: Record<string, number>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = metrics[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Scrive UNA riga di history dal risultato del ciclo aggregator. Fire-and-forget:
 * i chiamanti non attendono e gli errori sono non-fatali (loggati deduplicati).
 */
export async function recordDbMonitorSample(snap: SnapshotLike): Promise<void> {
  try {
    const { activePct: poolActivePct, waiting: poolWaiting } = getPoolStats();

    // Ping: il db-collector emette "db.ping_ms" (source "db") → chiave "db.db.ping_ms".
    const pingMs = readMetric(snap.metrics, "db.db.ping_ms", "db.ping_ms");
    // Restart: restart-collector emette "server.restart_alert" (source "app").
    const dbRestartCount = readMetric(snap.metrics, "app.server.restart_alert", "server.restart_alert") ?? 0;

    // Errori DB del ciclo = problemi con origine "db" e severità alta.
    const dbErrorCount = snap.problems.filter(
      (p) => p.source === "db" && (p.severity === "high" || p.severity === "critical"),
    ).length;

    const dbOverload =
      dbErrorCount > 0 ||
      poolActivePct >= POOL_OVERLOAD_PCT ||
      (pingMs != null && pingMs >= PING_OVERLOAD_MS);

    const backend = getBackendLoad();

    await withBgDbSlot(() =>
      withDbRetry(() =>
        db.insert(dbMonitorHistory).values({
          poolActivePct: Math.round(poolActivePct),
          poolWaiting: Math.round(poolWaiting),
          pingMs: pingMs != null ? Math.round(pingMs) : null,
          dbErrorCount,
          dbRestartCount: Math.round(dbRestartCount),
          dbOverload,
          backendCpuPct: backend.cpuPct,
          backendEventLoopLagMs: backend.eventLoopLagMs,
          backendRssMb: backend.rssMb,
          backendOverload: backend.overloaded,
        }),
      ),
    );
  } catch (err) {
    dedupWarn("db-monitor-history", "write error (non-fatal)", err);
  }
}

/** Cleanup retention (35g). Sotto withBgDbSlot, non tocca altre retention. */
export async function cleanupDbMonitorHistory(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const out = await withBgDbSlot(() =>
      withDbRetry(() =>
        db.delete(dbMonitorHistory).where(lt(dbMonitorHistory.sampledAt, cutoff)).returning({ id: dbMonitorHistory.id }),
      ),
    );
    return out.length;
  } catch (err) {
    dedupWarn("db-monitor-history", "cleanup error (non-fatal)", err);
    return 0;
  }
}

/**
 * Avvia il probe di carico backend e il timer di cleanup retention. Idempotente.
 * La SCRITTURA delle righe è agganciata al ciclo aggregator (una per tick), non
 * a un timer proprio, per riusare i collector esistenti senza query aggiuntive.
 */
export function startDbMonitorHistory(): void {
  startBackendLoadProbe();
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => { cleanupDbMonitorHistory().catch(() => {}); }, CLEANUP_INTERVAL_MS);
  _cleanupTimer.unref?.();
  // Primo cleanup ritardato per non competere con la congestione di boot.
  setTimeout(() => { cleanupDbMonitorHistory().catch(() => {}); }, 5 * 60 * 1000).unref?.();
}

export const DB_MONITOR_HISTORY_RETENTION_DAYS = RETENTION_DAYS;
