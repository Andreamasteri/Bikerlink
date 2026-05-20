/**
 * GraphHopper Client — BikerLink
 *
 * Wrappa le chiamate HTTP al server GraphHopper, sia self-hosted che Cloud API.
 *
 * Variabili d'ambiente:
 *   GRAPHHOPPER_URL    — URL base del server GH self-hosted (es: https://gh.bikerlink.app)
 *                        Se non impostata, usa la Cloud API come fallback.
 *   GRAPHHOPPER_TOKEN  — Token per il server self-hosted (header X-GH-Token).
 *   GRAPHHOPPER_API_KEY — API key per la Cloud API (query param ?key=).
 *
 * Documentazione setup server: server/README-graphhopper.md
 */

const SELF_HOSTED_URL = process.env.GRAPHHOPPER_URL?.replace(/\/$/, "");
const SELF_HOSTED_TOKEN = process.env.GRAPHHOPPER_TOKEN ?? "";
const CLOUD_API_KEY = process.env.GRAPHHOPPER_API_KEY ?? "";
const CLOUD_URL = "https://graphhopper.com/api/1";

export const GH_BASE_URL = SELF_HOSTED_URL ?? CLOUD_URL;
export const isSelfHosted = Boolean(SELF_HOSTED_URL);

const DEFAULT_TIMEOUT_MS = 30_000;

function buildHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (isSelfHosted && SELF_HOSTED_TOKEN) {
    h["X-GH-Token"] = SELF_HOSTED_TOKEN;
  }
  return h;
}

function buildUrl(path: string): string {
  if (isSelfHosted) {
    return `${GH_BASE_URL}${path}`;
  }
  const sep = path.includes("?") ? "&" : "?";
  return `${GH_BASE_URL}${path}${sep}key=${CLOUD_API_KEY}`;
}

async function ghFetch(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(path), {
      ...init,
      headers: { ...buildHeaders(), ...(init.headers as Record<string, string> ?? {}) },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GHPoint {
  lat: number;
  lon: number;
}

export interface MapMatchResult {
  paths: Array<{
    distance: number;
    time: number;
    points: { coordinates: [number, number][] };
    details?: {
      osm_way_id?: Array<[number, number, number]>;
      [key: string]: unknown;
    };
  }>;
}

export interface GHServerInfo {
  status: string;
  graph_loaded?: boolean;
  osm_date?: string;
  version?: string;
  profiles?: string[];
}

// ─── Map Matching API ──────────────────────────────────────────────────────────

/**
 * Invia una traccia GPS al Map Matching API di GraphHopper.
 * Restituisce i segmenti OSM associati a ciascun punto della traccia.
 *
 * @param points   Array di punti GPS [{lat, lon}]
 * @param profile  Profilo di routing (default: "motorcycle")
 * @returns        MapMatchResult con details.osm_way_id
 */
export async function mapMatch(
  points: GHPoint[],
  profile = "motorcycle",
): Promise<MapMatchResult> {
  if (!isSelfHosted && !CLOUD_API_KEY) {
    throw new Error(
      "GraphHopper non configurato: impostare GRAPHHOPPER_URL (self-hosted) o GRAPHHOPPER_API_KEY (cloud).",
    );
  }

  const body = {
    points: points.map((p) => [p.lon, p.lat]),
    profile,
    details: ["osm_way_id"],
    points_encoded: false,
  };

  const res = await ghFetch("/match", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GraphHopper /match error ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<MapMatchResult>;
}

// ─── Route API ─────────────────────────────────────────────────────────────────

export interface RouteRequest {
  points: [number, number][];
  profile?: string;
  instructions?: boolean;
  calc_points?: boolean;
  points_encoded?: boolean;
  elevation?: boolean;
  details?: string[];
  custom_model?: Record<string, unknown>;
}

export interface RouteResult {
  paths: Array<{
    distance: number;
    time: number;
    ascend?: number;
    descend?: number;
    points: string | { coordinates: [number, number][] };
    instructions?: unknown[];
    details?: Record<string, unknown>;
  }>;
}

/**
 * Calcola un percorso tra due o più waypoint.
 * Usare come alternativa self-hosted a planned-routes.ts (che chiama la Cloud API).
 */
export async function calculateRoute(req: RouteRequest): Promise<RouteResult> {
  if (!isSelfHosted && !CLOUD_API_KEY) {
    throw new Error(
      "GraphHopper non configurato: impostare GRAPHHOPPER_URL (self-hosted) o GRAPHHOPPER_API_KEY (cloud).",
    );
  }

  const body: Record<string, unknown> = {
    points: req.points,
    profile: req.profile ?? "motorcycle",
    instructions: req.instructions ?? true,
    calc_points: req.calc_points ?? true,
    points_encoded: req.points_encoded ?? true,
    elevation: req.elevation ?? true,
  };
  if (req.details?.length) body.details = req.details;
  if (req.custom_model) body.custom_model = req.custom_model;

  const res = await ghFetch("/route", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GraphHopper /route error ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<RouteResult>;
}

// ─── Health / Info ─────────────────────────────────────────────────────────────

/**
 * Controlla lo stato del server GraphHopper.
 * Per il self-hosted chiama /health (endpoint pubblico senza auth).
 * Per la Cloud API chiama /info.
 */
export async function getServerInfo(): Promise<GHServerInfo> {
  try {
    const path = isSelfHosted ? "/health" : "/info";
    const res = await ghFetch(path, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<GHServerInfo>;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", graph_loaded: false, version: msg };
  }
}
