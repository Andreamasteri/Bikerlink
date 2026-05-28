// Task #2686 — Health check periodico per tile servers + routing engines.
// HEAD ping con timeout breve. Risultati ritornati come array a maps-collector.
import { logger } from "../../lib/logger";

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
}

interface Target { kind: "tile" | "engine"; id: string; url: string; }

function tileTargets(): Target[] {
  // Endpoint statici (z/x/y noti) - 0/0/0 esiste per tutti gli schemi standard.
  return [
    { kind: "tile", id: "carto-light", url: "https://a.basemaps.cartocdn.com/light_all/0/0/0.png" },
    { kind: "tile", id: "carto-dark", url: "https://a.basemaps.cartocdn.com/dark_all/0/0/0.png" },
    { kind: "tile", id: "osm-standard", url: "https://tile.openstreetmap.org/0/0/0.png" },
  ];
}

function engineTargets(): Target[] {
  const out: Target[] = [];
  const ghBase = process.env.GRAPHHOPPER_SELF_HOSTED_URL ?? process.env.GRAPHHOPPER_URL;
  if (ghBase) {
    out.push({ kind: "engine", id: "graphhopper", url: `${ghBase.replace(/\/$/, "")}/health` });
  }
  const valhalla = process.env.VALHALLA_URL;
  if (valhalla) {
    out.push({ kind: "engine", id: "valhalla", url: `${valhalla.replace(/\/$/, "")}/status` });
  }
  if (process.env.MAPBOX_ACCESS_TOKEN) {
    out.push({ kind: "engine", id: "mapbox", url: "https://api.mapbox.com/" });
  }
  if (process.env.TOMTOM_API_KEY) {
    out.push({ kind: "engine", id: "tomtom", url: "https://api.tomtom.com/" });
  }
  return out;
}

async function pingOne(t: Target): Promise<HealthCheckResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    // HEAD per tile (più leggero); GET con header range per engine.
    const method = t.kind === "tile" ? "HEAD" : "GET";
    const resp = await fetch(t.url, { method, signal: ctrl.signal, redirect: "follow" });
    const latencyMs = Date.now() - started;
    const ok = resp.status < 500 && (t.kind === "engine" || resp.status < 400);
    return {
      kind: t.kind, id: t.id, url: t.url, ok, latencyMs, statusCode: resp.status,
      severity: !ok ? (t.kind === "engine" ? "critical" : "high") : undefined,
    };
  } catch (err) {
    return {
      kind: t.kind, id: t.id, url: t.url, ok: false, latencyMs: null,
      error: (err as Error).message?.slice(0, 200),
      severity: t.kind === "engine" ? "critical" : "high",
    };
  } finally {
    clearTimeout(timer);
  }
}

let lastRunAt = 0;
let cachedResults: HealthCheckResult[] = [];
const CACHE_TTL_MS = 5 * 60_000;

export async function runMapsHealthChecks(force = false): Promise<HealthCheckResult[]> {
  const now = Date.now();
  if (!force && now - lastRunAt < CACHE_TTL_MS && cachedResults.length > 0) {
    return cachedResults;
  }
  const targets = [...tileTargets(), ...engineTargets()];
  const results = await Promise.all(targets.map(pingOne));
  cachedResults = results;
  lastRunAt = now;
  const downs = results.filter((r) => !r.ok);
  if (downs.length > 0) {
    log.warn({ downs: downs.map((d) => ({ id: d.id, kind: d.kind, error: d.error })) }, "health-check problemi rilevati");
  }
  return results;
}

export function getLastHealthCheckResults(): { at: number; results: HealthCheckResult[] } {
  return { at: lastRunAt, results: cachedResults };
}
