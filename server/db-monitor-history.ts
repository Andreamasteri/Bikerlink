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
import { getBackendLoad, startBackendLoadProbe, BACKEND_LOAD_THRESHOLDS } from "./lib/backend-load-probe";
import { dedupWarn } from "./lib/dedup-logger";

// Soglia latenza ping oltre la quale il DB è considerato sovraccarico (allineata
// a SLOW_PING_THRESHOLD_MS del db-collector).
const PING_OVERLOAD_MS = 500;
// Saturazione pool oltre la quale il DB è considerato sovraccarico.
const POOL_OVERLOAD_PCT = 90;

const RETENTION_DAYS = 35;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // ogni 6h

// Task #72 — Allerta proattiva su sovraccarico sostenuto.
//
// Il banner del Database Monitor mostra il sovraccarico solo quando un admin
// guarda lo schermo. Qui contiamo i tick consecutivi in cui il DB (o il backend
// Node) risulta sovraccarico: quando lo stesso lato resta sovraccarico per
// CONSECUTIVE_TICKS_FOR_SUSTAINED cicli aggregator (~60s l'uno) lo classifichiamo
// "sostenuto" e lo esponiamo via getSustainedOverloadState(). L'overload-collector
// lo legge al tick successivo ed emette un segnale "high" che il watchdog alza a
// push (distinguendo DB vs backend), riusando il canale alert esistente col suo
// throttle. Un singolo tick di picco resta un blip e NON allerta.
const CONSECUTIVE_TICKS_FOR_SUSTAINED = 3;

// Task #84 — Notifica di rientro. Un overload precedentemente SOSTENUTO è
// considerato "risolto" solo dopo altrettanti tick consecutivi di salute
// (simmetrico all'ingresso): così la push di rientro non lampeggia su un singolo
// tick buono, esattamente come la push di allerta non parte su un singolo picco.
const CONSECUTIVE_TICKS_FOR_RECOVERY = CONSECUTIVE_TICKS_FOR_SUSTAINED;

/** Stato di sovraccarico sostenuto per DB e backend, letto dall'overload-collector. */
export interface SustainedOverloadState {
  db: {
    sustained: boolean;
    /** Task #84 — edge di rientro: true per UN solo tick quando un overload sostenuto rientra. */
    recovered: boolean;
    consecutiveTicks: number;
    /** Task #84 — tick consecutivi in cui il DB è risultato sano. */
    healthyTicks: number;
    poolActivePct: number;
    poolWaiting: number;
    pingMs: number | null;
    dbErrorCount: number;
    /** Motivi leggibili del sovraccarico corrente (pool/ping/errori). */
    reasons: string[];
  };
  backend: {
    sustained: boolean;
    /** Task #84 — edge di rientro: true per UN solo tick quando un overload sostenuto rientra. */
    recovered: boolean;
    consecutiveTicks: number;
    /** Task #84 — tick consecutivi in cui il backend è risultato sano. */
    healthyTicks: number;
    cpuPct: number;
    eventLoopLagMs: number;
    eventLoopP99Ms: number;
    rssMb: number;
    /** Motivi leggibili del sovraccarico corrente (event-loop/CPU). */
    reasons: string[];
  };
}

let dbOverloadConsecutive = 0;
let backendOverloadConsecutive = 0;
// Task #84 — tick consecutivi di salute + latch "c'è stato un overload sostenuto
// ancora da segnalare come risolto".
let dbHealthyConsecutive = 0;
let backendHealthyConsecutive = 0;
let dbWasSustained = false;
let backendWasSustained = false;
let sustainedState: SustainedOverloadState = {
  db: { sustained: false, recovered: false, consecutiveTicks: 0, healthyTicks: 0, poolActivePct: 0, poolWaiting: 0, pingMs: null, dbErrorCount: 0, reasons: [] },
  backend: { sustained: false, recovered: false, consecutiveTicks: 0, healthyTicks: 0, cpuPct: 0, eventLoopLagMs: 0, eventLoopP99Ms: 0, rssMb: 0, reasons: [] },
};

/**
 * Ultimo stato di sovraccarico sostenuto (lettura sincrona, zero-I/O). Aggiornato
 * a ogni tick da recordDbMonitorSample; letto dall'overload-collector che lo
 * traduce in segnali "high" per gli alert admin.
 */
export function getSustainedOverloadState(): SustainedOverloadState {
  return sustainedState;
}

let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

// Lo snapshot dell'aggregator ha una forma minima che ci basta: status/score non
// servono qui, solo problems (per gli errori DB) e metrics (ping/restart).
interface SnapshotLike {
  problems: Array<{ id?: string; source: string; severity: string }>;
  metrics: Record<string, number>;
}

// Task #72 — problemi DERIVATI dal nostro stesso stato di overload sostenuto.
// Vanno esclusi dal conteggio "errori DB" del tick, altrimenti si auto-latchano:
// una volta emesso db.db.overload_sustained (source "db", severity "high"), il
// tick successivo lo ri-conterebbe come errore DB → dbOverload resta true anche
// a pool/ping sani → il contatore non si azzera più e la push non si ferma.
const DERIVED_OVERLOAD_PROBLEM_IDS = new Set(["db.db.overload_sustained"]);

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

    // Errori DB del ciclo = problemi con origine "db" e severità alta, ESCLUSI
    // i problemi derivati dal nostro stesso stato di overload (anti-latch).
    const dbErrorCount = snap.problems.filter(
      (p) =>
        p.source === "db" &&
        (p.severity === "high" || p.severity === "critical") &&
        !(p.id != null && DERIVED_OVERLOAD_PROBLEM_IDS.has(p.id)),
    ).length;

    const dbOverload =
      dbErrorCount > 0 ||
      poolActivePct >= POOL_OVERLOAD_PCT ||
      (pingMs != null && pingMs >= PING_OVERLOAD_MS);

    const backend = getBackendLoad();

    // Task #72 — aggiorna i contatori di sovraccarico sostenuto PRIMA della
    // scrittura DB: così restano coerenti anche se l'insert fallisce (ramo catch).
    updateSustainedOverload({
      dbOverload, poolActivePct, poolWaiting, pingMs, dbErrorCount, backend,
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

/**
 * Task #72 — Conta i tick consecutivi di sovraccarico per DB e backend e produce
 * lo snapshot `sustainedState`. Puro (nessun I/O), chiamato una volta per tick.
 */
function updateSustainedOverload(input: {
  dbOverload: boolean;
  poolActivePct: number;
  poolWaiting: number;
  pingMs: number | null;
  dbErrorCount: number;
  backend: ReturnType<typeof getBackendLoad>;
}): void {
  const { dbOverload, poolActivePct, poolWaiting, pingMs, dbErrorCount, backend } = input;

  dbOverloadConsecutive = dbOverload ? dbOverloadConsecutive + 1 : 0;
  backendOverloadConsecutive = backend.overloaded ? backendOverloadConsecutive + 1 : 0;

  // Task #84 — tick consecutivi di salute (specularmente ai tick di overload).
  dbHealthyConsecutive = dbOverload ? 0 : dbHealthyConsecutive + 1;
  backendHealthyConsecutive = backend.overloaded ? 0 : backendHealthyConsecutive + 1;

  const dbSustained = dbOverloadConsecutive >= CONSECUTIVE_TICKS_FOR_SUSTAINED;
  const backendSustained = backendOverloadConsecutive >= CONSECUTIVE_TICKS_FOR_SUSTAINED;

  // Task #84 — latch: appena un lato diventa sostenuto, ricordiamo che va poi
  // segnalato come RISOLTO quando rientra. Senza latch non sapremmo distinguere
  // "sano da sempre" (nessuna push) da "sano dopo un incidente" (push di rientro).
  if (dbSustained) dbWasSustained = true;
  if (backendSustained) backendWasSustained = true;

  // Task #84 — edge di rientro: era sostenuto e ora è sano da una finestra piena.
  // Sparato UNA sola volta (azzera il latch); il throttle di alerts fa comunque da
  // rete anti-flap. recovered NON è "sostenuto rientrato" a ripetizione: dopo la
  // singola emissione il latch è spento e recovered torna false ai tick seguenti.
  const dbRecovered =
    dbWasSustained && !dbOverload && dbHealthyConsecutive >= CONSECUTIVE_TICKS_FOR_RECOVERY;
  if (dbRecovered) dbWasSustained = false;
  const backendRecovered =
    backendWasSustained && !backend.overloaded && backendHealthyConsecutive >= CONSECUTIVE_TICKS_FOR_RECOVERY;
  if (backendRecovered) backendWasSustained = false;

  const dbReasons: string[] = [];
  if (dbErrorCount > 0) dbReasons.push(`${dbErrorCount} errori DB`);
  if (poolActivePct >= POOL_OVERLOAD_PCT) dbReasons.push(`pool al ${Math.round(poolActivePct)}%`);
  if (pingMs != null && pingMs >= PING_OVERLOAD_MS) dbReasons.push(`ping ${Math.round(pingMs)}ms`);

  const backendReasons: string[] = [];
  if (backend.eventLoopLagMs >= BACKEND_LOAD_THRESHOLDS.eventLoopLagMs) backendReasons.push(`event-loop lag ${backend.eventLoopLagMs}ms`);
  if (backend.eventLoopP99Ms >= BACKEND_LOAD_THRESHOLDS.eventLoopP99Ms) backendReasons.push(`event-loop p99 ${backend.eventLoopP99Ms}ms`);
  if (backend.cpuPct >= BACKEND_LOAD_THRESHOLDS.cpuPct) backendReasons.push(`CPU ${backend.cpuPct}%`);

  sustainedState = {
    db: {
      sustained: dbSustained,
      recovered: dbRecovered,
      consecutiveTicks: dbOverloadConsecutive,
      healthyTicks: dbHealthyConsecutive,
      poolActivePct: Math.round(poolActivePct),
      poolWaiting: Math.round(poolWaiting),
      pingMs: pingMs != null ? Math.round(pingMs) : null,
      dbErrorCount,
      reasons: dbReasons,
    },
    backend: {
      sustained: backendSustained,
      recovered: backendRecovered,
      consecutiveTicks: backendOverloadConsecutive,
      healthyTicks: backendHealthyConsecutive,
      cpuPct: backend.cpuPct,
      eventLoopLagMs: backend.eventLoopLagMs,
      eventLoopP99Ms: backend.eventLoopP99Ms,
      rssMb: backend.rssMb,
      reasons: backendReasons,
    },
  };
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
