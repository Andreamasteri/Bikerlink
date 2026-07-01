/**
 * Task #2527 — Metriche Prometheus per il motore matching.
 *
 * Espone counter/histogram registrati globalmente. Endpoint
 * `GET /api/admin/matching/metrics` serializza in formato Prometheus.
 *
 * Import lazy di `prom-client` per non bloccare il boot se la dipendenza
 * manca temporaneamente (es. cache stale del build server).
 */

type Counter = { inc: (labels?: Record<string, string>, value?: number) => void };
type Histogram = { observe: (labels: Record<string, string> | number, value?: number) => void };
type Gauge = { set: (labels: Record<string, string> | number, value?: number) => void };

interface MatchingMetrics {
  cyclesTotal: Counter;
  cycleErrorsTotal: Counter;
  cycleDropsTotal: Counter;
  cycleDurationSec: Histogram;
  matchesCreated: Counter;
  lockState: Gauge;
  register: { metrics: () => Promise<string>; contentType: string };
}

let cached: MatchingMetrics | null = null;
let initFailed = false;

async function init(): Promise<MatchingMetrics | null> {
  if (cached) return cached;
  if (initFailed) return null;
  try {
    const prom = await import("prom-client");
    const register = new prom.Registry();
    prom.collectDefaultMetrics({ register });

    const cyclesTotal = new prom.Counter({
      name: "bikerlink_matching_cycles_total",
      help: "Numero totale di cicli matching eseguiti",
      labelNames: ["status"],
      registers: [register],
    });
    const cycleErrorsTotal = new prom.Counter({
      name: "bikerlink_matching_cycle_errors_total",
      help: "Errori applicativi reali durante un ciclo matching (esclude i drop attesi del bg-db-limiter, vedi cycle_drops_total)",
      labelNames: ["matcher"],
      registers: [register],
    });
    // Task #5316 — i drop del bg-db-limiter (kill-switch/coda piena/coda scaduta)
    // sono una valvola di sfogo intenzionale, non un errore applicativo: vanno
    // contati separatamente per non gonfiare gli alert high/critical del watchdog
    // che si basano su cycle_errors_total / getRecentErrorCount.
    const cycleDropsTotal = new prom.Counter({
      name: "bikerlink_matching_cycle_drops_total",
      help: "Fasi del ciclo matching posticipate dal bg-db-limiter per proteggere il pool DB (non sono errori applicativi)",
      labelNames: ["phase"],
      registers: [register],
    });
    const cycleDurationSec = new prom.Histogram({
      name: "bikerlink_matching_cycle_duration_seconds",
      help: "Durata di un ciclo matching",
      buckets: [1, 5, 15, 30, 60, 120, 300, 600],
      registers: [register],
    });
    const matchesCreated = new prom.Counter({
      name: "bikerlink_matches_created_total",
      help: "Match creati per tipo",
      labelNames: ["type"],
      registers: [register],
    });
    const lockState = new prom.Gauge({
      name: "bikerlink_matching_lock_state",
      help: "1 se lock attivo, 0 altrimenti",
      registers: [register],
    });

    cached = {
      cyclesTotal: cyclesTotal as unknown as Counter,
      cycleErrorsTotal: cycleErrorsTotal as unknown as Counter,
      cycleDropsTotal: cycleDropsTotal as unknown as Counter,
      cycleDurationSec: cycleDurationSec as unknown as Histogram,
      matchesCreated: matchesCreated as unknown as Counter,
      lockState: lockState as unknown as Gauge,
      register: {
        metrics: () => register.metrics(),
        contentType: register.contentType,
      },
    };
    return cached;
  } catch (err) {
    initFailed = true;
    console.warn("[matching/metrics] prom-client non disponibile:", (err as Error).message);
    return null;
  }
}

export async function getMatchingMetrics(): Promise<MatchingMetrics | null> {
  return init();
}

/** Helper safe per incrementare un counter senza bloccare se prom-client manca. */
export async function recordMatchingCycle(status: "ok" | "error" | "skipped", durationMs: number): Promise<void> {
  const m = await init();
  if (!m) return;
  m.cyclesTotal.inc({ status });
  m.cycleDurationSec.observe(durationMs / 1000);
}

export async function recordMatchesCreated(type: string, count: number): Promise<void> {
  const m = await init();
  if (!m) return;
  m.matchesCreated.inc({ type }, count);
}

export async function setMatchingLockState(isLocked: boolean): Promise<void> {
  const m = await init();
  if (!m) return;
  m.lockState.set(isLocked ? 1 : 0);
}

export async function recordCycleError(matcher: string): Promise<void> {
  const m = await init();
  if (!m) return;
  m.cycleErrorsTotal.inc({ matcher });
}

/**
 * Task #5316 — registra un drop ATTESO del bg-db-limiter (kill-switch, coda
 * piena, coda scaduta) come metrica separata da `recordCycleError`. Questi
 * drop sono la valvola di sfogo che protegge il pool sotto pressione: non
 * vanno contati come errori applicativi del ciclo, o gonfiano falsamente gli
 * alert high/critical del watchdog.
 */
export async function recordCycleDrop(phase: string): Promise<void> {
  const m = await init();
  if (!m) return;
  m.cycleDropsTotal.inc({ phase });
}
