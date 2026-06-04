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

/**
 * Quando il routing è self-hosted (PC di casa esposto via tunnel/Nginx) ma è
 * configurata anche una GRAPHHOPPER_API_KEY, l'app può degradare con grazia
 * verso la Cloud API se il server di casa è offline (timeout/5xx/errore di rete)
 * invece di restituire 502 ai client.
 */
export const canFallbackToCloud = isSelfHosted && Boolean(CLOUD_API_KEY);

/**
 * KILL-SWITCH ROUTING — BikerLink (Task #2824)
 *
 * Quando il routing è disabilitato, TUTTE le chiamate a GraphHopper (route,
 * map-matching, server-info) vengono bloccate. Le route che dipendono dal
 * routing devono usare un fallback (es: buildFallbackRoute in waypoints.ts)
 * oppure ritornare 503.
 *
 * Lo stato è ora gestito da `routing/routing-kill-switch.ts`: hard override env
 * `ROUTING_DISABLED` + soft toggle DB `routing_kill_switch` (modificabile da
 * admin). Il sistema renderer mappa (Leaflet + Carto/Esri tiles) NON è impattato.
 */
export { isRoutingEnabled } from "./routing/routing-kill-switch";
import { isRoutingEnabled as _isRoutingEnabled } from "./routing/routing-kill-switch";

/**
 * Profilo attivo: "motorcycle" quando si usa il server self-hosted,
 * "car" quando si usa la Cloud API (il piano gratuito non supporta motorcycle).
 */
export const ACTIVE_PROFILE = isSelfHosted ? "motorcycle" : "car";

// ─── Startup log ───────────────────────────────────────────────────────────────
// Lo stato kill-switch soft è risolto a runtime dal DB: log async fire-and-forget.
void _isRoutingEnabled().then((enabled) => {
  if (!enabled) {
    console.warn("[GraphHopper] ROUTING DISABILITATO via kill-switch — tutte le chiamate verranno bloccate. Rendering mappa non impattato.");
  } else if (isSelfHosted) {
    console.log(`[GraphHopper] Self-hosted mode — URL: ${GH_BASE_URL} — profile: motorcycle`);
  } else if (CLOUD_API_KEY) {
    console.warn("[GraphHopper] Cloud API mode — profile forced to 'car' (motorcycle not available on free plan)");
  } else {
    console.warn("[GraphHopper] Non configurato — nessuna variabile GRAPHHOPPER_URL o GRAPHHOPPER_API_KEY. Routing approssimativo attivo.");
  }
});

const DEFAULT_TIMEOUT_MS = 30_000;

function buildHeaders(useCloud: boolean): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (!useCloud && isSelfHosted && SELF_HOSTED_TOKEN) {
    h["X-GH-Token"] = SELF_HOSTED_TOKEN;
  }
  return h;
}

function buildUrl(path: string, useCloud: boolean): string {
  if (!useCloud && isSelfHosted) {
    return `${GH_BASE_URL}${path}`;
  }
  const sep = path.includes("?") ? "&" : "?";
  return `${CLOUD_URL}${path}${sep}key=${CLOUD_API_KEY}`;
}

async function ghFetch(path: string, init: RequestInit, useCloud = false): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(path, useCloud), {
      ...init,
      headers: { ...buildHeaders(useCloud), ...(init.headers as Record<string, string> ?? {}) },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Stato salute routing self-hosted ────────────────────────────────────────
// Aggiornato a ogni chiamata self-hosted (route/match/health). Consumato dal
// pannello admin per segnalare quando il server di casa è offline.

export interface RoutingHealthSnapshot {
  /** true quando GRAPHHOPPER_URL punta al server self-hosted (PC di casa). */
  selfHosted: boolean;
  /** Esito ultima interazione col server self-hosted: null = mai contattato. */
  ok: boolean | null;
  /** Timestamp (ms) dell'ultima interazione registrata. */
  lastCheckAt: number | null;
  /** Latenza (ms) dell'ultima interazione riuscita. */
  latencyMs: number | null;
  /** Messaggio di errore dell'ultima interazione fallita. */
  error: string | null;
  /** Fallimenti consecutivi del server self-hosted. */
  consecutiveFailures: number;
  /** true se la Cloud API è disponibile come fallback automatico. */
  cloudFallbackAvailable: boolean;
  /** true se l'ultima richiesta è stata servita dalla Cloud per fallback. */
  cloudFallbackActive: boolean;
}

const selfHostHealth = {
  ok: null as boolean | null,
  lastCheckAt: null as number | null,
  latencyMs: null as number | null,
  error: null as string | null,
  consecutiveFailures: 0,
  cloudFallbackActive: false,
};

function recordSelfHostSuccess(latencyMs: number): void {
  selfHostHealth.ok = true;
  selfHostHealth.lastCheckAt = Date.now();
  selfHostHealth.latencyMs = latencyMs;
  selfHostHealth.error = null;
  selfHostHealth.consecutiveFailures = 0;
  selfHostHealth.cloudFallbackActive = false;
}

function recordSelfHostFailure(error: string, fellBackToCloud: boolean): void {
  selfHostHealth.ok = false;
  selfHostHealth.lastCheckAt = Date.now();
  selfHostHealth.latencyMs = null;
  selfHostHealth.error = error.slice(0, 300);
  selfHostHealth.consecutiveFailures += 1;
  selfHostHealth.cloudFallbackActive = fellBackToCloud;
}

/**
 * Snapshot dello stato di salute del routing self-hosted per il pannello admin.
 */
export function getRoutingHealthSnapshot(): RoutingHealthSnapshot {
  return {
    selfHosted: isSelfHosted,
    ok: selfHostHealth.ok,
    lastCheckAt: selfHostHealth.lastCheckAt,
    latencyMs: selfHostHealth.latencyMs,
    error: selfHostHealth.error,
    consecutiveFailures: selfHostHealth.consecutiveFailures,
    cloudFallbackAvailable: canFallbackToCloud,
    cloudFallbackActive: selfHostHealth.cloudFallbackActive,
  };
}

/**
 * Determina se un errore/risposta del server self-hosted è "transitorio" e
 * giustifica il fallback Cloud: timeout (AbortError), errore di rete (TypeError),
 * o risposta HTTP 5xx (incl. 502/504 tipici di tunnel/Nginx con backend giù).
 */
function isSelfHostDown(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    if (err instanceof TypeError) return true;
    if (/^HTTP 5\d{2}/.test(err.message)) return true;
  }
  return false;
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
  if (!(await _isRoutingEnabled())) {
    throw new Error("Routing disabilitato via kill-switch.");
  }
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

  const start = Date.now();
  try {
    const res = await ghFetch("/match", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: GraphHopper /match — ${text.slice(0, 300)}`);
    }
    const out = await res.json() as MapMatchResult;
    if (isSelfHosted) recordSelfHostSuccess(Date.now() - start);
    return out;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isSelfHosted) recordSelfHostFailure(msg, false);
    if (isSelfHosted && isSelfHostDown(err)) {
      throw new Error(`Map-matching non disponibile: server di routing self-hosted offline. Dettaglio: ${msg.slice(0, 200)}`);
    }
    throw err instanceof Error ? err : new Error(msg);
  }
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
  optimize?: boolean;
  heading?: number;
  language?: string;
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
 * Supporta sia self-hosted che Cloud API come fallback.
 */
export async function calculateRoute(req: RouteRequest): Promise<RouteResult> {
  if (!(await _isRoutingEnabled())) {
    throw new Error("Routing disabilitato via kill-switch.");
  }
  if (!isSelfHosted && !CLOUD_API_KEY) {
    throw new Error(
      "GraphHopper non configurato: impostare GRAPHHOPPER_URL (self-hosted) o GRAPHHOPPER_API_KEY (cloud).",
    );
  }

  const effectiveProfile = req.profile ?? ACTIVE_PROFILE;
  const body: Record<string, unknown> = {
    points: req.points,
    profile: effectiveProfile,
    instructions: req.instructions ?? true,
    calc_points: req.calc_points ?? true,
    points_encoded: req.points_encoded ?? true,
    elevation: req.elevation ?? true,
  };
  if (req.details?.length) body.details = req.details;
  if (req.custom_model) body.custom_model = req.custom_model;
  if (req.optimize !== undefined) body.optimize = req.optimize;
  if (req.heading !== undefined) body.heading = req.heading;

  const extraHeaders: Record<string, string> = {};
  if (req.language) extraHeaders["Accept-Language"] = req.language;

  const doFetch = async (useCloud: boolean): Promise<RouteResult> => {
    // La Cloud API (piano free) non supporta il profilo motorcycle: forziamo car.
    const fetchBody = useCloud ? { ...body, profile: "car" } : body;
    const res = await ghFetch("/route", {
      method: "POST",
      headers: extraHeaders,
      body: JSON.stringify(fetchBody),
    }, useCloud);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: GraphHopper /route — ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<RouteResult>;
  };

  // Caso non self-hosted (solo cloud): nessun fallback, comportamento invariato.
  if (!isSelfHosted) {
    return doFetch(true);
  }

  const start = Date.now();
  try {
    const out = await doFetch(false);
    recordSelfHostSuccess(Date.now() - start);
    return out;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (canFallbackToCloud && isSelfHostDown(err)) {
      console.warn(`[GraphHopper] Self-hosted DOWN (${msg}) — fallback automatico alla Cloud API (profilo car).`);
      try {
        const out = await doFetch(true);
        recordSelfHostFailure(msg, true);
        return out;
      } catch (cloudErr: unknown) {
        const cloudMsg = cloudErr instanceof Error ? cloudErr.message : String(cloudErr);
        recordSelfHostFailure(`self-host: ${msg} | cloud: ${cloudMsg}`, false);
        throw new Error(`GraphHopper non disponibile (self-hosted offline e fallback Cloud fallito): ${cloudMsg.slice(0, 200)}`);
      }
    }
    recordSelfHostFailure(msg, false);
    if (isSelfHostDown(err)) {
      throw new Error(`Server di routing self-hosted offline e nessun fallback Cloud configurato (GRAPHHOPPER_API_KEY). Dettaglio: ${msg.slice(0, 200)}`);
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}

// ─── Health / Info ─────────────────────────────────────────────────────────────

/**
 * Controlla lo stato del server GraphHopper.
 * Per il self-hosted chiama /health (endpoint pubblico senza auth).
 * Per la Cloud API chiama /info.
 */
export async function getServerInfo(): Promise<GHServerInfo> {
  if (!(await _isRoutingEnabled())) {
    return { status: "disabled", graph_loaded: false, version: "routing-kill-switch" };
  }
  const start = Date.now();
  try {
    const path = isSelfHosted ? "/health" : "/info";
    const res = await ghFetch(path, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = await res.json() as GHServerInfo;
    if (isSelfHosted) recordSelfHostSuccess(Date.now() - start);
    return info;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Molti deploy self-hosted dietro tunnel/Nginx NON espongono /health (404 o
    // connessione rifiutata) pur instradando regolarmente /route. In quel caso
    // una vera richiesta /route minima è la prova del nove che il motore è su:
    // evita falsi "offline/errore" nel pannello admin quando il routing funziona.
    if (isSelfHosted) {
      try {
        const t0 = Date.now();
        const probe = await ghFetch("/route", {
          method: "POST",
          body: JSON.stringify({
            points: [[9.19, 45.46], [9.08, 45.81]],
            profile: ACTIVE_PROFILE,
            points_encoded: true,
            instructions: false,
            calc_points: false,
          }),
        });
        if (probe.ok) {
          recordSelfHostSuccess(Date.now() - t0);
          return { status: "ok", graph_loaded: true };
        }
      } catch {
        // ricade nel record di fallimento sottostante
      }
      recordSelfHostFailure(msg, false);
    }
    return { status: "error", graph_loaded: false, version: msg };
  }
}
