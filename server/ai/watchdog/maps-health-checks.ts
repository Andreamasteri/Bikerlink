// Health check periodico per tile servers + routing engines.
// HEAD ping con timeout breve. Risultati ritornati come array a maps-collector.
//
// Task #3123 (Routing aree — C): oltre al monolite GraphHopper, quando il
// routing ad aree è attivo si probano anche le singole istanze per-gruppo
// abilitate (`${SELF_HOSTED_BASE_URL}/areas/<codice>`), con id `area-<codice>`.
import { logger } from "../../lib/logger";
import { SELF_HOSTED_BASE_URL, isSelfHosted } from "../../graphhopper-client";
import { getRoutingAreaMode } from "../../routing/routing-area-mode";
import { getAreaEnabledMap } from "../../routing/routing-area-state";
import { ROUTING_AREAS, routingAreaUrl } from "@shared/routing-areas";
import { isThinkCentreInMaintenance } from "../../lib/thinkcentre-maintenance";
import { isThinkCentrePoweredOff } from "../../lib/thinkcentre-powered-off";
import { cfAccessHeaders } from "../../lib/cf-access";

const log = logger.child({ scope: "maps-watchdog", check: "health" });

const TIMEOUT_MS = 4_000;

export interface HealthCheckResult {
  kind: "tile" | "engine";
  id: string;
  url: string;
  ok: boolean;
  latencyMs: number | null;
  statusCode?: number;
  error?: string;
  severity?: "warn" | "high" | "critical";
  /** true per engine cloud supplementari (TomTom, Mapbox) — non bloccanti. */
  cloudEngine?: boolean;
}

interface Target { kind: "tile" | "engine"; id: string; url: string; headers?: Record<string, string>; cloudEngine?: boolean; }

/**
 * Classifica un errore di rete in un messaggio leggibile (italiano).
 * "fetch failed" / ENOTFOUND → DNS non risolve (tunnel offline o dominio inesistente).
 * AbortError → timeout.
 * ECONNREFUSED → porta chiusa.
 */
function classifyNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  if (name === "AbortError") return "timeout";
  const lower = msg.toLowerCase();
  if (lower.includes("enotfound") || lower.includes("getaddrinfo") || lower.includes("fetch failed")) {
    return "DNS non risolve — tunnel offline?";
  }
  if (lower.includes("econnrefused")) return "connessione rifiutata";
  if (lower.includes("econnreset") || lower.includes("socket hang up")) return "connessione interrotta";
  return msg.slice(0, 100);
}

function tileTargets(): Target[] {
  return [
    { kind: "tile", id: "carto-light", url: "https://a.basemaps.cartocdn.com/light_all/0/0/0.png" },
    { kind: "tile", id: "carto-dark",  url: "https://a.basemaps.cartocdn.com/dark_all/0/0/0.png" },
    { kind: "tile", id: "osm-standard", url: "https://tile.openstreetmap.org/0/0/0.png" },
  ];
}

function engineTargets(): Target[] {
  const out: Target[] = [];
  const ghBase = process.env.GRAPHHOPPER_SELF_HOSTED_URL ?? process.env.GRAPHHOPPER_URL;
  if (ghBase) {
    const ghHeaders: Record<string, string> = { ...cfAccessHeaders() };
    if (process.env.GRAPHHOPPER_TOKEN) ghHeaders["X-GH-Token"] = process.env.GRAPHHOPPER_TOKEN;
    out.push({ kind: "engine", id: "graphhopper", url: `${ghBase.replace(/\/$/, "")}/health`, headers: ghHeaders });
  }
  const valhalla = process.env.VALHALLA_URL;
  if (valhalla) {
    const vHeaders: Record<string, string> = { ...cfAccessHeaders() };
    if (process.env.VALHALLA_API_KEY) vHeaders["X-Valhalla-Key"] = process.env.VALHALLA_API_KEY;
    out.push({ kind: "engine", id: "valhalla", url: `${valhalla.replace(/\/$/, "")}/status`, headers: vHeaders });
  }
  if (process.env.MAPBOX_ACCESS_TOKEN) {
    out.push({ kind: "engine", id: "mapbox", url: "https://api.mapbox.com/", cloudEngine: true });
  }
  if (process.env.TOMTOM_API_KEY) {
    // Routing minimale: verifica anche l'autenticazione, non solo la raggiungibilità del dominio.
    const key = process.env.TOMTOM_API_KEY;
    out.push({
      kind: "engine", id: "tomtom",
      url: `https://api.tomtom.com/routing/1/calculateRoute/0,0:1,1/json?key=${key}&routeType=fastest&travelMode=motorcycle`,
      cloudEngine: true,
    });
  }
  return out;
}

/**
 * Target per le istanze GraphHopper per-gruppo (routing ad aree).
 * Solo quando il self-hosting è attivo, il master toggle non è "disabled" e il
 * gruppo è abilitato (probare istanze spente sarebbe rumore inutile).
 * id = `area-<codice>`, così maps-collector emette `health.engine.area-<codice>`.
 * Saltate quando la manutenzione programmata del ThinkCentre è attiva.
 */
export async function areaEngineTargets(): Promise<Target[]> {
  if (!isSelfHosted || !SELF_HOSTED_BASE_URL) return [];
  if (await isThinkCentrePoweredOff()) return [];
  if (await isThinkCentreInMaintenance()) return [];
  let mode: string;
  try {
    mode = await getRoutingAreaMode();
  } catch {
    return [];
  }
  if (mode === "disabled") return [];

  let enabledMap: Record<string, boolean>;
  try {
    enabledMap = await getAreaEnabledMap();
  } catch {
    return [];
  }

  const headers: Record<string, string> = { ...cfAccessHeaders() };
  if (process.env.GRAPHHOPPER_TOKEN) headers["X-GH-Token"] = process.env.GRAPHHOPPER_TOKEN;

  return ROUTING_AREAS.filter((a) => enabledMap[a.codice]).map((a) => ({
    kind: "engine" as const,
    id: `area-${a.codice}`,
    url: `${routingAreaUrl(a, SELF_HOSTED_BASE_URL)}/health`,
    headers,
  }));
}

async function pingOne(t: Target): Promise<HealthCheckResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const method = t.kind === "tile" ? "HEAD" : "GET";
    const resp = await fetch(t.url, {
      method,
      signal: ctrl.signal,
      redirect: "follow",
      headers: t.headers ?? {},
    });
    const latencyMs = Date.now() - started;
    const ok = resp.status < 500 && (t.kind === "engine" || resp.status < 400);
    const failSeverity: "high" | "critical" =
      t.kind !== "engine" ? "high" : t.cloudEngine ? "high" : "critical";
    return {
      kind: t.kind, id: t.id, url: t.url, ok, latencyMs, statusCode: resp.status,
      severity: !ok ? failSeverity : undefined,
      cloudEngine: t.cloudEngine,
    };
  } catch (err) {
    const failSeverity: "high" | "critical" =
      t.kind !== "engine" ? "high" : t.cloudEngine ? "high" : "critical";
    return {
      kind: t.kind, id: t.id, url: t.url, ok: false, latencyMs: null,
      error: classifyNetworkError(err),
      severity: failSeverity,
      cloudEngine: t.cloudEngine,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GraphHopper: double-probe come in thinkcentre-health.ts.
 * 1) GET /health (endpoint dedicato, se esposto)
 * 2) POST /route minimale (prova del nove per deploy senza /health)
 * Entrambi i tentativi usano il GRAPHHOPPER_TOKEN se configurato.
 */
async function pingGraphHopper(t: Target): Promise<HealthCheckResult> {
  const primary = await pingOne(t);
  if (primary.ok) return primary;

  // Se l'errore è di rete (DNS/timeout/refused) il fallback /route non aiuta:
  // il server è irraggiungibile. Lo segnaliamo direttamente senza tentare.
  const isNetErr = primary.latencyMs === null;
  if (isNetErr) return primary;

  // Il server è raggiungibile ma /health ha risposto male (404, 403…):
  // proviamo /route minimale come fallback (Milano→Como).
  const base = t.url.replace(/\/health$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const resp = await fetch(`${base}/route`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(t.headers ?? {}) },
      body: JSON.stringify({
        points: [[9.19, 45.46], [9.08, 45.81]],
        profile: "motorcycle",
        points_encoded: true,
        instructions: false,
        calc_points: false,
      }),
    });
    const latencyMs = Date.now() - started;
    const ok = resp.status >= 200 && resp.status < 300;
    return {
      kind: t.kind, id: t.id, url: t.url, ok, latencyMs, statusCode: resp.status,
      error: ok ? undefined : `HTTP ${resp.status} (route fallback)`,
      severity: ok ? undefined : "critical",
    };
  } catch (err) {
    return {
      kind: t.kind, id: t.id, url: t.url, ok: false, latencyMs: null,
      error: classifyNetworkError(err),
      severity: "critical",
    };
  } finally {
    clearTimeout(timer);
  }
}

let lastRunAt = 0;
let cachedResults: HealthCheckResult[] = [];
const CACHE_TTL_MS = 5 * 60_000;
/** Stato manutenzione/powered-off nell'ultimo ciclo — undefined = prima esecuzione. */
let lastMaintenanceState: boolean | undefined = undefined;
let lastPoweredOffState: boolean | undefined = undefined;

export async function runMapsHealthChecks(force = false): Promise<HealthCheckResult[]> {
  const now = Date.now();
  // Manutenzione e powered-off vengono valutati PRIMA della cache: se un flag
  // cambia (in entrambe le direzioni) la cache viene ignorata per effetto immediato.
  const [inMaintenance, poweredOff] = await Promise.all([
    isThinkCentreInMaintenance(),
    isThinkCentrePoweredOff(),
  ]);
  const stateChanged =
    (lastMaintenanceState !== undefined && lastMaintenanceState !== inMaintenance) ||
    (lastPoweredOffState !== undefined && lastPoweredOffState !== poweredOff);
  if (!force && !stateChanged && now - lastRunAt < CACHE_TTL_MS && cachedResults.length > 0) {
    return cachedResults;
  }
  const tiles = tileTargets();
  // Quando powered-off O manutenzione, si saltano i target self-hosted
  // (graphhopper, valhalla, aree); i target cloud (mapbox, tomtom, tile) continuano.
  const skipSelfHosted = poweredOff || inMaintenance;
  const engines = engineTargets().filter(
    (t) => !skipSelfHosted || (t.id !== "graphhopper" && t.id !== "valhalla"),
  );
  // areaEngineTargets controlla internamente powered-off e maintenance
  const areaEngines = skipSelfHosted ? [] : await areaEngineTargets();
  const allEngines = [...engines, ...areaEngines];

  const tileResults = await Promise.all(tiles.map(pingOne));
  const engineResults = await Promise.all(allEngines.map((t) =>
    t.id === "graphhopper" || t.id.startsWith("area-") ? pingGraphHopper(t) : pingOne(t),
  ));

  const results = [...tileResults, ...engineResults];
  cachedResults = results;
  lastRunAt = now;
  lastMaintenanceState = inMaintenance;
  lastPoweredOffState = poweredOff;

  const downs = results.filter((r) => !r.ok);
  if (downs.length > 0) {
    log.warn({ downs: downs.map((d) => ({ id: d.id, kind: d.kind, error: d.error })) }, "health-check problemi rilevati");
  }
  return results;
}

export function getLastHealthCheckResults(): { at: number; results: HealthCheckResult[] } {
  return { at: lastRunAt, results: cachedResults };
}
