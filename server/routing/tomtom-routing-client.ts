/**
 * TomTom Routing Client — BikerLink
 *
 * Client HTTP per la TomTom Routing API (cloud, profilo motorcycle + traffic EU).
 * Espone calculateRoute, matchTrace, getInfo con la stessa firma
 * degli equivalenti in graphhopper-adapter.ts / valhalla-client.ts.
 *
 * Variabili d'ambiente:
 *   TOMTOM_API_KEY — chiave TomTom developer (mai esposta al client)
 *
 * Quota: 2.500 richieste/giorno piano gratuito.
 * Profilo: motorcycle con routeType=thrilling + windingness=high.
 */

import type { RouteRequest, RouteResult, MapMatchResult, GHPoint, GHServerInfo } from "./graphhopper-adapter";
import { buildTomTomUrl } from "./tomtom/request-builder";
import { mapTomTomResponse, mapTomTomMatchResponse, type TomTomRoutingResponse, type TomTomSnapResponse } from "./tomtom/response-mapper";
import { checkQuota, incrementQuota, TOMTOM_QUOTA_LIMIT } from "./tomtom/quota-guard";

const TIMEOUT_MS = 8_000;
const MAX_RETRIES = 1;

function getApiKey(): string {
  const key = process.env.TOMTOM_API_KEY ?? "";
  if (!key) {
    throw new Error("TOMTOM_API_KEY non configurato — aggiungere nei Secrets Replit");
  }
  return key;
}

async function tomtomFetch(url: string, attempt = 0): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (res.status >= 500 && attempt < MAX_RETRIES) {
      console.warn(`[TomTom] risposta ${res.status} — retry ${attempt + 1}/${MAX_RETRIES}`);
      return tomtomFetch(url, attempt + 1);
    }

    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calcola un percorso tra due o più waypoint via TomTom Routing API.
 * Profilo motorcycle con scenic routing (thrilling + windingness=high).
 * Incrementa il contatore quota dopo ogni chiamata.
 */
export async function calculateRoute(req: RouteRequest): Promise<RouteResult> {
  const key = getApiKey();
  const url = buildTomTomUrl(req, key);

  const res = await tomtomFetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TomTom Routing error ${res.status}: ${text.slice(0, 300)}`);
  }

  const raw = await res.json() as TomTomRoutingResponse;
  const result = mapTomTomResponse(raw);

  incrementQuota().catch((e) => console.warn("[TomTom] Errore incremento quota:", e));

  return result;
}

const SNAP_BASE = "https://api.tomtom.com/snap/1/snap.json";

/**
 * Map-matching via TomTom Snap to Roads API.
 * Invia i punti GPS come POST e restituisce le coordinate snappate sulla rete stradale.
 * Se la chiave non è configurata restituisce un risultato vuoto senza lanciare errori.
 */
export async function matchTrace(points: GHPoint[], _profile?: string): Promise<MapMatchResult> {
  const key = process.env.TOMTOM_API_KEY ?? "";
  if (!key || points.length === 0) {
    return mapTomTomMatchResponse({ snappedPoints: [] });
  }

  const url = `${SNAP_BASE}?key=${encodeURIComponent(key)}`;
  const body = JSON.stringify({
    supportingPoints: points.map((p) => ({ lat: p.lat, lon: p.lon })),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });

    if (res.status >= 500 && res.status < 600) {
      console.warn(`[TomTom Snap] errore ${res.status} — risultato vuoto`);
      return mapTomTomMatchResponse({ snappedPoints: [] });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`TomTom Snap error ${res.status}: ${text.slice(0, 200)}`);
    }

    const raw = await res.json() as TomTomSnapResponse;
    return mapTomTomMatchResponse(raw);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stato dell'engine TomTom: verifica API key + quota giornaliera.
 */
export async function getInfo(): Promise<GHServerInfo & { provider?: string; quota_used?: number; quota_limit?: number }> {
  const key = process.env.TOMTOM_API_KEY ?? "";
  if (!key) {
    return {
      status: "unconfigured",
      graph_loaded: false,
      version: "TOMTOM_API_KEY not set",
      provider: "tomtom",
    };
  }

  try {
    const quota = await checkQuota();
    return {
      status: quota.ok ? "ok" : "quota_exceeded",
      graph_loaded: quota.ok,
      version: "tomtom-routing-v1",
      provider: "tomtom",
      quota_used: quota.used,
      quota_limit: TOMTOM_QUOTA_LIMIT,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", graph_loaded: false, version: msg, provider: "tomtom" };
  }
}
