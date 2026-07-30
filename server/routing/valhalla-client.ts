/**
 * Valhalla Client — BikerLink
 *
 * Client HTTP per il server Valhalla self-hosted.
 * Espone calculateRoute, matchTrace, getInfo con la stessa firma
 * degli equivalenti in graphhopper-adapter.ts.
 *
 * Variabili d'ambiente:
 *   VALHALLA_URL     — URL base pubblico del server Valhalla (es: https://valhalla.biker-link.net)
 *   VALHALLA_API_KEY — Chiave opzionale inviata come X-Valhalla-Key.
 *   VALHALLA_TOKEN   — Alias legacy compatibile di VALHALLA_API_KEY.
 */

import type { RouteRequest, RouteResult, MapMatchResult, GHPoint, GHServerInfo } from "./graphhopper-adapter";
import { buildValhallaRoutePayload, buildValhallaTracePayload } from "./valhalla/request-builder";
import { mapValhallaResponse, mapValhallaTraceResponse, type ValhallaRouteResponse } from "./valhalla/response-mapper";
import {
  buildValhallaIsochronePayload,
  mapValhallaIsochroneResponse,
  type IsochroneResult,
} from "./valhalla/isochrone-builder";
import {
  buildValhallaMatrixPayload,
  mapValhallaMatrixResponse,
  type MatrixResult,
  type LatLon,
} from "./valhalla/matrix-builder";
import { cfAccessHeaders } from "../lib/cf-access";

const VALHALLA_BASE_URL = process.env.VALHALLA_URL?.replace(/\/$/, "") ?? "";
const VALHALLA_API_KEY = process.env.VALHALLA_API_KEY ?? process.env.VALHALLA_TOKEN ?? "";
const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1;

if (VALHALLA_BASE_URL) {
  console.log(`[Valhalla] URL configurato: ${VALHALLA_BASE_URL}`);
} else {
  console.warn("[Valhalla] VALHALLA_URL non impostato — client disabilitato fino a configurazione.");
}

function buildHeaders(): Record<string, string> {
  // Cloudflare Access Service Token (layer zero-trust davanti al tunnel TC).
  const h: Record<string, string> = { "Content-Type": "application/json", ...cfAccessHeaders() };
  if (VALHALLA_API_KEY) h["X-Valhalla-Key"] = VALHALLA_API_KEY;
  return h;
}

async function valhallaFetch(path: string, init: RequestInit, attempt = 0): Promise<Response> {
  if (!VALHALLA_BASE_URL) {
    throw new Error("VALHALLA_URL non configurato");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${VALHALLA_BASE_URL}${path}`, {
      ...init,
      headers: { ...buildHeaders(), ...(init.headers as Record<string, string> ?? {}) },
      signal: controller.signal,
    });

    if (res.status >= 500 && attempt < MAX_RETRIES) {
      console.warn(`[Valhalla] ${path} risposta ${res.status} — retry ${attempt + 1}/${MAX_RETRIES}`);
      return valhallaFetch(path, init, attempt + 1);
    }

    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calcola un percorso tra due o più waypoint via Valhalla /route.
 */
export async function calculateRoute(req: RouteRequest): Promise<RouteResult> {
  const payload = buildValhallaRoutePayload(req);
  const res = await valhallaFetch("/route", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Valhalla /route error ${res.status}: ${text.slice(0, 300)}`);
  }

  const raw = await res.json();
  return mapValhallaResponse(raw as ValhallaRouteResponse);
}

/**
 * Map-matching: associa una traccia GPS alle strade OSM via Valhalla /trace_route.
 */
export async function matchTrace(points: GHPoint[], profile?: string): Promise<MapMatchResult> {
  const coords: [number, number][] = points.map((p) => [p.lon, p.lat]);
  const payload = buildValhallaTracePayload(coords, profile);
  const res = await valhallaFetch("/trace_attributes", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Valhalla /trace_attributes error ${res.status}: ${text.slice(0, 300)}`);
  }

  const raw = await res.json();
  return mapValhallaTraceResponse(raw);
}

/**
 * Calcola l'area raggiungibile da un punto in X minuti (isocrone) via Valhalla /isochrone.
 * Restituisce un GeoJSON FeatureCollection con un Polygon per ogni intervallo richiesto.
 */
export async function getIsochrone(
  lat: number,
  lon: number,
  minutesList: number[],
): Promise<IsochroneResult> {
  const payload = buildValhallaIsochronePayload(lat, lon, minutesList);
  const res = await valhallaFetch("/isochrone", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Valhalla /isochrone error ${res.status}: ${text.slice(0, 300)}`);
  }

  const raw = await res.json();
  return mapValhallaIsochroneResponse(raw);
}

/**
 * Calcola la matrice di tempi/distanze tra N origini e M destinazioni
 * via Valhalla /sources_to_targets.
 */
export async function getMatrix(
  origins: LatLon[],
  destinations: LatLon[],
): Promise<MatrixResult> {
  const payload = buildValhallaMatrixPayload(origins, destinations);
  const res = await valhallaFetch("/sources_to_targets", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Valhalla /sources_to_targets error ${res.status}: ${text.slice(0, 300)}`);
  }

  const raw = await res.json();
  return mapValhallaMatrixResponse(raw, origins, destinations);
}

/**
 * Controlla lo stato del server Valhalla via GET /status.
 * Restituisce GHServerInfo per compatibilità con l'interfaccia admin esistente.
 */
export async function getInfo(): Promise<GHServerInfo> {
  if (!VALHALLA_BASE_URL) {
    return { status: "unconfigured", graph_loaded: false, version: "VALHALLA_URL not set" };
  }

  try {
    const res = await valhallaFetch("/status", { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { version?: string; tileset_last_modified?: number };
    return {
      status: "ok",
      graph_loaded: true,
      version: data.version ?? "unknown",
      osm_date: data.tileset_last_modified
        ? new Date(data.tileset_last_modified * 1000).toISOString().split("T")[0]
        : undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", graph_loaded: false, version: msg };
  }
}

// Cache di salute Valhalla per endpoint pubblici (gate UI "auto panoramica").
// Evita di interrogare /status del server self-hosted a ogni richiesta client.
let healthCache: { available: boolean; ts: number } | null = null;
const HEALTH_TTL_MS = 30_000;

/**
 * Restituisce true se Valhalla è configurato e raggiungibile (status "ok"),
 * con una cache TTL breve. Usato per abilitare/disabilitare il profilo
 * "auto panoramica" lato client senza martellare il server di routing.
 */
export async function isValhallaAvailableCached(): Promise<boolean> {
  const now = Date.now();
  if (healthCache && now - healthCache.ts < HEALTH_TTL_MS) {
    return healthCache.available;
  }
  let available = false;
  try {
    const info = await getInfo();
    available = info.status === "ok";
  } catch {
    available = false;
  }
  healthCache = { available, ts: now };
  return available;
}
