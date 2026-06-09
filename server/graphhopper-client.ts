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
 * Base self-hosted "pulita" (senza slash finale), stringa vuota se non
 * configurata. Usata dal routing ad aree per costruire l'URL per-istanza
 * (`${SELF_HOSTED_BASE_URL}/areas/<codice>`).
 */
export const SELF_HOSTED_BASE_URL = SELF_HOSTED_URL ?? "";

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
import { ROUTING_AREAS } from "@shared/routing-areas";

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

const SELF_HOSTED_TIMEOUT_MS = 9_000;
const CLOUD_TIMEOUT_MS = 30_000;

function buildHeaders(useCloud: boolean): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (!useCloud && isSelfHosted && SELF_HOSTED_TOKEN) {
    h["X-GH-Token"] = SELF_HOSTED_TOKEN;
  }
  return h;
}

function buildUrl(path: string, useCloud: boolean, baseOverride?: string): string {
  if (!useCloud && isSelfHosted) {
    // baseOverride: usato dal routing ad aree per puntare l'istanza per-area.
    const base = baseOverride && baseOverride.length > 0 ? baseOverride : GH_BASE_URL;
    return `${base}${path}`;
  }
  const sep = path.includes("?") ? "&" : "?";
  return `${CLOUD_URL}${path}${sep}key=${CLOUD_API_KEY}`;
}

async function ghFetch(
  path: string,
  init: RequestInit,
  useCloud = false,
  baseOverride?: string,
): Promise<Response> {
  const timeoutMs = useCloud ? CLOUD_TIMEOUT_MS : SELF_HOSTED_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(buildUrl(path, useCloud, baseOverride), {
      ...init,
      headers: { ...buildHeaders(useCloud), ...(init.headers as Record<string, string> ?? {}) },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Ring-buffer storico eventi up/down ──────────────────────────────────────
// Mantiene fino a HISTORY_MAX eventi nelle ultime 24h. Un evento viene
// registrato solo quando lo stato cambia (up→down o down→up) per evitare
// di saturare il buffer con chiamate ripetute dello stesso stato.

export interface RoutingEvent {
  ts: number;
  type: "up" | "down";
  error_type?: "tunnel_down" | "profile_missing" | "routing_error";
  error?: string;
  duration_ms?: number;
}

const HISTORY_MAX = 100;
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

const routingHistory: RoutingEvent[] = [];
let lastEventType: "up" | "down" | null = null;
let downSince: number | null = null;

function pushRoutingEvent(ev: RoutingEvent): void {
  routingHistory.push(ev);
  if (routingHistory.length > HISTORY_MAX) routingHistory.shift();
}

export function getRoutingHistory(): RoutingEvent[] {
  const cutoff = Date.now() - HISTORY_TTL_MS;
  return routingHistory.filter((e) => e.ts >= cutoff);
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
  /** Timestamp (ms) dell'ultimo fallimento. */
  lastFailureAt: number | null;
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
  lastFailureAt: null as number | null,
  latencyMs: null as number | null,
  error: null as string | null,
  consecutiveFailures: 0,
  cloudFallbackActive: false,
};

function recordSelfHostSuccess(latencyMs: number): void {
  const now = Date.now();
  selfHostHealth.ok = true;
  selfHostHealth.lastCheckAt = now;
  selfHostHealth.latencyMs = latencyMs;
  selfHostHealth.error = null;
  selfHostHealth.consecutiveFailures = 0;
  selfHostHealth.cloudFallbackActive = false;

  if (lastEventType !== "up") {
    const duration_ms = downSince != null ? now - downSince : undefined;
    pushRoutingEvent({ ts: now, type: "up", duration_ms });
    lastEventType = "up";
    downSince = null;
  }
}

function recordSelfHostFailure(error: string, fellBackToCloud: boolean): void {
  const now = Date.now();
  selfHostHealth.ok = false;
  selfHostHealth.lastCheckAt = now;
  selfHostHealth.lastFailureAt = now;
  selfHostHealth.latencyMs = null;
  selfHostHealth.error = error.slice(0, 300);
  selfHostHealth.consecutiveFailures += 1;
  selfHostHealth.cloudFallbackActive = fellBackToCloud;

  if (lastEventType !== "down") {
    downSince = now;
    const errType = classifyGHError(error);
    pushRoutingEvent({
      ts: now,
      type: "down",
      error_type: errType === "ok" ? undefined : errType,
      error: error.slice(0, 200),
    });
    lastEventType = "down";
  }
}

/**
 * Snapshot dello stato di salute del routing self-hosted per il pannello admin.
 */
export function getRoutingHealthSnapshot(): RoutingHealthSnapshot {
  return {
    selfHosted: isSelfHosted,
    ok: selfHostHealth.ok,
    lastCheckAt: selfHostHealth.lastCheckAt,
    lastFailureAt: selfHostHealth.lastFailureAt,
    latencyMs: selfHostHealth.latencyMs,
    error: selfHostHealth.error,
    consecutiveFailures: selfHostHealth.consecutiveFailures,
    cloudFallbackAvailable: canFallbackToCloud,
    cloudFallbackActive: selfHostHealth.cloudFallbackActive,
  };
}

export interface GHProfilesResult {
  /** true se l'endpoint /info ha risposto (anche con errore HTTP non-auth) */
  reachable: boolean;
  /** Profili estratti da /info, oppure null se non disponibili o server unreachable */
  profiles: string[] | null;
  /** Motivo dettagliato in caso di fallimento: "timeout" | "network" | "http_NNN" | "parse" */
  error_reason: string | null;
}

/**
 * Recupera i profili supportati dal server GH self-hosted tramite /info.
 * Restituisce un oggetto strutturato che distingue "tunnel giù" (reachable=false)
 * da altri fallimenti (es. risposta malformata, auth).
 */
export async function fetchSelfHostedProfiles(): Promise<GHProfilesResult> {
  if (!isSelfHosted) return { reachable: false, profiles: null, error_reason: "not_self_hosted" };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SELF_HOSTED_TOKEN) headers["X-GH-Token"] = SELF_HOSTED_TOKEN;

  // Con il setup multi-area, ogni istanza GH risponde su /areas/<codice>/info —
  // non esiste un /info alla root. Proviamo le aree in ordine finché una risponde.
  for (const area of ROUTING_AREAS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const res = await fetch(`${GH_BASE_URL}${area.path}/info`, { headers, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;
      let profiles: string[] | null = null;
      if (Array.isArray(data.supported_vehicles)) {
        profiles = data.supported_vehicles as string[];
      } else if (Array.isArray(data.profiles)) {
        profiles = (data.profiles as Array<{ name: string } | string>).map(
          (p) => (typeof p === "string" ? p : p.name),
        );
      }
      if (profiles) return { reachable: true, profiles, error_reason: null };
    } catch {
      clearTimeout(timer);
    }
  }

  // Nessuna area ha risposto con profili validi — server non raggiungibile o parse error
  return { reachable: false, profiles: null, error_reason: "network" };
}

/**
 * Classifica il tipo di errore GH per il pannello admin.
 */
export function classifyGHError(
  error: string | null,
): "tunnel_down" | "profile_missing" | "routing_error" | "ok" {
  if (!error) return "ok";
  const lower = error.toLowerCase();
  if (
    lower.includes("aborterror") ||
    lower.includes("aborted") ||
    lower.includes("timeout") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("typeerror") ||
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("http 502") ||
    lower.includes("http 503") ||
    lower.includes("http 504") ||
    lower.includes("connection refused")
  ) {
    return "tunnel_down";
  }
  if (
    lower.includes("profile") ||
    lower.includes("vehicle") ||
    lower.includes("http 400")
  ) {
    return "profile_missing";
  }
  return "routing_error";
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
export async function calculateRoute(
  req: RouteRequest,
  opts?: { selfHostedBaseUrl?: string },
): Promise<RouteResult> {
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
    }, useCloud, useCloud ? undefined : opts?.selfHostedBaseUrl);
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

  // Self-hosted: tenta, poi 1 retry con breve backoff, poi fallback Cloud.
  const attemptSelf = async (): Promise<RouteResult> => {
    const t0 = Date.now();
    const out = await doFetch(false);
    recordSelfHostSuccess(Date.now() - t0);
    return out;
  };

  try {
    return await attemptSelf();
  } catch (firstErr: unknown) {
    const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    if (!isSelfHostDown(firstErr)) {
      recordSelfHostFailure(firstMsg, false);
      throw firstErr instanceof Error ? firstErr : new Error(firstMsg);
    }
    // Errore transitorio: 1 retry dopo 400ms prima di scalare al cloud.
    console.warn(`[GraphHopper] Self-hosted: errore transitorio (${firstMsg}), retry in 400ms…`);
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
    try {
      return await attemptSelf();
    } catch (retryErr: unknown) {
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      if (canFallbackToCloud && isSelfHostDown(retryErr)) {
        console.warn(`[GraphHopper] Self-hosted ancora offline dopo retry (${msg}) — fallback Cloud API (profilo car).`);
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
      if (isSelfHostDown(retryErr)) {
        throw new Error(`Server di routing self-hosted offline e nessun fallback Cloud configurato (GRAPHHOPPER_API_KEY). Dettaglio: ${msg.slice(0, 200)}`);
      }
      throw retryErr instanceof Error ? retryErr : new Error(msg);
    }
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
