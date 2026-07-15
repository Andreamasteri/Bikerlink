// Task #64 — Backend-load probe (indipendente dal segnale del pool DB).
//
// Misura il carico del SERVER Node in sé — non del database — così che il
// Database Monitor possa distinguere "il DB è sovraccarico" da "il backend è
// sovraccarico" (o entrambi). Tre sorgenti, tutte zero-I/O:
//   - event-loop lag : monitorEventLoopDelay() (perf_hooks) — il sintomo #1 di
//                      un backend saturo (l'event loop non riesce a smaltire i
//                      task in tempo → richieste lente anche col DB sano).
//   - CPU %          : delta di process.cpuUsage() sull'intervallo, normalizzato
//                      sul numero di core.
//   - RSS            : process.memoryUsage().rss (già campionato altrove, qui
//                      per avere tutto in un unico snapshot).
//
// Il probe gira su un timer leggero (default 5s) e mantiene solo l'ultimo
// snapshot in memoria: getBackendLoad() è una lettura sincrona istantanea usata
// sia dallo scrittore della history sia dalla route del monitor per i banner.

import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import os from "node:os";
import { getOverloadThresholds } from "./overload-thresholds";

// ── Soglie di sovraccarico ────────────────────────────────────────────────────
// Sovraccarico backend = event loop che non smaltisce (lag medio alto o coda di
// picco lunga) OPPURE CPU quasi satura in modo sostenuto. Le soglie non sono più
// costanti: vengono lette da getOverloadThresholds() (Task #83), regolabili
// dall'admin, con i vecchi valori (lag 100ms / p99 500ms / CPU 85%) come default.

const PROBE_INTERVAL_MS = 5_000;

export interface BackendLoad {
  /** Event-loop lag medio sulla finestra (ms). */
  eventLoopLagMs: number;
  /** Event-loop lag p99 sulla finestra (ms). */
  eventLoopP99Ms: number;
  /** CPU del processo sull'ultimo intervallo, 0..100 (normalizzata sui core). */
  cpuPct: number;
  /** Resident set size (MB). */
  rssMb: number;
  /** true se il backend è classificato sovraccarico (indipendente dal DB). */
  overloaded: boolean;
  /** Timestamp dell'ultimo campionamento (epoch ms), 0 se mai campionato. */
  at: number;
}

let histogram: IntervalHistogram | null = null;
let lastCpu: NodeJS.CpuUsage | null = null;
let lastCpuAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;

let latest: BackendLoad = {
  eventLoopLagMs: 0,
  eventLoopP99Ms: 0,
  cpuPct: 0,
  rssMb: 0,
  overloaded: false,
  at: 0,
};

function sample(): void {
  const now = Date.now();

  // ── Event-loop lag (finestra: da reset a reset) ─────────────────────────────
  let lagMs = 0;
  let p99Ms = 0;
  if (histogram) {
    // mean/percentile sono in nanosecondi; il lag è l'eccesso oltre la
    // risoluzione ideale, ma per il monitor usiamo direttamente il ritardo
    // misurato (già al netto della risoluzione del timer).
    lagMs = Math.round(histogram.mean / 1e6);
    p99Ms = Math.round(histogram.percentile(99) / 1e6);
    if (!Number.isFinite(lagMs) || lagMs < 0) lagMs = 0;
    if (!Number.isFinite(p99Ms) || p99Ms < 0) p99Ms = 0;
    histogram.reset();
  }

  // ── CPU % sull'intervallo ───────────────────────────────────────────────────
  let cpuPct = 0;
  if (lastCpu && lastCpuAt > 0) {
    const elapsedMs = now - lastCpuAt;
    const diff = process.cpuUsage(lastCpu); // microsecondi user+system dal riferimento
    const cpuMs = (diff.user + diff.system) / 1000;
    const cores = os.cpus().length || 1;
    if (elapsedMs > 0) {
      cpuPct = Math.min(100, Math.max(0, Math.round((cpuMs / (elapsedMs * cores)) * 100)));
    }
  }
  lastCpu = process.cpuUsage();
  lastCpuAt = now;

  const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

  const t = getOverloadThresholds();
  const overloaded =
    lagMs >= t.eventLoopLagMs ||
    p99Ms >= t.eventLoopP99Ms ||
    cpuPct >= t.cpuPct;

  latest = { eventLoopLagMs: lagMs, eventLoopP99Ms: p99Ms, cpuPct, rssMb, overloaded, at: now };
}

/**
 * Avvia il probe di carico backend. Idempotente: chiamate ripetute sono no-op.
 * Il timer è `unref()`-ato così non tiene vivo il processo.
 */
export function startBackendLoadProbe(): void {
  if (timer) return;
  histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  lastCpu = process.cpuUsage();
  lastCpuAt = Date.now();
  timer = setInterval(sample, PROBE_INTERVAL_MS);
  timer.unref?.();
}

export function stopBackendLoadProbe(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (histogram) {
    histogram.disable();
    histogram = null;
  }
}

/**
 * Ultimo snapshot di carico backend (lettura sincrona, zero-I/O). Se il probe
 * non è ancora partito restituisce valori a zero con overloaded=false.
 */
export function getBackendLoad(): BackendLoad {
  return latest;
}
