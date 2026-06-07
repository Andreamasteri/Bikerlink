// Task #2686 — Counter in-process per il router selector. Conta successi,
// fallback e fallimenti per engine; tracking di "engine down" basato su una
// finestra di tentativi consecutivi falliti. Consumato dal maps-collector.
type Engine = "graphhopper" | "valhalla" | "mapbox" | "tomtom";

interface Sample { ts: number; engine: Engine; outcome: "success" | "fallback" | "failure"; latencyMs?: number }
const SAMPLES_MAX = 1000;
const samples: Sample[] = [];
const consecutiveFailures: Partial<Record<Engine, number>> = {};
const enginesDown: Partial<Record<Engine, number>> = {}; // ts in cui è marcato down
const DOWN_THRESHOLD = 3; // 3 fallimenti consecutivi → engine considerato down

function push(s: Sample): void {
  samples.push(s);
  if (samples.length > SAMPLES_MAX) samples.shift();
}

export function recordRoutingSuccess(engine: Engine, latencyMs?: number): void {
  push({ ts: Date.now(), engine, outcome: "success", ...(latencyMs !== undefined ? { latencyMs } : {}) });
  consecutiveFailures[engine] = 0;
  delete enginesDown[engine];
}

export function recordRoutingFallback(engine: Engine, _toEngine: Engine = "graphhopper"): void {
  push({ ts: Date.now(), engine, outcome: "fallback" });
  consecutiveFailures[engine] = (consecutiveFailures[engine] ?? 0) + 1;
  if ((consecutiveFailures[engine] ?? 0) >= DOWN_THRESHOLD && !enginesDown[engine]) {
    enginesDown[engine] = Date.now();
  }
}

export function recordRoutingFailure(engine: Engine): void {
  push({ ts: Date.now(), engine, outcome: "failure" });
  consecutiveFailures[engine] = (consecutiveFailures[engine] ?? 0) + 1;
  if ((consecutiveFailures[engine] ?? 0) >= DOWN_THRESHOLD && !enginesDown[engine]) {
    enginesDown[engine] = Date.now();
  }
}

export interface RoutingCounters {
  windowMs: number;
  successes: number;
  fallbacks: number;
  failures: number;
  byEngine: Record<string, { success: number; fallback: number; failure: number }>;
  enginesDown: Record<string, number | null>;
}

export function getRoutingCounters(windowMs: number = 5 * 60_000): RoutingCounters {
  const since = Date.now() - windowMs;
  const byEngine: RoutingCounters["byEngine"] = {};
  let successes = 0, fallbacks = 0, failures = 0;
  for (const s of samples) {
    if (s.ts < since) continue;
    byEngine[s.engine] = byEngine[s.engine] ?? { success: 0, fallback: 0, failure: 0 };
    byEngine[s.engine][s.outcome]++;
    if (s.outcome === "success") successes++;
    else if (s.outcome === "fallback") fallbacks++;
    else failures++;
  }
  const enginesDownOut: Record<string, number | null> = {};
  for (const e of Object.keys(enginesDown) as Engine[]) {
    enginesDownOut[e] = enginesDown[e] ?? null;
  }
  return { windowMs, successes, fallbacks, failures, byEngine, enginesDown: enginesDownOut };
}

/**
 * Latenza media (ms) dei successi recenti per engine, nella finestra data.
 * Engine senza campioni con latenza → assente dalla mappa. Usato dall'AI
 * Routing Engine Selector per arricchire il contesto della decisione.
 */
export function getRecentLatencies(windowMs: number = 5 * 60_000): Record<string, number> {
  const since = Date.now() - windowMs;
  const acc: Record<string, { sum: number; n: number }> = {};
  for (const s of samples) {
    if (s.ts < since || s.outcome !== "success" || s.latencyMs === undefined) continue;
    acc[s.engine] = acc[s.engine] ?? { sum: 0, n: 0 };
    acc[s.engine].sum += s.latencyMs;
    acc[s.engine].n++;
  }
  const out: Record<string, number> = {};
  for (const e of Object.keys(acc)) {
    out[e] = Math.round(acc[e].sum / acc[e].n);
  }
  return out;
}

export function _resetRoutingMetricsForTests(): void {
  samples.length = 0;
  for (const k of Object.keys(consecutiveFailures)) delete consecutiveFailures[k as Engine];
  for (const k of Object.keys(enginesDown)) delete enginesDown[k as Engine];
}
