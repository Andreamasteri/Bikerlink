import type { Response } from "express";
import type { MapsRollout, RoutingEngineId } from "@shared/maps-config";
import { ARCHIVED_ROUTING_ENGINES } from "@shared/maps-config";
import { routeViaGraphHopper, type RouteRequest, type RouteResult } from "./graphhopper-adapter";
import { calculateRoute as valhallaCalculateRoute } from "./valhalla-client";
import { calculateRoute as mapboxCalculateRoute } from "./mapbox-directions-client";
import { calculateRoute as tomtomCalculateRoute } from "./tomtom-routing-client";
import { checkQuota } from "./mapbox/quota-guard";
import { checkQuota as checkTomTomQuota } from "./tomtom/quota-guard";
import { recordRoutingFallback, recordRoutingFailure, recordRoutingSuccess } from "./routing-metrics";
import { isRoutingEnabled } from "./routing-kill-switch";
import { isAreaRoutingActive } from "./routing-area-mode";
import { resolveRoutingArea } from "./routing-area-resolver";
import { ROUTING_AREA_OUTCOMES, findRoutingAreasForPoint, type RoutingAreaCode } from "@shared/routing-areas";
import { decideEngineWithAI, type AiRoutingContext } from "./ai-engine-decider";
import { scoreRoute } from "./route-quality-score";
import { recordAiDecision } from "./ai-decision-log";
import { recordPipelineEvent, type PipelineOutcome } from "./routing-pipeline-log";
import { haversineKm } from "../geo";

/** Errore lanciato quando il routing è disabilitato dal kill-switch (admin/env). */
export class RoutingDisabledError extends Error {
  constructor() {
    super("Routing disabilitato dal kill-switch.");
    this.name = "RoutingDisabledError";
  }
}

/**
 * Errore: i waypoint non condividono una singola area di routing (rotta tra
 * gruppi diversi). Esito bloccante quando il routing ad aree è attivo.
 */
export class CrossGroupRoutingError extends Error {
  readonly code = ROUTING_AREA_OUTCOMES.CROSS_GROUP;
  constructor(public readonly codes: RoutingAreaCode[]) {
    super(`Routing tra gruppi diversi: ${codes.join(", ") || "nessun gruppo comune"}`);
    this.name = "CrossGroupRoutingError";
  }
}

/**
 * Errore: l'area del punto di partenza non è abilitata/coperta. Esito bloccante
 * quando il routing ad aree è attivo.
 */
export class AreaNotEnabledError extends Error {
  readonly code = ROUTING_AREA_OUTCOMES.AREA_NOT_ENABLED;
  constructor(public readonly areaCode: RoutingAreaCode | null) {
    super(`Area di routing non abilitata${areaCode ? `: ${areaCode}` : ""}`);
    this.name = "AreaNotEnabledError";
  }
}

/**
 * Instrada la richiesta verso GraphHopper applicando il routing ad aree quando
 * attivo: risolve l'istanza per-area e lancia un errore tipizzato sugli esiti
 * bloccanti. Con routing ad aree disattivo si comporta come prima (istanza
 * globale unica) — impatto zero sul comportamento storico.
 */
export async function graphHopperRoute(req: RouteRequest, isMapTester: boolean): Promise<RouteResult> {
  if (await isAreaRoutingActive(isMapTester)) {
    const resolution = await resolveRoutingArea(req.points);
    if (resolution.kind === ROUTING_AREA_OUTCOMES.CROSS_GROUP) {
      throw new CrossGroupRoutingError(resolution.codes);
    }
    if (resolution.kind === ROUTING_AREA_OUTCOMES.AREA_NOT_ENABLED) {
      throw new AreaNotEnabledError(resolution.area?.codice ?? null);
    }
    return routeViaGraphHopper(req, resolution.url);
  }
  return routeViaGraphHopper(req);
}

export interface RouterSelectorOptions {
  rollout: MapsRollout;
  engine: RoutingEngineId;
  isMapTester: boolean;
  /** Modalità AI attiva (maps_routing_engine === "ai"). */
  aiMode?: boolean;
  /** Contesto per il decider AI; presente solo quando aiMode è true. */
  aiContext?: AiRoutingContext;
}

type MetricsEngine = "graphhopper" | "valhalla" | "mapbox" | "tomtom";

/**
 * Esegue `fn` registrando metriche di esito + latenza. Se la richiesta è stata
 * servita via fallback (header X-Routing-Fallback impostato dalle funzioni
 * routeViaXxxWithFallback), il successo è attribuito all'engine di destinazione.
 */
async function wrapMetrics(
  engine: MetricsEngine,
  fn: () => Promise<RouteResult>,
  res?: Response,
  bboxKey?: string,
): Promise<RouteResult> {
  const meta = bboxKey ? { bboxKey } : undefined;
  const started = Date.now();
  try {
    const out = await fn();
    const latency = Date.now() - started;
    const fallbackTo = res?.getHeader("X-Routing-Fallback");
    if (typeof fallbackTo === "string" && fallbackTo.length > 0) {
      recordRoutingSuccess(fallbackTo as MetricsEngine, latency, meta);
    } else {
      recordRoutingSuccess(engine, latency, meta);
    }
    return out;
  } catch (err) {
    recordRoutingFailure(engine, meta);
    throw err;
  }
}

function isNewEngineEnabled(opts: RouterSelectorOptions): boolean {
  if (opts.rollout === "disabled") return false;
  if (opts.rollout === "tester" && !opts.isMapTester) return false;
  return true;
}

/**
 * Determina se l'errore Valhalla giustifica il fallback a GraphHopper.
 */
function isTransientValhallaError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);
  if (name === "AbortError") return true;
  if (err instanceof TypeError) return true;
  if (msg.includes("VALHALLA_URL non configurato")) return true;
  if (/Valhalla \/route error [45]\d{2}/.test(msg)) return true;
  if (/Valhalla \/trace_attributes error [45]\d{2}/.test(msg)) return true;
  if (msg.startsWith("Valhalla: ")) return true;
  return false;
}

/**
 * Determina se l'errore Mapbox giustifica il fallback a GraphHopper.
 * Fallback su: qualsiasi errore HTTP (4xx + 5xx), timeout (AbortError),
 * errori di rete (TypeError), token non configurato.
 * Il task richiede fallback su 4xx/5xx/timeout — tutti i casi HTTP sono inclusi.
 */
function isTransientMapboxError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);
  if (name === "AbortError") return true;
  if (err instanceof TypeError) return true;
  if (msg.includes("MAPBOX_ACCESS_TOKEN non configurato")) return true;
  if (/Mapbox Directions error \d{3}/.test(msg)) return true;
  if (msg.startsWith("Mapbox: ")) return true;
  return false;
}

/**
 * Tenta il routing via Valhalla con fallback automatico a GraphHopper.
 */
async function routeViaValhallaWithFallback(
  req: RouteRequest,
  isMapTester: boolean,
  res?: Response
): Promise<RouteResult> {
  try {
    return await valhallaCalculateRoute(req);
  } catch (err: unknown) {
    if (!isTransientValhallaError(err)) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[RouterSelector] Valhalla fallito (${msg}) — fallback a GraphHopper`);
    if (res && !res.headersSent) {
      res.setHeader("X-Routing-Fallback", "graphhopper");
    }
    recordRoutingFallback("valhalla", "graphhopper");
    return graphHopperRoute(req, isMapTester);
  }
}

/**
 * Tenta il routing via Mapbox con fallback automatico a GraphHopper.
 * Verifica la quota PRIMA di chiamare Mapbox: se esaurita, fallback preventivo.
 * Qualsiasi errore HTTP (4xx/5xx), timeout o errore di rete causa fallback.
 */
async function routeViaMapboxWithFallback(
  req: RouteRequest,
  isMapTester: boolean,
  res?: Response
): Promise<RouteResult> {
  const quota = await checkQuota();
  if (!quota.ok) {
    const msg = `Mapbox quota esaurita (${quota.used}/${quota.limit}) — fallback preventivo a GraphHopper`;
    console.warn(`[RouterSelector] ${msg}`);
    if (res && !res.headersSent) {
      res.setHeader("X-Routing-Fallback", "graphhopper");
    }
    return graphHopperRoute(req, isMapTester);
  }

  try {
    return await mapboxCalculateRoute(req);
  } catch (err: unknown) {
    if (!isTransientMapboxError(err)) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[RouterSelector] Mapbox fallito (${msg}) — fallback a GraphHopper`);
    if (res && !res.headersSent) {
      res.setHeader("X-Routing-Fallback", "graphhopper");
    }
    recordRoutingFallback("mapbox", "graphhopper");
    return graphHopperRoute(req, isMapTester);
  }
}

/**
 * Determina se l'errore TomTom giustifica il fallback a GraphHopper.
 * Fallback su: qualsiasi errore HTTP (4xx + 5xx), timeout, errori di rete,
 * chiave non configurata.
 */
function isTransientTomTomError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);
  if (name === "AbortError") return true;
  if (err instanceof TypeError) return true;
  if (msg.includes("TOMTOM_API_KEY non configurato")) return true;
  if (/TomTom Routing error \d{3}/.test(msg)) return true;
  if (msg.startsWith("TomTom: ")) return true;
  return false;
}

/**
 * Tenta il routing via TomTom con fallback automatico a GraphHopper.
 * Verifica la quota PRIMA di chiamare TomTom: se esaurita, fallback preventivo.
 */
async function routeViaTomTomWithFallback(
  req: RouteRequest,
  isMapTester: boolean,
  res?: Response
): Promise<RouteResult> {
  const quota = await checkTomTomQuota();
  if (!quota.ok) {
    const msg = `TomTom quota esaurita (${quota.used}/${quota.limit}) — fallback preventivo a GraphHopper`;
    console.warn(`[RouterSelector] ${msg}`);
    if (res && !res.headersSent) {
      res.setHeader("X-Routing-Fallback", "graphhopper");
    }
    return graphHopperRoute(req, isMapTester);
  }

  try {
    return await tomtomCalculateRoute(req);
  } catch (err: unknown) {
    if (!isTransientTomTomError(err)) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[RouterSelector] TomTom fallito (${msg}) — fallback a GraphHopper`);
    if (res && !res.headersSent) {
      res.setHeader("X-Routing-Fallback", "graphhopper");
    }
    recordRoutingFallback("tomtom", "graphhopper");
    return graphHopperRoute(req, isMapTester);
  }
}

/**
 * Wrapper pubblico del selettore: esegue il dispatch e registra l'esito nel
 * ring buffer "Coordinamento Engine" (#3557) — area GH risolta dalle coordinate,
 * engine selezionato vs usato, motivo del fallback/errore, latenza ed esito.
 * Il RoutingDisabledError non viene registrato (non è un evento di dispatch).
 */
export async function getActiveRouter(
  req: RouteRequest,
  opts: RouterSelectorOptions,
  res?: Response,
  geocodingOk?: boolean,
): Promise<RouteResult> {
  const started = Date.now();
  try {
    const result = await getActiveRouterInner(req, opts, res);
    recordPipelineOutcome(req, opts, res, Date.now() - started, null, geocodingOk ?? true);
    return result;
  } catch (err) {
    recordPipelineOutcome(req, opts, res, Date.now() - started, err, geocodingOk ?? true);
    throw err;
  }
}

/** Registra un evento pipeline a partire dall'esito del dispatch. */
function recordPipelineOutcome(
  req: RouteRequest,
  opts: RouterSelectorOptions,
  res: Response | undefined,
  latencyMs: number,
  err: unknown,
  geocodingOk: boolean,
): void {
  if (err instanceof RoutingDisabledError) return;

  const start = req.points?.[0];
  const areaCode: RoutingAreaCode | null = start
    ? (findRoutingAreasForPoint(start[1], start[0])[0]?.codice ?? null)
    : null;

  const engineSelected = req.profile === "auto_curvy"
    ? "valhalla"
    : (opts.aiMode ? "ai" : opts.engine);

  const fallbackHeader = res?.getHeader("X-Routing-Fallback");
  const aiCompareHeader = res?.getHeader("X-Routing-Ai-Compare");
  const aiDirectHeader = res?.getHeader("X-Routing-Ai");
  const fallbackTarget = typeof fallbackHeader === "string" && fallbackHeader ? fallbackHeader : null;
  const aiCompare = typeof aiCompareHeader === "string" && aiCompareHeader ? aiCompareHeader : null;
  const aiDirect = typeof aiDirectHeader === "string" && aiDirectHeader ? aiDirectHeader : null;

  // Engine "previsto" prima dell'eventuale fallback: vince la scelta AI, poi
  // l'engine selezionato (in modalità AI senza header esplicito si assume GH).
  const intendedEngine = aiCompare ?? aiDirect ?? (engineSelected === "ai" ? "graphhopper" : engineSelected);

  let outcome: PipelineOutcome;
  let engineUsed: string;
  let fallbackReason: string | null = null;
  let error: string | null = null;
  if (err) {
    outcome = "error";
    engineUsed = intendedEngine;
    error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
  } else if (fallbackTarget) {
    outcome = "fallback";
    engineUsed = fallbackTarget;
    fallbackReason = `${intendedEngine} non disponibile → ${fallbackTarget}`;
  } else {
    outcome = "ok";
    engineUsed = intendedEngine;
  }

  recordPipelineEvent({
    ts: Date.now(),
    areaCode,
    engineSelected,
    engineUsed,
    fallbackReason,
    latencyMs,
    geocodingOk,
    outcome,
    error,
  });
}

async function getActiveRouterInner(
  req: RouteRequest,
  opts: RouterSelectorOptions,
  res?: Response
): Promise<RouteResult> {
  if (!(await isRoutingEnabled())) {
    throw new RoutingDisabledError();
  }

  // Profilo "auto panoramica" (auto_curvy): instradato SEMPRE a Valhalla con
  // costing `auto` panoramico, senza fallback a GraphHopper. Se Valhalla è down,
  // l'errore propaga e l'endpoint mostra un avviso esplicito — GH Cloud farebbe
  // solo un percorso diretto car, non panoramico, quindi NON degradiamo.
  if (req.profile === "auto_curvy") {
    return wrapMetrics("valhalla", () => valhallaCalculateRoute(req), res);
  }

  if (!isNewEngineEnabled(opts)) {
    return wrapMetrics("graphhopper", () => graphHopperRoute(req, opts.isMapTester), res);
  }

  // Engine archiviati (es. mapbox-directions, ai): ignorati completamente anche se
  // impostati nel DB — fallback silenzioso a GraphHopper. Questo guard è PRIMA
  // della modalità AI: quando il DB contiene "ai" e aiMode=true, opts.engine è il
  // safe-default (graphhopper) — non "ai" — quindi controlliamo esplicitamente anche
  // il flag aiMode per evitare che l'AI path venga comunque eseguito.
  const aiEngineArchived = opts.aiMode && ARCHIVED_ROUTING_ENGINES.has("ai" as import("@shared/maps-config").RoutingEngineId);
  if (ARCHIVED_ROUTING_ENGINES.has(opts.engine) || aiEngineArchived) {
    const archivedName = aiEngineArchived ? "ai" : opts.engine;
    console.warn(`[RouterSelector] Engine archiviato "${archivedName}" ignorato — fallback a GraphHopper`);
    if (res && !res.headersSent) res.setHeader("X-Routing-Fallback", "graphhopper");
    return wrapMetrics("graphhopper", () => graphHopperRoute(req, opts.isMapTester), res);
  }

  // Modalità AI: un modello sceglie l'engine ottimale. Se l'AI non risponde
  // entro il timeout (o non sceglie), aiOverride ritorna null e si ricade sulla
  // logica normale sotto (opts.engine, che in modalità AI è il safe default).
  if (opts.aiMode && opts.aiContext) {
    const aiResult = await aiOverride(req, opts, res);
    if (aiResult) return aiResult;
  }

  if (opts.engine === "valhalla") return wrapMetrics("valhalla", () => routeViaValhallaWithFallback(req, opts.isMapTester, res), res);
  if (opts.engine === "tomtom") return wrapMetrics("tomtom", () => routeViaTomTomWithFallback(req, opts.isMapTester, res), res);
  return wrapMetrics("graphhopper", () => graphHopperRoute(req, opts.isMapTester), res);
}

/** Somma delle distanze aeree (haversine) tra waypoint consecutivi. */
function aerialKmOf(points: [number, number][]): number {
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
    if (decision.engine === "valhalla") {
      return wrapMetrics("valhalla", () => routeViaValhallaWithFallback(req, opts.isMapTester, res), res, ctx.bboxKey);
    }
    return wrapMetrics("graphhopper", () => graphHopperRoute(req, opts.isMapTester), res, ctx.bboxKey);
  }

  // Confidence bassa: confronto a doppia route + score qualità. Usiamo gli engine
  // GREZZI (no fallback cross-engine): un fallback Valhalla→GraphHopper renderebbe
  // i due candidati identici e falserebbe lo score/attribuzione. Se un engine
  // grezzo fallisce, viene semplicemente escluso dai candidati. Misuriamo la
  // latenza di OGNI engine separatamente e registriamo l'esito di OGNI candidato
  // (non solo del vincitore): la latenza del vincitore NON deve includere
  // l'overhead AI+confronto, altrimenti i segnali salute/latenza si falsano.
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

export async function resolveActiveEngine(opts: RouterSelectorOptions): Promise<RoutingEngineId> {
  if (opts.aiMode) return "ai";
  if (!isNewEngineEnabled(opts)) return "graphhopper";
  return opts.engine;
}
