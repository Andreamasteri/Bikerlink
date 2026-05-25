/**
 * Router Selector — BikerLink
 *
 * Seleziona il routing engine corretto in base alla configurazione admin
 * (app_settings: routing_engine, maps_rollout) e al flag utente mapTester.
 *
 * Gate logic:
 * - Se rollout = "disabled" o engine = "graphhopper" → GraphHopper (sempre)
 * - Se rollout = "tester":
 *     - utente mapTester=true  → engine selezionato dall'admin
 *     - utente mapTester=false → GraphHopper (fallback silenzioso)
 * - Se rollout = "all" → engine selezionato dall'admin (tutti gli utenti)
 *
 * Fallback automatico:
 * - Se Valhalla restituisce 5xx, timeout o errore di mapping → GraphHopper
 * - Header X-Routing-Fallback: graphhopper impostato sulla risposta
 * - Log warning con dettagli per debug admin
 *
 * Nessun preload/health-check di Valhalla viene eseguito per utenti non-tester.
 */

import { storage } from "../storage";
import type { RouteRequest, RouteResult } from "../graphhopper-client";
import { calculateRoute as ghCalculateRoute } from "../graphhopper-client";
import type { Response } from "express";

export type RoutingEngine = "graphhopper" | "valhalla" | "mapbox" | "tomtom";

interface RoutingConfig {
  engine: RoutingEngine;
  rollout: string;
}

async function readRoutingConfig(): Promise<RoutingConfig> {
  try {
    const [engineSetting, rolloutSetting] = await Promise.all([
      storage.getAppSetting("routing_engine"),
      storage.getAppSetting("maps_rollout"),
    ]);
    return {
      engine: (engineSetting?.value ?? "graphhopper") as RoutingEngine,
      rollout: rolloutSetting?.value ?? "disabled",
    };
  } catch {
    return { engine: "graphhopper", rollout: "disabled" };
  }
}

/**
 * Determina quale engine usare per questo utente.
 * Se il gate non è soddisfatto, ritorna sempre "graphhopper".
 */
export async function resolveEngineForUser(
  userId: string,
): Promise<RoutingEngine> {
  const { engine, rollout } = await readRoutingConfig();

  if (rollout === "disabled" || engine === "graphhopper") {
    return "graphhopper";
  }

  if (rollout === "all") {
    return engine;
  }

  if (rollout === "tester") {
    try {
      const user = await storage.getUser(userId);
      if (user?.mapTester === true) {
        return engine;
      }
    } catch {
      // fallback silenzioso a GraphHopper
    }
    return "graphhopper";
  }

  return "graphhopper";
}

/**
 * Esegue il calcolo del percorso usando l'engine appropriato per l'utente.
 *
 * Se l'engine selezionato fallisce (5xx, timeout, errore mapping) esegue
 * automaticamente il fallback a GraphHopper e imposta:
 *   - Header `X-Routing-Fallback: graphhopper` sulla risposta Express
 *   - Log warning con dettagli errore per debug admin
 *
 * @param req        RouteRequest nel formato GraphHopper-interno
 * @param userId     ID utente (per gate rollout/mapTester)
 * @param expressRes Risposta Express (opzionale — per impostare header fallback)
 */
export async function calculateRouteWithSelector(
  req: RouteRequest,
  userId: string,
  expressRes?: Response,
): Promise<{ result: RouteResult; engineUsed: RoutingEngine }> {
  const engine = await resolveEngineForUser(userId);

  if (engine === "graphhopper") {
    const result = await ghCalculateRoute(req);
    return { result, engineUsed: "graphhopper" };
  }

  if (engine === "valhalla") {
    const { calculateRoute: valhallaCalculateRoute, isValhallaConfigured } = await import("../valhalla-client");

    if (!isValhallaConfigured) {
      console.warn("[RouterSelector] Valhalla selezionato ma VALHALLA_URL non configurata — fallback a GraphHopper");
      if (expressRes) expressRes.setHeader("X-Routing-Fallback", "graphhopper");
      const result = await ghCalculateRoute(req);
      return { result, engineUsed: "graphhopper" };
    }

    try {
      const result = await valhallaCalculateRoute(req);
      return { result, engineUsed: "valhalla" };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[RouterSelector] Valhalla fallito (${errMsg}) — fallback automatico a GraphHopper`);
      if (expressRes) expressRes.setHeader("X-Routing-Fallback", "graphhopper");
      const result = await ghCalculateRoute(req);
      return { result, engineUsed: "graphhopper" };
    }
  }

  if (engine === "mapbox") {
    const {
      calculateRoute: mapboxCalculateRoute,
      isMapboxConfigured,
      isMapboxQuotaExhausted,
    } = await import("../mapbox-directions-client");

    if (!isMapboxConfigured) {
      console.warn("[RouterSelector] Mapbox selezionato ma MAPBOX_ACCESS_TOKEN non configurato — fallback a GraphHopper");
      if (expressRes) expressRes.setHeader("X-Routing-Fallback", "graphhopper");
      const result = await ghCalculateRoute(req);
      return { result, engineUsed: "graphhopper" };
    }

    // Blocco proattivo se la quota mensile è esaurita — non chiama Mapbox affatto
    const quotaExhausted = await isMapboxQuotaExhausted();
    if (quotaExhausted) {
      console.warn("[RouterSelector] Mapbox quota mensile esaurita (>=100k) — fallback preventivo a GraphHopper");
      if (expressRes) expressRes.setHeader("X-Routing-Fallback", "graphhopper");
      const result = await ghCalculateRoute(req);
      return { result, engineUsed: "graphhopper" };
    }

    try {
      const result = await mapboxCalculateRoute(req);
      return { result, engineUsed: "mapbox" };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Log differenziato: 4xx = auth/quota, 5xx = infra
      const is4xx = errMsg.includes("error 4");
      console.warn(
        `[RouterSelector] Mapbox fallito ${is4xx ? "(4xx — auth/quota)" : "(5xx/timeout)"} (${errMsg}) — fallback automatico a GraphHopper`,
      );
      if (expressRes) expressRes.setHeader("X-Routing-Fallback", "graphhopper");
      const result = await ghCalculateRoute(req);
      return { result, engineUsed: "graphhopper" };
    }
  }

  // engine = "tomtom" — stub: non ancora implementato
  // Per ora fallback silenzioso a GraphHopper
  console.warn(`[RouterSelector] Engine "${engine}" non ancora implementato — fallback a GraphHopper`);
  if (expressRes) expressRes.setHeader("X-Routing-Fallback", "graphhopper");
  const result = await ghCalculateRoute(req);
  return { result, engineUsed: "graphhopper" };
}
