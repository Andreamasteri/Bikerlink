import type { Response } from "express";
import { haversineKm } from "../geo";
import { recordAiDecision } from "./ai-decision-log";
import { recordRoutingFallback, recordRoutingFailure, recordRoutingSuccess } from "./routing-metrics";
import { scoreRoute } from "./route-quality-score";
import { graphHopperRoute, type RouterSelectorOptions, type RouteRequest, type RouteResult } from "./router-selector";
import { calculateRoute as valhallaCalculateRoute } from "./valhalla-client";
import { decideEngineWithAI } from "./ai-engine-decider";

/** Somma delle distanze aeree (haversine) tra waypoint consecutivi. */
export function aerialKmOf(points: [number, number][]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    km += haversineKm(points[i - 1][1], points[i - 1][0], points[i][1], points[i][0]);
  }
  return km;
}

/**
 * Hook AI del selettore (#3191). Chiamato quando la modalità AI è attiva:
 * 1. Chiede al modello l'engine ottimale (timeout 800ms).
 * 2. Se confidence ≥ 0.6 → usa direttamente l'engine scelto (con i fallback esistenti).
 * 3. Se confidence < 0.6 → esegue entrambe le route in parallelo e sceglie quella
 *    con lo score qualità migliore per lo stile richiesto.
 * 4. Se l'AI non risponde / nessuna route riesce → ritorna null (il chiamante
 *    ricade sul selettore normale). Ogni esito viene loggato per il pannello admin.
 */
export async function aiOverride(
  req: RouteRequest,
  opts: RouterSelectorOptions,
  res?: Response,
): Promise<RouteResult | null> {
  const ctx = opts.aiContext;
  if (!ctx) return null;

  const started = Date.now();
  const decision = await decideEngineWithAI(ctx);

  if (!decision) {
    recordAiDecision({
      ts: Date.now(), mode: "fallback-smart", chosenEngine: opts.engine,
      confidence: null, reason: "AI non disponibile entro il timeout — selettore normale",
      provider: null, decisionLatencyMs: Date.now() - started, dualScores: null,
    });
    return null;
  }

  if (res && !res.headersSent) res.setHeader("X-Routing-Ai", decision.engine);

  // Confidence alta: usa l'engine scelto direttamente.
  if (decision.confidence >= 0.6) {
    recordAiDecision({
      ts: Date.now(), mode: "ai-direct", chosenEngine: decision.engine,
      confidence: decision.confidence, reason: decision.reason, provider: decision.provider,
      decisionLatencyMs: Date.now() - started, dualScores: null,
    });
    // Manual inline of routeViaValhallaWithFallback logic but without re-import cycles if possible
    // For simplicity, we assume the main file handles complex fallbacks or we just call them
    if (decision.engine === "valhalla") {
      // We can't easily call routeViaValhallaWithFallback if it's in the main file and depends on us
      // But in this case, the main file exports it.
      const { routeViaValhallaWithFallback } = await import("./router-selector");
      return routeViaValhallaWithFallback(req, opts.isMapTester, res);
    }
    return graphHopperRoute(req, opts.isMapTester);
  }

  // Confidence bassa: confronto a doppia route + score qualità.
  const aerialKm = aerialKmOf(req.points);
  const scoreReq: RouteRequest = { ...req, details: Array.from(new Set([...(req.details ?? []), "road_class"])) };
  const timed = async (fn: () => Promise<RouteResult>): Promise<{ result: RouteResult; latencyMs: number }> => {
    const t0 = Date.now();
    const result = await fn();
    return { result, latencyMs: Date.now() - t0 };
  };
  const [gh, val] = await Promise.allSettled([
    timed(() => graphHopperRoute(scoreReq, opts.isMapTester)),
    timed(() => valhallaCalculateRoute(scoreReq)),
  ]);

  const candidates: Array<{ engine: "graphhopper" | "valhalla"; result: RouteResult; score: number }> = [];
  if (gh.status === "fulfilled") {
    const score = scoreRoute(gh.value.result, aerialKm, ctx.style).score;
    candidates.push({ engine: "graphhopper", result: gh.value.result, score });
    recordRoutingSuccess("graphhopper", gh.value.latencyMs, { bboxKey: ctx.bboxKey, score });
  } else {
    recordRoutingFailure("graphhopper", { bboxKey: ctx.bboxKey });
  }
  if (val.status === "fulfilled") {
    const score = scoreRoute(val.value.result, aerialKm, ctx.style).score;
    candidates.push({ engine: "valhalla", result: val.value.result, score });
    recordRoutingSuccess("valhalla", val.value.latencyMs, { bboxKey: ctx.bboxKey, score });
  } else {
    recordRoutingFailure("valhalla", { bboxKey: ctx.bboxKey });
  }

  if (candidates.length === 0) {
    recordAiDecision({
      ts: Date.now(), mode: "fallback-smart", chosenEngine: opts.engine,
      confidence: decision.confidence, reason: `${decision.reason} — entrambe le route hanno fallito`,
      provider: decision.provider, decisionLatencyMs: Date.now() - started, dualScores: null,
    });
    return null;
  }

  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];
  if (res && !res.headersSent) res.setHeader("X-Routing-Ai-Compare", winner.engine);
  recordAiDecision({
    ts: Date.now(), mode: "ai-dual-compare", chosenEngine: winner.engine,
    confidence: decision.confidence, reason: decision.reason, provider: decision.provider,
    decisionLatencyMs: Date.now() - started,
    dualScores: Object.fromEntries(candidates.map((c) => [c.engine, Math.round(c.score * 100) / 100])),
  });
  return winner.result;
}
