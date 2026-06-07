// Task #2686 — Counter in-process per il router selector. Conta successi,
// fallback e fallimenti per engine; tracking di "engine down" basato su una
// finestra di tentativi consecutivi falliti. Consumato dal maps-collector.
type Engine = "graphhopper" | "valhalla" | "mapbox" | "tomtom";

// `bboxKey` lega il campione a una cella geografica (~0.5°) e `score` allo score
// qualità calcolato nel dual-compare: insieme alimentano lo storico qualità
// per-bbox consumato dall'AI Routing Engine Selector (#3191).
interface Sample { ts: number; engine: Engine; outcome: "success" | "fallback" | "failure"; latencyMs?: number; bboxKey?: string; score?: number }
const SAMPLES_MAX = 1000;
const samples: Sample[] = [];
const consecutiveFailures: Partial<Record<Engine, number>> = {};
const enginesDown: Partial<Record<Engine, number>> = {}; // ts in cui è marcato down
const DOWN_THRESHOLD = 3; // 3 fallimenti consecutivi → engine considerato down

/** Metadati opzionali per legare un campione a una cella bbox e a uno score. */
export interface SampleMeta { bboxKey?: string; score?: number }

function push(s: Sample): void {
  samples.push(s);
  if (samples.length > SAMPLES_MAX) samples.shift();
}

/**
 * Chiave di cella geografica (~0.5° ≈ 50km) per lo storico qualità per-bbox.
 * Coordinate non finite → "unknown".
 */
export function bboxKeyOf(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "unknown";
  const cell = 0.5;
  const rl = Math.floor(lat / cell) * cell;
  const ro = Math.floor(lon / cell) * cell;
  return `${rl.toFixed(1)},${ro.toFixed(1)}`;
}

export function recordRoutingSuccess(engine: Engine, latencyMs?: number, meta?: SampleMeta): void {
  push({
    ts: Date.now(), engine, outcome: "success",
    ...(latencyMs !== undefined ? { latencyMs } : {}),
    ...(meta?.bboxKey ? { bboxKey: meta.bboxKey } : {}),
    ...(meta?.score !== undefined ? { score: meta.score } : {}),
  });
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

export function recordRoutingFailure(engine: Engine, meta?: SampleMeta): void {
  push({ ts: Date.now(), engine, outcome: "failure", ...(meta?.bboxKey ? { bboxKey: meta.bboxKey } : {}) });
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

export interface BboxEngineQuality {
  success: number;
  failure: number;
  avgLatencyMs: number | null;
  avgScore: number | null;
}

/**
 * Storico qualità per-engine ristretto a una cella bbox (finestra default 24h,
 * più lunga della finestra "salute" da 5min perché i campioni per-bbox sono
 * sparsi). Restituisce per ogni engine con campioni nella cella: successi,
 * fallimenti, latenza media e score qualità medio. Usato dall'AI Routing Engine
 * Selector per pesare la decisione su quella zona specifica.
 */
export function getBboxEngineQuality(
  bboxKey: string,
  windowMs: number = 24 * 60 * 60_000,
): Record<string, BboxEngineQuality> {
  const since = Date.now() - windowMs;
  const acc: Record<string, { success: number; failure: number; latSum: number; latN: number; scoreSum: number; scoreN: number }> = {};
  for (const s of samples) {
    if (s.ts < since || s.bboxKey !== bboxKey) continue;
    const a = acc[s.engine] ?? (acc[s.engine] = { success: 0, failure: 0, latSum: 0, latN: 0, scoreSum: 0, scoreN: 0 });
    if (s.outcome === "success") a.success++;
    else if (s.outcome === "failure") a.failure++;
    if (s.latencyMs !== undefined) { a.latSum += s.latencyMs; a.latN++; }
    if (s.score !== undefined) { a.scoreSum += s.score; a.scoreN++; }
  }
  const out: Record<string, BboxEngineQuality> = {};
  for (const e of Object.keys(acc)) {
    const a = acc[e];
    out[e] = {
      success: a.success,
      failure: a.failure,
      avgLatencyMs: a.latN ? Math.round(a.latSum / a.latN) : null,
      avgScore: a.scoreN ? Math.round((a.scoreSum / a.scoreN) * 100) / 100 : null,
    };
  }
  return out;
}

export function _resetRoutingMetricsForTests(): void {
  samples.length = 0;
  for (const k of Object.keys(consecutiveFailures)) delete consecutiveFailures[k as Engine];
  for (const k of Object.keys(enginesDown)) delete enginesDown[k as Engine];
}
