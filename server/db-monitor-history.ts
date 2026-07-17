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
//
// Fase 5 (Task #545) — Fix del feedback loop auto-latch DEGRADED.
//
// Il vecchio calcolo di `dbOverload` usava `dbErrorCount` (conteggio di Problems
// con source="db" e severity="high/critical") che includeva `db.db.overload_sustained`
// e `db.db.pool.waiting`. Questo creava un feedback loop:
//   1. pool pressure → poolActivePct alto → dbOverload=true
//   2. dopo N tick: overload_sustained emesso (derived signal → Problem)
//   3. problema db.db.overload_sustained → dbErrorCount=1 → dbOverload=true
//   4. anche se pool/ping tornano sani, dbOverload resta true → latch DEGRADED
//
// Fix: dbOverload dipende SOLO da metriche dirette (poolActivePct, pingMs).
// dbErrorCount è tenuto solo per il display diagnostico.
import { db, withDbRetry, getPoolStats } from "./db";
import { dbMonitorHistory } from "@shared/db";
import { lt } from "drizzle-orm";
import { withBgDbSlot } from "./lib/bg-db-limiter";
import { getBackendLoad, startBackendLoadProbe } from "./lib/backend-load-probe";
import { getOverloadThresholds, refreshOverloadThresholds } from "./lib/overload-thresholds";
import { dedupWarn } from "./lib/dedup-logger";
import { sustainedTracker } from "./ai/watchdog/state/sustained-tracker";

// Re-export dell'interfaccia per backward-compat (overload-collector la usa).
export type { SustainedOverloadState } from "./ai/watchdog/state/sustained-tracker";

// Task #83 — le soglie di ping/pool/tick-sostenuti non sono più costanti: si
// leggono da getOverloadThresholds() (regolabili dall'admin), con i vecchi valori
// (pool 90% / ping 500ms / 3 tick) come default se il setting manca o è invalido.

const RETENTION_DAYS = 35;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // ogni 6h

// Fase 5 — Problem IDs da escludere dal display di dbErrorCount.
// NOTA: questi IDs NON influenzano più dbOverload (il feedback loop è risolto a
// monte: dbOverload usa solo poolActivePct e pingMs). Questa lista serve SOLO a
// tenere il display "errori DB" pulito evitando il double-counting di segnali
// già catturati dalle metriche dirette.
//   - db.db.overload_sustained: derived, mostrato già come consecutiveTicks
//   - db.db.pool.waiting: già catturato in poolActivePct/poolWaiting
const OVERLOAD_DISPLAY_EXCLUDED_IDS = new Set([
  "db.db.overload_sustained",
  "db.db.pool.waiting",
]);

/**
 * Ultimo stato di sovraccarico sostenuto (lettura sincrona, zero-I/O). Aggiornato
 * a ogni tick da recordDbMonitorSample; letto dall'overload-collector che lo
 * traduce in segnali "high" per gli alert admin.
 */
export function getSustainedOverloadState() {
  return sustainedTracker.getState();
}

/**
 * Task #154 — Reset dello stato di sovraccarico sostenuto. Azzera i contatori di
 * tick consecutivi (overload/salute), i latch "was sustained" e lo snapshot
 * pubblico, così un sovraccarico rientrato non resta appiccicato nel pannello
 * finché il server non riparte. Idempotente, nessun I/O.
 */
export function resetSustainedOverloadState(): void {
  sustainedTracker.reset();
}

let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

// Lo snapshot dell'aggregator ha una forma minima che ci basta: status/score non
// servono qui, solo problems (per il display degli errori DB) e metrics (ping/restart).
interface SnapshotLike {
  problems: Array<{ id?: string; source: string; severity: string }>;
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
    // Ricarica le soglie regolabili dall'admin (default-safe se il setting manca).
    // Un cambio dall'admin panel si propaga entro un tick (~60s).
    await refreshOverloadThresholds();
    const thresholds = getOverloadThresholds();
    const { activePct: poolActivePct, waiting: poolWaiting } = getPoolStats();

    // Ping: il db-collector emette "db.ping_ms" (source "db") → chiave "db.db.ping_ms".
    const pingMs = readMetric(snap.metrics, "db.db.ping_ms", "db.ping_ms");
    // Restart: restart-collector emette "server.restart_alert" (source "app").
    const dbRestartCount = readMetric(snap.metrics, "app.server.restart_alert", "server.restart_alert") ?? 0;

    // dbErrorCount: Problems DB high/critical reali — esclude gli ID derivati
    // (overload_sustained, pool.waiting) che causavano il feedback loop.
    // Questa è l'unica fonte di "errori DB" che influenza sia il display sia
    // la formula dbOverload: circuiti aperti, errori di connessione, ecc.
    const dbErrorCount = snap.problems.filter(
      (p) =>
        p.source === "db" &&
        (p.severity === "high" || p.severity === "critical") &&
        !(p.id != null && OVERLOAD_DISPLAY_EXCLUDED_IDS.has(p.id)),
    ).length;

    // Fase 5 — dbOverload include errori DB reali (non derivati) per non perdere
    // segnali di incidente genuini (circuito aperto, errori di connessione ecc.).
    // I Problem IDs derivati (overload_sustained, pool.waiting) sono già esclusi
    // da dbErrorCount via OVERLOAD_DISPLAY_EXCLUDED_IDS → nessun feedback loop.
    const dbOverload =
      poolActivePct >= thresholds.poolActivePct ||
      (pingMs != null && pingMs >= thresholds.pingMs) ||
      dbErrorCount > 0;

    const backend = getBackendLoad();

    // Task #72 — aggiorna i contatori di sovraccarico sostenuto PRIMA della
    // scrittura DB: così restano coerenti anche se l'insert fallisce (ramo catch).
    sustainedTracker.tick({
      dbOverload, poolActivePct, poolWaiting, pingMs, dbErrorCount, backend, thresholds,
    });

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
