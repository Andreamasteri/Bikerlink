/**
 * Mapbox Directions Client — BikerLink
 *
 * Client HTTP per la Mapbox Directions API (cloud emergency fallback).
 * Espone calculateRoute, matchTrace, getInfo con la stessa firma
 * degli equivalenti in graphhopper-adapter.ts / valhalla-client.ts.
 *
 * Variabili d'ambiente:
 *   MAPBOX_ACCESS_TOKEN — Token sk.* (server-side only, mai esposto al client)
 *
 * Quota: 100k richieste/mese piano gratuito.
 * ToS Mapbox: le risposte NON devono essere cachate in modo persistente.
 */

import type { RouteRequest, RouteResult, MapMatchResult, GHPoint, GHServerInfo } from "./graphhopper-adapter";
import { buildMapboxUrl } from "./mapbox/request-builder";
import { mapMapboxResponse, mapMapboxTraceResponse, type MapboxDirectionsResponse } from "./mapbox/response-mapper";
import { checkQuota, incrementQuota, MAPBOX_QUOTA_LIMIT } from "./mapbox/quota-guard";

const TIMEOUT_MS = 8_000;
const MAX_RETRIES = 1;

function getAccessToken(): string {
  const token = process.env.MAPBOX_ACCESS_TOKEN ?? "";
  if (!token) {
    throw new Error("MAPBOX_ACCESS_TOKEN non configurato — aggiungere nei Secrets Replit");
  }
  return token;
}

/**
 * Esegue una richiesta GET a Mapbox con timeout e retry su 5xx.
 * NON fa retry su 4xx (ma ritorna il response — il caller decide il fallback).
 */
async function mapboxFetch(url: string, attempt = 0): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (res.status >= 500 && attempt < MAX_RETRIES) {
      console.warn(`[Mapbox] risposta ${res.status} — retry ${attempt + 1}/${MAX_RETRIES}`);
      return mapboxFetch(url, attempt + 1);
    }

    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calcola un percorso tra due o più waypoint via Mapbox Directions API.
 * Incrementa il contatore quota dopo ogni chiamata (anche su errore HTTP).
 * Lancia un errore su risposta non-ok — il router-selector gestisce il fallback.
 */
export async function calculateRoute(req: RouteRequest): Promise<RouteResult> {
  const token = getAccessToken();
  const url = buildMapboxUrl(req, token);

  const res = await mapboxFetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mapbox Directions error ${res.status}: ${text.slice(0, 300)}`);
  }

  const raw = await res.json() as MapboxDirectionsResponse;
  const result = mapMapboxResponse(raw);

  incrementQuota().catch((e) => console.warn("[Mapbox] Errore incremento quota:", e));

  return result;
}

/**
 * Map-matching stub — Mapbox Map Matching è fuori scope per questo engine.
 * Restituisce un risultato vuoto per compatibilità con l'interfaccia.
 */
export async function matchTrace(_points: GHPoint[], _profile?: string): Promise<MapMatchResult> {
  return mapMapboxTraceResponse(null);
}

/**
 * Stato dell'engine Mapbox: verifica token + quota.
 * Formato: { status, provider, quota_used, quota_limit }
 */
export async function getInfo(): Promise<GHServerInfo & { provider?: string; quota_used?: number; quota_limit?: number }> {
  const token = process.env.MAPBOX_ACCESS_TOKEN ?? "";
  if (!token) {
    return {
      status: "unconfigured",
      graph_loaded: false,
      version: "MAPBOX_ACCESS_TOKEN not set",
      provider: "mapbox",
    };
  }

  try {
    const quota = await checkQuota();
    return {
      status: quota.ok ? "ok" : "quota_exceeded",
      graph_loaded: quota.ok,
      version: "mapbox-directions-v5",
      provider: "mapbox",
      quota_used: quota.used,
      quota_limit: MAPBOX_QUOTA_LIMIT,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", graph_loaded: false, version: msg, provider: "mapbox" };
  }
}
