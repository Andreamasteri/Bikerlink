import type { Response } from "express";
import type { MapsRollout, RoutingEngineId } from "@shared/maps-config";
import { routeViaGraphHopper, type RouteRequest, type RouteResult } from "./graphhopper-adapter";
import { calculateRoute as valhallaCalculateRoute } from "./valhalla-client";
import { calculateRoute as mapboxCalculateRoute } from "./mapbox-directions-client";
import { calculateRoute as tomtomCalculateRoute } from "./tomtom-routing-client";
import { checkQuota } from "./mapbox/quota-guard";
import { checkQuota as checkTomTomQuota } from "./tomtom/quota-guard";

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
 * Tenta il routing via Mapbox con fallback automatico a GraphHopper.
 * Verifica la quota PRIMA di chiamare Mapbox: se esaurita, fallback preventivo.
 * Qualsiasi errore HTTP (4xx/5xx), timeout o errore di rete causa fallback.
 */
async function routeViaMapboxWithFallback(
  req: RouteRequest,
  res?: Response
): Promise<RouteResult> {
  const quota = await checkQuota();
  if (!quota.ok) {
    const msg = `Mapbox quota esaurita (${quota.used}/${quota.limit}) — fallback preventivo a GraphHopper`;
    console.warn(`[RouterSelector] ${msg}`);
    if (res && !res.headersSent) {
      res.setHeader("X-Routing-Fallback", "graphhopper");
    }
    return routeViaGraphHopper(req);
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
    return routeViaGraphHopper(req);
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
  res?: Response
): Promise<RouteResult> {
  const quota = await checkTomTomQuota();
  if (!quota.ok) {
    const msg = `TomTom quota esaurita (${quota.used}/${quota.limit}) — fallback preventivo a GraphHopper`;
    console.warn(`[RouterSelector] ${msg}`);
    if (res && !res.headersSent) {
      res.setHeader("X-Routing-Fallback", "graphhopper");
    }
    return routeViaGraphHopper(req);
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

  if (opts.engine === "mapbox-directions") {
    return routeViaMapboxWithFallback(req, res);
  }

  if (opts.engine === "tomtom") {
    return routeViaTomTomWithFallback(req, res);
  }

  return routeViaGraphHopper(req);
}

export async function resolveActiveEngine(opts: RouterSelectorOptions): Promise<RoutingEngineId> {
  if (!isNewEngineEnabled(opts)) return "graphhopper";
  return opts.engine;
}
