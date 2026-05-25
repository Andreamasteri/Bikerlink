/**
 * Valhalla Client — BikerLink
 *
 * Wrappa le chiamate HTTP al server Valhalla self-hosted.
 * Espone le stesse funzioni pubbliche di graphhopper-client.ts:
 *   calculateRoute, matchTrace, getInfo
 *
 * Variabili d'ambiente:
 *   VALHALLA_URL      — URL base del server Valhalla (es: https://valhalla.bikerlink.app)
 *   VALHALLA_API_KEY  — API key opzionale (header X-Valhalla-Key se presente)
 *
 * Profilo motorcycle configurato con tuning road touring:
 *   use_highways: 0.3  → preferisce strade secondarie, tollera autostrade se necessario
 *   use_trails: 0.0    → evita sterrati (road touring, non enduro)
 *   use_ferry: 0.5     → accetta traghetti
 *
 * NOTA: NON è una replica esatta dell'algoritmo curvy GraphHopper proprietario.
 * Valhalla non ha una modalità "curvature" nativa. L'approssimazione via
 * dynamic costing (penalità su autostrade, preferenza strade minori) fornisce
 * un percorso "ragionevolmente curvy" adeguato come routing backup.
 *
 * Documentazione setup server: infra/valhalla/README.md
 */

import { mapValhallaResponse, type ValhallaRouteResponse } from "./valhalla/response-mapper";
import type { RouteRequest, RouteResult, MapMatchResult, GHServerInfo } from "./graphhopper-client";

const VALHALLA_URL = process.env.VALHALLA_URL?.replace(/\/$/, "");
const VALHALLA_API_KEY = process.env.VALHALLA_API_KEY ?? "";

const VALHALLA_TIMEOUT_MS = 10_000;
const VALHALLA_RETRY_COUNT = 1;

export const isValhallaConfigured = Boolean(VALHALLA_URL);

// ─── Startup log ───────────────────────────────────────────────────────────────
if (isValhallaConfigured) {
  console.log(`[Valhalla] Configurato — URL: ${VALHALLA_URL}`);
} else {
  console.warn("[Valhalla] Non configurato — impostare VALHALLA_URL. Il routing Valhalla non sarà disponibile.");
}

// ─── Profilo motorcycle default ────────────────────────────────────────────────

/**
 * Opzioni costing default per il profilo "motorcycle" di Valhalla.
 *
 * use_highways: 0.3   — toll di autostrada molto penalizzato; preferisce nazionali/provinciali
 * use_trails: 0.0     — evita completamente sterrati e fuoristrada (profilo road touring)
 * use_ferry: 0.5      — accetta traghetti se convenienti
 * country_crossing_penalty: 0 — nessuna penalità extra per confini (area EU)
 *
 * Approssimazione "curvy" via road_class penalties sul costing: Valhalla assegna
 * costi bassi alle strade di classe SECONDARY/TERTIARY/UNCLASSIFIED perché hanno
 * più curve rispetto a PRIMARY/TRUNK/MOTORWAY. Il profilo motorcycle con
 * use_highways basso li privilegia naturalmente.
 */
const DEFAULT_MOTORCYCLE_COSTING = {
  costing: "motorcycle" as const,
  costing_options: {
    motorcycle: {
      use_highways: 0.3,
      use_trails: 0.0,
      use_ferry: 0.5,
      country_crossing_penalty: 0,
    },
  },
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function buildHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (VALHALLA_API_KEY) {
    h["X-Valhalla-Key"] = VALHALLA_API_KEY;
  }
  return h;
}

async function valhallaFetch(
  path: string,
  init: RequestInit,
  attempt = 0,
): Promise<Response> {
  if (!VALHALLA_URL) {
    throw new Error("VALHALLA_URL non configurata");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALHALLA_TIMEOUT_MS);
  try {
    const res = await fetch(`${VALHALLA_URL}${path}`, {
      ...init,
      headers: { ...buildHeaders(), ...(init.headers as Record<string, string> ?? {}) },
      signal: controller.signal,
    });
    if (!res.ok && res.status >= 500 && attempt < VALHALLA_RETRY_COUNT) {
      clearTimeout(timer);
      return valhallaFetch(path, init, attempt + 1);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── calculateRoute ────────────────────────────────────────────────────────────

/**
 * Calcola un percorso tra due o più waypoint tramite Valhalla /route.
 *
 * Traduzione parametri GraphHopper → Valhalla:
 * - `profile` GH-style ignorato (Valhalla usa sempre "motorcycle" come profilo moto)
 * - `custom_model` GH → override parziale su costing_options.motorcycle
 *   Chiavi supportate: use_highways, use_trails, use_ferry
 *
 * Restituisce RouteResult nel formato GH-interno (paths[].points Polyline5).
 */
export async function calculateRoute(req: RouteRequest): Promise<RouteResult> {
  const costingOptions = {
    ...DEFAULT_MOTORCYCLE_COSTING.costing_options.motorcycle,
  };

  // Traduce custom_model GraphHopper in overrides costing Valhalla (best-effort).
  // Il custom_model GH usa priority rules sulle road_class; qui mappiamo solo
  // le preferenze di alto livello (highways/trails) se presenti come chiavi dirette.
  if (req.custom_model) {
    const cm = req.custom_model as Record<string, unknown>;
    if (typeof cm.use_highways === "number") costingOptions.use_highways = cm.use_highways as number;
    if (typeof cm.use_trails === "number") costingOptions.use_trails = cm.use_trails as number;
    if (typeof cm.use_ferry === "number") costingOptions.use_ferry = cm.use_ferry as number;
  }

  const locations = req.points.map(([lng, lat]) => ({ lon: lng, lat }));

  const body = {
    locations,
    costing: DEFAULT_MOTORCYCLE_COSTING.costing,
    costing_options: { motorcycle: costingOptions },
    directions_options: {
      language: "it-IT",
      units: "km",
    },
  };

  const res = await valhallaFetch("/route", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Valhalla /route error ${res.status}: ${text.slice(0, 300)}`);
  }

  const valhallaResp = await res.json() as ValhallaRouteResponse;
  return mapValhallaResponse(valhallaResp);
}

// ─── matchTrace ────────────────────────────────────────────────────────────────

/**
 * Invia una traccia GPS al Map Matching API di Valhalla (/trace_attributes).
 * Restituisce il risultato normalizzato nel formato MapMatchResult GH.
 */
export async function matchTrace(
  points: Array<{ lat: number; lon: number }>,
): Promise<MapMatchResult> {
  const shape = points.map((p) => ({ lat: p.lat, lon: p.lon }));

  const body = {
    shape,
    costing: DEFAULT_MOTORCYCLE_COSTING.costing,
    shape_match: "map_snap",
    filters: {
      attributes: ["edge.way_id", "matched.point"],
      action: "include",
    },
  };

  const res = await valhallaFetch("/trace_attributes", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Valhalla /trace_attributes error ${res.status}: ${text.slice(0, 300)}`);
  }

  type ValhallaTraceResp = {
    edges?: Array<{ way_id?: number; length?: number }>;
    matched_points?: Array<{ lat: number; lon: number }>;
  };

  const data = await res.json() as ValhallaTraceResp;

  const coordinates: [number, number][] = (data.matched_points ?? []).map(
    (p) => [p.lon, p.lat] as [number, number],
  );

  return {
    paths: [
      {
        distance: 0,
        time: 0,
        points: { coordinates },
        details: {
          osm_way_id: (data.edges ?? []).map((e, i) => [i, i + 1, e.way_id ?? 0] as [number, number, number]),
        },
      },
    ],
  };
}

// ─── getInfo ───────────────────────────────────────────────────────────────────

/**
 * Controlla lo stato del server Valhalla tramite GET /status.
 * Restituisce il formato GHServerInfo per compatibilità con il selector.
 */
export async function getInfo(): Promise<GHServerInfo> {
  if (!isValhallaConfigured) {
    return { status: "not_configured", graph_loaded: false, version: "VALHALLA_URL mancante" };
  }
  try {
    const res = await valhallaFetch("/status", { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    type ValhallaStatus = { version?: string; tileset_last_modified?: string; has_tiles?: boolean; has_admins?: boolean; has_timezones?: boolean };
    const data = await res.json() as ValhallaStatus;
    return {
      status: "ok",
      graph_loaded: data.has_tiles ?? true,
      version: data.version ?? "unknown",
      osm_date: data.tileset_last_modified,
      profiles: ["motorcycle"],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", graph_loaded: false, version: msg };
  }
}
