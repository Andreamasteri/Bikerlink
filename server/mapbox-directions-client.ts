/**
 * Mapbox Directions Client — BikerLink
 *
 * Routing engine cloud di emergenza (Routing #3).
 * Attivabile dall'admin quando GraphHopper e Valhalla self-hosted sono down.
 *
 * Implementazione: REST puro con fetch (no @mapbox/mapbox-sdk) per minimizzare
 * il bundle server. Il SDK aggiunge ~1.5MB di dipendenze non necessarie per
 * chiamate semplici alle API Directions e Map Matching.
 *
 * Variabili d'ambiente:
 *   MAPBOX_ACCESS_TOKEN — token secret Mapbox (sk.eyJ1...).
 *                         Deve essere un token secret (sk.*), usato server-side.
 *                         NON esporre mai nei bundle client.
 *
 * Profilo routing: "driving" (Mapbox non ha profilo motorcycle dedicato).
 * Limitazione documentata: il profilo "driving" ignora la preferenza per strade
 * panoramiche/curve tipica del motociclista. Per approssimare "moto-friendly"
 * si escludono autostrade e traghetti via parametro exclude (configurabile).
 *
 * Quote:
 *   - Free tier: 100.000 richieste/mese
 *   - Soglia warning: 80.000 (80%) — configurabile via app_settings
 *   - Contatore mensile: app_settings.mapbox_request_count_month
 *   - Reset automatico: 1° del mese alle 00:01 Europe/Rome (schedulato in index.ts)
 *
 * Documentazione API:
 *   https://docs.mapbox.com/api/navigation/directions/
 *   https://docs.mapbox.com/api/navigation/map-matching/
 */

import { mapMapboxResponse, type MapboxDirectionsResponse } from "./mapbox/response-mapper";
import type { RouteRequest, RouteResult, MapMatchResult, GHServerInfo } from "./graphhopper-client";
import { storage } from "./storage";

const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN ?? "";
const MAPBOX_API_BASE = "https://api.mapbox.com";

const MAPBOX_TIMEOUT_MS = 8_000;
const MAPBOX_RETRY_COUNT = 1;

export const isMapboxConfigured = Boolean(MAPBOX_ACCESS_TOKEN);

// ─── Startup log ───────────────────────────────────────────────────────────────
if (isMapboxConfigured) {
  console.log("[Mapbox] Configurato — profilo: driving (no motorcycle nativo, exclude motorway/ferry)");
} else {
  console.warn("[Mapbox] Non configurato — impostare MAPBOX_ACCESS_TOKEN. Il routing Mapbox non sarà disponibile.");
}

// ─── Quota / rate-limit guard ─────────────────────────────────────────────────

const MAPBOX_QUOTA_LIMIT = 100_000;
const MAPBOX_QUOTA_WARNING_DEFAULT = 80_000;

/**
 * Legge il contatore richieste Mapbox corrente dal DB.
 * Restituisce 0 se la chiave non esiste ancora.
 */
export async function getMapboxRequestCount(): Promise<number> {
  try {
    const setting = await storage.getAppSetting("mapbox_request_count_month");
    return parseInt(setting?.value ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Legge la soglia warning configurabile. Default: 80.000.
 */
async function getMapboxQuotaWarningThreshold(): Promise<number> {
  try {
    const setting = await storage.getAppSetting("mapbox_quota_warning_threshold");
    return parseInt(setting?.value ?? String(MAPBOX_QUOTA_WARNING_DEFAULT), 10) || MAPBOX_QUOTA_WARNING_DEFAULT;
  } catch {
    return MAPBOX_QUOTA_WARNING_DEFAULT;
  }
}

/**
 * Incrementa il contatore richieste di 1.
 * Se supera la soglia warning, logga un avviso admin.
 */
async function incrementMapboxRequestCount(): Promise<void> {
  try {
    const current = await getMapboxRequestCount();
    const next = current + 1;
    await storage.upsertAppSetting("mapbox_request_count_month", String(next));

    const threshold = await getMapboxQuotaWarningThreshold();
    if (next >= threshold) {
      console.warn(
        `[Mapbox] ⚠️ QUOTA WARNING: ${next}/${MAPBOX_QUOTA_LIMIT} richieste usate questo mese (soglia: ${threshold}). ` +
        `Considerare il fallback preventivo a GraphHopper.`,
      );
    }
  } catch (err: unknown) {
    console.warn("[Mapbox] incrementMapboxRequestCount error:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Verifica se la quota mensile è esaurita (>= limit).
 * Se sì, il chiamante deve fare fallback a GraphHopper senza chiamare Mapbox.
 */
export async function isMapboxQuotaExhausted(): Promise<boolean> {
  const count = await getMapboxRequestCount();
  return count >= MAPBOX_QUOTA_LIMIT;
}

/**
 * Reset del contatore mensile (da invocare il 1° del mese alle 00:01 Europe/Rome).
 * Schedulato in server/index.ts.
 */
export async function resetMapboxMonthlyCounter(): Promise<void> {
  try {
    await storage.upsertAppSetting("mapbox_request_count_month", "0");
    console.log("[Mapbox] Contatore mensile resettatao per il nuovo mese.");
  } catch (err: unknown) {
    console.warn("[Mapbox] resetMapboxMonthlyCounter error:", err instanceof Error ? err.message : String(err));
  }
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function mapboxFetch(
  url: string,
  init: RequestInit,
  attempt = 0,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAPBOX_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    // Retry solo su 5xx (non su 4xx — auth/quota errors)
    if (!res.ok && res.status >= 500 && attempt < MAPBOX_RETRY_COUNT) {
      clearTimeout(timer);
      return mapboxFetch(url, init, attempt + 1);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── calculateRoute ───────────────────────────────────────────────────────────

/**
 * Calcola un percorso tra due o più waypoint tramite Mapbox Directions API.
 *
 * Profilo: "driving" (nota: Mapbox non ha profilo motorcycle dedicato).
 * Per approssimare "moto-friendly" si usa exclude=motorway,ferry di default,
 * a meno che custom_model.use_highways > 0.5 (in quel caso si tolgono le esclusioni).
 *
 * Il formato di risposta viene normalizzato nel formato GraphHopper-interno
 * (paths[].points Polyline5) tramite mapMapboxResponse().
 *
 * @param req  RouteRequest nel formato GH-interno
 */
export async function calculateRoute(req: RouteRequest): Promise<RouteResult> {
  if (!MAPBOX_ACCESS_TOKEN) {
    throw new Error("Mapbox non configurato: impostare MAPBOX_ACCESS_TOKEN.");
  }

  // Formato coordinate Mapbox: "lng,lat;lng,lat;..."
  const coordsStr = req.points
    .map(([lng, lat]) => `${lng},${lat}`)
    .join(";");

  // Determina se escludere autostrade/traghetti (default: sì, per profilo moto)
  const cm = req.custom_model as Record<string, unknown> | undefined;
  const useHighways = typeof cm?.use_highways === "number" ? cm.use_highways : 0.3;
  const useFerry = typeof cm?.use_ferry === "number" ? cm.use_ferry : 0.5;

  const excludeParts: string[] = [];
  if (useHighways < 0.5) excludeParts.push("motorway");
  if (useFerry < 0.5) excludeParts.push("ferry");

  const params = new URLSearchParams({
    access_token: MAPBOX_ACCESS_TOKEN,
    geometries: "polyline6",
    overview: "full",
    steps: "true",
    annotations: "distance,duration,speed",
  });
  if (excludeParts.length > 0) {
    params.set("exclude", excludeParts.join(","));
  }

  const url = `${MAPBOX_API_BASE}/directions/v5/mapbox/driving/${encodeURIComponent(coordsStr)}?${params.toString()}`;

  const res = await mapboxFetch(url, { method: "GET" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mapbox Directions error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json() as MapboxDirectionsResponse;

  if (data.code !== "Ok") {
    throw new Error(`Mapbox Directions response code: ${data.code}`);
  }

  const result = mapMapboxResponse(data);

  // Incrementa contatore dopo risposta riuscita (fire-and-forget)
  incrementMapboxRequestCount().catch(() => void 0);

  return result;
}

// ─── matchTrace ────────────────────────────────────────────────────────────────

/**
 * Invia una traccia GPS al Map Matching API di Mapbox.
 * Restituisce il risultato normalizzato nel formato MapMatchResult GH-interno.
 *
 * Endpoint: POST /matching/v5/mapbox/driving/{coords}
 * Nota: limite Mapbox = 100 coordinate per richiesta.
 */
export async function matchTrace(
  points: Array<{ lat: number; lon: number }>,
): Promise<MapMatchResult> {
  if (!MAPBOX_ACCESS_TOKEN) {
    throw new Error("Mapbox non configurato: impostare MAPBOX_ACCESS_TOKEN.");
  }

  // Troncamento a 100 punti (limite API Mapbox)
  const pts = points.slice(0, 100);
  const coordsStr = pts.map((p) => `${p.lon},${p.lat}`).join(";");

  const params = new URLSearchParams({
    access_token: MAPBOX_ACCESS_TOKEN,
    geometries: "polyline6",
    overview: "full",
    tidy: "true",
  });

  const url = `${MAPBOX_API_BASE}/matching/v5/mapbox/driving/${encodeURIComponent(coordsStr)}?${params.toString()}`;

  const res = await mapboxFetch(url, { method: "GET" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mapbox Map Matching error ${res.status}: ${text.slice(0, 300)}`);
  }

  type MapboxMatchingResponse = {
    code: string;
    matchings?: Array<{
      geometry: string;
      distance: number;
      duration: number;
    }>;
    tracepoints?: Array<{ location: [number, number] } | null>;
  };

  const data = await res.json() as MapboxMatchingResponse;

  if (data.code !== "Ok") {
    throw new Error(`Mapbox Map Matching response code: ${data.code}`);
  }

  const { decodePolyline } = await import("./valhalla/response-mapper");
  const matching = data.matchings?.[0];
  const coordinates: [number, number][] = matching
    ? decodePolyline(matching.geometry, 6).map(([lat, lon]) => [lon, lat] as [number, number])
    : [];

  return {
    paths: [
      {
        distance: matching?.distance ?? 0,
        time: Math.round((matching?.duration ?? 0) * 1000),
        points: { coordinates },
        details: {
          osm_way_id: [],
        },
      },
    ],
  };
}

// ─── getInfo ──────────────────────────────────────────────────────────────────

/**
 * Restituisce lo stato del client Mapbox.
 * Mapbox non ha endpoint /info; restituisce dati sintetici con quota usata.
 *
 * Nota: NON esegue chiamate HTTP verso Mapbox — nessun warmup per utenti non-gated.
 */
export async function getInfo(): Promise<GHServerInfo & { quota_used?: number; quota_limit?: number }> {
  const quota_used = await getMapboxRequestCount();
  return {
    status: isMapboxConfigured ? "ok" : "not_configured",
    graph_loaded: isMapboxConfigured,
    version: "mapbox-directions-v5",
    profiles: ["driving"],
    provider: "mapbox",
    quota_used,
    quota_limit: MAPBOX_QUOTA_LIMIT,
  } as GHServerInfo & { quota_used?: number; quota_limit?: number };
}
