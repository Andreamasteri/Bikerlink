// Task #23 — Sonde di CORRETTEZZA del routing (namespace Horus).
//
// A differenza di maps-health-checks (raggiungibilità: /health o /status → online sì/no),
// queste sonde eseguono una VERA richiesta di routing/geocoding e ne validano la
// plausibilità: geometria presente, distanza/durata coerenti con la linea d'aria,
// nessun errore silenzioso (200 con corpo vuoto/incoerente).
//
// Le chiamate passano dai client reali (graphHopperRoute / valhallaCalculateRoute) così
// da testare il vero percorso codice; questi client NON registrano metriche di produzione
// né eventi pipeline (quelli stanno nel selector), quindi le sonde non falsano i cruscotti.
// Risultati cachati ~4 min per non martellare i motori dal collector che gira ogni 60s.

import { haversineKm } from "../../geo";
import { graphHopperRoute } from "../../routing/router-selector";
import { calculateRoute as valhallaCalculateRoute } from "../../routing/valhalla-client";
import type { RouteRequest } from "../../routing/router-selector";
import { cfAccessHeaders } from "../../lib/cf-access";
import { isThinkCentrePoweredOff } from "../../lib/thinkcentre-powered-off";
import { isThinkCentreInMaintenance } from "../../lib/thinkcentre-maintenance";
import {
  measureRouteResult,
  validateRoutePlausibility,
  measurePhotonResponse,
  validateGeocodePlausibility,
} from "../../routing/route-plausibility";
import { getRoutingCounters } from "../../routing/routing-metrics";
import { getPipelineSummary } from "../../routing/routing-pipeline-log";

export type CorrectnessEngine = "graphhopper" | "valhalla" | "photon" | "pipeline";
export type CorrectnessSeverity = "info" | "warn" | "high" | "critical";

export interface CorrectnessProbeResult {
  engine: CorrectnessEngine;
  /** false se il motore non è configurato (env assente) → sonda saltata, non un errore. */
  configured: boolean;
  /** Rete OK + risposta 2xx. */
  reachable: boolean;
  /** Corpo della risposta valido/coerente. */
  plausible: boolean;
  /** reachable && plausible (oppure derivato, per la pipeline). */
  ok: boolean;
  /** true se la sonda è stata saltata (TC spento/manutenzione). */
  skipped: boolean;
  latencyMs: number | null;
  distanceKm: number | null;
  durationMin: number | null;
  reason: string | null;
  severity: CorrectnessSeverity;
  detail?: Record<string, unknown>;
}

// Milano centro → Como centro (~40km in linea d'aria): rotta breve, sempre coperta.
const ROUTE_PROBE_POINTS: Array<[number, number]> = [
  [9.19, 45.4642],
  [9.0852, 45.8081],
];
const PHOTON_QUERY = "Roma";
const PHOTON_EXPECTED = { lat: 41.9028, lon: 12.4964, tolKm: 80 };
const PROBE_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 4 * 60_000;

function aerialKm(): number {
  const [a, b] = ROUTE_PROBE_POINTS;
  return haversineKm(a[1], a[0], b[1], b[0]);
}

/** Avvolge una promise con un timeout, per non lasciare la sonda appesa. */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function notConfigured(engine: CorrectnessEngine): CorrectnessProbeResult {
  return {
    engine, configured: false, reachable: false, plausible: false, ok: false,
    skipped: false, latencyMs: null, distanceKm: null, durationMin: null,
    reason: "non configurato", severity: "info",
  };
}

function skipped(engine: CorrectnessEngine): CorrectnessProbeResult {
  return {
    engine, configured: true, reachable: false, plausible: false, ok: false,
    skipped: true, latencyMs: null, distanceKm: null, durationMin: null,
    reason: "ThinkCentre spento/in manutenzione — sonda saltata", severity: "info",
  };
}

async function probeRouteEngine(
  engine: "graphhopper" | "valhalla",
  call: (req: RouteRequest) => Promise<unknown>,
): Promise<CorrectnessProbeResult> {
  const req: RouteRequest = {
    points: ROUTE_PROBE_POINTS,
    profile: "motorcycle",
    instructions: false,
    calc_points: true,
    points_encoded: false,
  };
  const started = Date.now();
  try {
    const result = await withTimeout(call(req), PROBE_TIMEOUT_MS, engine);
    const latencyMs = Date.now() - started;
    const m = measureRouteResult(result);
    const v = validateRoutePlausibility(aerialKm(), m);
    return {
      engine, configured: true, reachable: true, plausible: v.plausible,
      ok: v.plausible, skipped: false, latencyMs,
      distanceKm: v.distanceKm != null ? Math.round(v.distanceKm * 10) / 10 : null,
      durationMin: v.durationMin != null ? Math.round(v.durationMin) : null,
      reason: v.plausible ? null : `risultato non plausibile: ${v.reason}`,
      severity: v.plausible ? "info" : "high",
      detail: { impliedKmh: v.impliedKmh, coordCount: m.coordCount, aerialKm: Math.round(aerialKm()) },
    };
  } catch (err) {
    return {
      engine, configured: true, reachable: false, plausible: false, ok: false,
      skipped: false, latencyMs: null, distanceKm: null, durationMin: null,
      reason: `richiesta fallita: ${(err as Error).message?.slice(0, 160) ?? "errore"}`,
      severity: "critical",
    };
  }
}

async function probeGraphHopperCorrectness(): Promise<CorrectnessProbeResult> {
  if (!process.env.GRAPHHOPPER_URL) return notConfigured("graphhopper");
  return probeRouteEngine("graphhopper", (req) => graphHopperRoute(req, false));
}

async function probeValhallaCorrectness(): Promise<CorrectnessProbeResult> {
  if (!process.env.VALHALLA_URL) return notConfigured("valhalla");
  return probeRouteEngine("valhalla", (req) => valhallaCalculateRoute(req));
}

async function probePhotonCorrectness(): Promise<CorrectnessProbeResult> {
  const base = process.env.PHOTON_URL?.replace(/\/$/, "");
  if (!base) return notConfigured("photon");
  // Photon supporta solo lang=default/de/en/fr (it→400): usiamo default (nomi nativi).
  const url = `${base}/api?q=${encodeURIComponent(PHOTON_QUERY)}&limit=1&lang=default`;
  const headers: Record<string, string> = { ...cfAccessHeaders() };
  if (process.env.PHOTON_TOKEN) headers["X-Photon-Token"] = process.env.PHOTON_TOKEN;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  const started = Date.now();
  try {
    const resp = await fetch(url, { method: "GET", headers, signal: ctrl.signal });
    const latencyMs = Date.now() - started;
    if (!resp.ok) {
      return {
        engine: "photon", configured: true, reachable: false, plausible: false, ok: false,
        skipped: false, latencyMs, distanceKm: null, durationMin: null,
        reason: `HTTP ${resp.status}`, severity: "critical",
      };
    }
    const body = await resp.json().catch(() => null);
    const m = measurePhotonResponse(body);
    const v = validateGeocodePlausibility(m, { expected: PHOTON_EXPECTED, distanceKm: haversineKm });
    return {
      engine: "photon", configured: true, reachable: true, plausible: v.plausible,
      ok: v.plausible, skipped: false, latencyMs, distanceKm: null, durationMin: null,
      reason: v.plausible ? null : `geocoding non plausibile: ${v.reason}`,
      severity: v.plausible ? "info" : "high",
      detail: { featureCount: v.featureCount, firstLat: v.firstLat, firstLon: v.firstLon },
    };
  } catch (err) {
    return {
      engine: "photon", configured: true, reachable: false, plausible: false, ok: false,
      skipped: false, latencyMs: null, distanceKm: null, durationMin: null,
      reason: `richiesta fallita: ${(err as Error).message?.slice(0, 160) ?? "errore"}`,
      severity: "critical",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sonda della PIPELINE COMBINATA (read-only, derivata — nessuna chiamata a rete).
 * Verifica il comportamento di fallback Valhalla→GraphHopper e l'esito aggregato
 * dual-route incrociando le sonde single-engine con l'evidenza del traffico reale
 * (contatori routing + log pipeline). Esposta come funzione pura per i test.
 */
export function derivePipelineCorrectness(
  gh: CorrectnessProbeResult,
  valhalla: CorrectnessProbeResult,
  counters: ReturnType<typeof getRoutingCounters>,
  pipeline: ReturnType<typeof getPipelineSummary>,
): CorrectnessProbeResult {
  const ghUp = gh.configured && gh.ok;
  const valhallaUp = valhalla.configured && valhalla.ok;
  const anyConfigured = gh.configured || valhalla.configured;

  const detail: Record<string, unknown> = {
    graphhopper: gh.configured ? (gh.ok ? "ok" : gh.skipped ? "skipped" : "ko") : "n/a",
    valhalla: valhalla.configured ? (valhalla.ok ? "ok" : valhalla.skipped ? "skipped" : "ko") : "n/a",
    traffic: { successes: counters.successes, fallbacks: counters.fallbacks, failures: counters.failures },
    pipelineLog: { total: pipeline.total, ok: pipeline.ok, fallback: pipeline.fallback, error: pipeline.error },
  };

  if (!anyConfigured) {
    return {
      engine: "pipeline", configured: false, reachable: false, plausible: false, ok: false,
      skipped: false, latencyMs: null, distanceKm: null, durationMin: null,
      reason: "nessun motore self-hosted configurato", severity: "info", detail,
    };
  }
  if (gh.skipped || valhalla.skipped) {
    return {
      engine: "pipeline", configured: true, reachable: false, plausible: false, ok: false,
      skipped: true, latencyMs: null, distanceKm: null, durationMin: null,
      reason: "ThinkCentre spento/in manutenzione — pipeline non valutata", severity: "info", detail,
    };
  }

  // Nessun motore serve percorsi corretti → pipeline rotta.
  if (!ghUp && !valhallaUp) {
    return {
      engine: "pipeline", configured: true, reachable: false, plausible: false, ok: false,
      skipped: false, latencyMs: null, distanceKm: null, durationMin: null,
      reason: "nessun motore restituisce percorsi corretti (fallback impossibile)",
      severity: "critical", detail,
    };
  }

  // Valhalla giù ma GH su: il fallback Valhalla→GH copre → funzionale ma degradato.
  if (!valhallaUp && ghUp) {
    return {
      engine: "pipeline", configured: true, reachable: true, plausible: true, ok: true,
      skipped: false, latencyMs: null, distanceKm: null, durationMin: null,
      reason: "Valhalla non corretto — servito via fallback GraphHopper",
      severity: "warn", detail,
    };
  }

  // Failure rate elevato nel traffico reale nonostante i motori sondati OK.
  const total = counters.successes + counters.failures;
  if (total >= 10 && counters.failures / total > 0.3) {
    return {
      engine: "pipeline", configured: true, reachable: true, plausible: true, ok: false,
      skipped: false, latencyMs: null, distanceKm: null, durationMin: null,
      reason: `tasso di errore reale elevato (${counters.failures}/${total}) nonostante i motori sondati OK`,
      severity: "high", detail,
    };
  }

  return {
    engine: "pipeline", configured: true, reachable: true, plausible: true, ok: true,
    skipped: false, latencyMs: null, distanceKm: null, durationMin: null,
    reason: null, severity: "info", detail,
  };
}

let lastRunAt = 0;
let cachedResults: CorrectnessProbeResult[] = [];

/**
 * Esegue tutte le sonde di correttezza (cachate ~4 min). Salta le sonde
 * self-hosted quando il ThinkCentre è spento o in manutenzione.
 */
export async function runRoutingCorrectnessProbes(force = false): Promise<CorrectnessProbeResult[]> {
  const now = Date.now();
  if (!force && now - lastRunAt < CACHE_TTL_MS && cachedResults.length > 0) {
    return cachedResults;
  }

  const [poweredOff, inMaintenance] = await Promise.all([
    isThinkCentrePoweredOff().catch(() => false),
    isThinkCentreInMaintenance().catch(() => false),
  ]);
  const skipSelfHosted = poweredOff || inMaintenance;

  let gh: CorrectnessProbeResult;
  let valhalla: CorrectnessProbeResult;
  let photon: CorrectnessProbeResult;

  if (skipSelfHosted) {
    gh = process.env.GRAPHHOPPER_URL ? skipped("graphhopper") : notConfigured("graphhopper");
    valhalla = process.env.VALHALLA_URL ? skipped("valhalla") : notConfigured("valhalla");
    photon = process.env.PHOTON_URL ? skipped("photon") : notConfigured("photon");
  } else {
    // ≤3 sonde di rete in parallelo (nessuna query DB globale in Promise.all).
    [gh, valhalla, photon] = await Promise.all([
      probeGraphHopperCorrectness(),
      probeValhallaCorrectness(),
      probePhotonCorrectness(),
    ]);
  }

  const counters = getRoutingCounters();
  const pipeline = getPipelineSummary();
  const pipelineResult = derivePipelineCorrectness(gh, valhalla, counters, pipeline);

  cachedResults = [gh, valhalla, photon, pipelineResult];
  lastRunAt = now;
  return cachedResults;
}

export function getLastCorrectnessResults(): { at: number; results: CorrectnessProbeResult[] } {
  return { at: lastRunAt, results: cachedResults };
}

/** Solo per i test: azzera la cache delle sonde. */
export function _resetCorrectnessProbesForTests(): void {
  lastRunAt = 0;
  cachedResults = [];
}
