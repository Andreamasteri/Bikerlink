import type { Response } from "express";
import type { MapsRollout, RoutingEngineId } from "@shared/maps-config";
import { routeViaGraphHopper, type RouteRequest, type RouteResult } from "./graphhopper-adapter";
import { calculateRoute as valhallaCalculateRoute } from "./valhalla-client";

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
 * Fallback su: 5xx, timeout (AbortError), errori di rete/trasporto (TypeError
 * da fetch — DNS failure, ECONNREFUSED, ENOTFOUND), VALHALLA_URL non
 * configurato, errori di mapping della risposta.
 * Gli errori 4xx (richiesta malformata lato client) vengono rilanciati.
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
 * Tenta il routing via Valhalla con fallback automatico a GraphHopper.
 * Fallback attivato su: 5xx, timeout, VALHALLA_URL non configurato,
 * errori di parsing risposta.
 * Errori 4xx sono rilasciati senza fallback (bad request).
 */
async function routeViaValhallaWithFallback(
  req: RouteRequest,
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
    return routeViaGraphHopper(req);
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
  if (!isNewEngineEnabled(opts)) {
    return routeViaGraphHopper(req);
  }

  if (opts.engine === "valhalla") {
    return routeViaValhallaWithFallback(req, res);
  }

  return routeViaGraphHopper(req);
}

export async function resolveActiveEngine(opts: RouterSelectorOptions): Promise<RoutingEngineId> {
  if (!isNewEngineEnabled(opts)) return "graphhopper";
  return opts.engine;
}
