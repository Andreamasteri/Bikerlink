import type { Response } from "express";
import type { MapsRollout, RoutingEngineId } from "@shared/maps-config";
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
import { ROUTING_AREA_OUTCOMES, type RoutingAreaCode } from "@shared/routing-areas";

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
async function graphHopperRoute(req: RouteRequest, isMapTester: boolean): Promise<RouteResult> {
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

interface RouterSelectorOptions {
  rollout: MapsRollout;
  engine: RoutingEngineId;
  isMapTester: boolean;
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
  if (/Valhalla \/route error 5\d{2}/.test(msg)) return true;
  if (/Valhalla \/trace_attributes error 5\d{2}/.test(msg)) return true;
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
 * Seleziona e invoca l'engine di routing attivo.
 * @param req    Parametri della richiesta di routing
 * @param opts   Configurazione rollout + engine
 * @param res    Risposta Express opzionale — usata per impostare X-Routing-Fallback
 */
export async function getActiveRouter(
  req: RouteRequest,
  opts: RouterSelectorOptions,
  res?: Response
): Promise<RouteResult> {
  if (!(await isRoutingEnabled())) {
    throw new RoutingDisabledError();
  }

  const wrapMetrics = async (
    engine: "graphhopper" | "valhalla" | "mapbox" | "tomtom",
    fn: () => Promise<RouteResult>,
  ): Promise<RouteResult> => {
    try {
      const out = await fn();
      // Se la richiesta è stata servita tramite fallback (header impostato dalle
      // funzioni routeViaXxxWithFallback), `recordRoutingFallback` per l'engine
      // originale è già stato registrato — qui contiamo il successo per
      // l'engine di destinazione (GraphHopper) e NON per quello originale.
      const fallbackTo = res?.getHeader("X-Routing-Fallback");
      if (typeof fallbackTo === "string" && fallbackTo.length > 0) {
        recordRoutingSuccess(fallbackTo as "graphhopper" | "valhalla" | "mapbox" | "tomtom");
      } else {
        recordRoutingSuccess(engine);
      }
      return out;
    } catch (err) {
      recordRoutingFailure(engine);
      throw err;
    }
  };

  if (!isNewEngineEnabled(opts)) {
    return wrapMetrics("graphhopper", () => graphHopperRoute(req, opts.isMapTester));
  }
  if (opts.engine === "valhalla") return wrapMetrics("valhalla", () => routeViaValhallaWithFallback(req, opts.isMapTester, res));
  if (opts.engine === "mapbox-directions") return wrapMetrics("mapbox", () => routeViaMapboxWithFallback(req, opts.isMapTester, res));
  if (opts.engine === "tomtom") return wrapMetrics("tomtom", () => routeViaTomTomWithFallback(req, opts.isMapTester, res));
  return wrapMetrics("graphhopper", () => graphHopperRoute(req, opts.isMapTester));
}

export async function resolveActiveEngine(opts: RouterSelectorOptions): Promise<RoutingEngineId> {
  if (!isNewEngineEnabled(opts)) return "graphhopper";
  return opts.engine;
}
