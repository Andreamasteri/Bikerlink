/**
 * ThinkCentre — Infra probes
 *
 * Probe TCP per DragonflyDB, probe HTTP per nginx e Uptime Kuma.
 * Importati da thinkcentre-health.ts.
 *
 * Env vars:
 *   REDIS_PROBE_URL       URL HTTP del probe Redis via TC agent (es. https://tc.biker-link.net/probe/redis)
 *                         Se impostato ha precedenza su REDIS_PROBE_HOST (modalità TCP diretta).
 *   REDIS_PROBE_HOST      hostname/IP Redis (TCP diretto, fallback se REDIS_PROBE_URL non impostato)
 *   REDIS_PROBE_PORT      porta Redis (default: 6379, usato solo in modalità TCP)
 *   NGINX_MONITOR_URL     URL nginx  — punta al probe TC agent: https://tc.biker-link.net/probe/nginx
 *   UPTIME_KUMA_URL       URL Uptime Kuma — punta al probe TC agent: https://tc.biker-link.net/probe/uptime-kuma
 */

import { tcpConnectDetailed } from "../../jobs/thinkcentre-monitor-probes";
import { hubGet, isHubConfigured, getHubBaseUrl, HUB_HEALTH_TIMEOUT_MS, HUB_VRAM_TIMEOUT_MS } from "../../lib/ai-hub-client";
import {
  sanitizeError,
  maskUrl,
  httpProbe,
  recordError,
  recordProbeLog,
  getHistory,
  getProbeLog,
  type ProbeLogEntry,
} from "./thinkcentre-health-utils";

export type { ProbeLogEntry };

export interface InfraServiceHealth {
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
  history: Array<{ timestamp: number; error: string }>;
  probeLog: ProbeLogEntry[];
  /** Task #549 — "pushed" when api-server has sent agent-map; "default" during pre-push window. */
  vramAgentMapSource?: "default" | "pushed" | null;
}

// ── Classificazione errore auth agente TC ──────────────────────────────────────
// Distingue "auth mancante/errata" (401/403 dal TC agent) da un errore generico,
// così la UI non mostra un rosso ambiguo né — con la vecchia soglia `< 500` — un
// falso verde quando il token è sbagliato o assente.
function classifyAgentAuthError(rawError: string | undefined, agentToken: string): string {
  const error = rawError ?? "HTTP error";
  if (error.startsWith("HTTP 401") || error.startsWith("HTTP 403")) {
    return agentToken
      ? `Auth ThinkCentre rifiutata (THINKCENTRE_AGENT_TOKEN errato) — ${error}`
      : `Token ThinkCentre mancante (THINKCENTRE_AGENT_TOKEN) — ${error}`;
  }
  return error;
}

// ── TCP probe helper ──────────────────────────────────────────────────────────
// Socket raw + guard test-mode condivisi con `server/jobs/thinkcentre-monitor-probes.ts`
// (`tcpConnectDetailed`); qui applichiamo solo la classificazione/maschera errore
// specifica della UI admin.
async function tcpConnect(
  host: string,
  port: number,
): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
  const r = await tcpConnectDetailed(host, port);
  if (r.ok || !r.error) return r;
  const classified = /ECONNREFUSED|ENOTFOUND/i.test(r.error)
    ? `network error — ${r.error}`
    : r.error;
  return { ok: false, latencyMs: r.latencyMs, error: sanitizeError(classified) };
}

// ── DragonflyDB ───────────────────────────────────────────────────────────────
export async function probeDragonflyInfra(): Promise<InfraServiceHealth> {
  // Modalità HTTP via TC agent (DRAGONFLY_PROBE_URL ha precedenza; legacy REDIS_PROBE_URL)
  const probeUrl = (process.env.DRAGONFLY_PROBE_URL ?? process.env.REDIS_PROBE_URL)?.trim();
  if (probeUrl) {
    const agentToken = process.env.THINKCENTRE_AGENT_TOKEN ?? "";
    // Solo 2xx = up. 401/403 = auth (token TC mancante/errato), non "up":
    // con la vecchia soglia `< 500` un rifiuto di autenticazione mostrava verde.
    const r = await httpProbe(probeUrl, agentToken ? { "X-Agent-Token": agentToken } : {}, (s) => s >= 200 && s < 300);
    if (!r.ok) {
      const error = classifyAgentAuthError(r.error, agentToken);
      recordError("dragonfly", error);
      recordProbeLog("dragonfly", { timestamp: Date.now(), ok: false, latencyMs: r.latencyMs, detail: error });
      return { configured: true, ok: false, latencyMs: r.latencyMs, url: probeUrl, error, history: getHistory("dragonfly"), probeLog: getProbeLog("dragonfly") };
    }
    recordProbeLog("dragonfly", { timestamp: Date.now(), ok: true, latencyMs: r.latencyMs, detail: "HTTP probe OK" });
    return { configured: true, ok: true, latencyMs: r.latencyMs, url: probeUrl, history: getHistory("dragonfly"), probeLog: getProbeLog("dragonfly") };
  }

  // Modalità TCP diretta (fallback)
  const host = (process.env.DRAGONFLY_PROBE_HOST ?? process.env.REDIS_PROBE_HOST)?.trim();
  const port = parseInt(process.env.DRAGONFLY_PROBE_PORT ?? process.env.REDIS_PROBE_PORT ?? "6379", 10);
  if (!host) {
    return { configured: false, ok: false, latencyMs: null, url: null, history: getHistory("dragonfly"), probeLog: getProbeLog("dragonfly") };
  }
  const displayUrl = `${host}:${port}`;
  const r = await tcpConnect(host, port);
  if (!r.ok) {
    const error = r.error ?? "connection refused";
    console.error("[thinkcentre-probe] dragonfly KO", { error });
    recordError("dragonfly", error);
    recordProbeLog("dragonfly", { timestamp: Date.now(), ok: false, latencyMs: r.latencyMs, detail: error });
    return { configured: true, ok: false, latencyMs: r.latencyMs, url: displayUrl, error, history: getHistory("dragonfly"), probeLog: getProbeLog("dragonfly") };
  }
  recordProbeLog("dragonfly", { timestamp: Date.now(), ok: true, latencyMs: r.latencyMs, detail: "TCP connect OK" });
  return { configured: true, ok: true, latencyMs: r.latencyMs, url: displayUrl, history: getHistory("dragonfly"), probeLog: getProbeLog("dragonfly") };
}

// ── nginx symlinks guard ──────────────────────────────────────────────────────

export interface NginxSymlinksHealth {
  /** false quando NGINX_MONITOR_URL non è impostato */
  configured: boolean;
  /** true = tutti i vhost sono symlink; false = almeno un file reale trovato */
  ok: boolean;
  /** Nomi dei file reali (non symlink) trovati in sites-enabled/ */
  nonSymlinks: string[];
  error?: string;
}

/**
 * Chiama il probe /probe/nginx-symlinks sul TC agent per verificare che
 * ogni voce di /etc/nginx/sites-enabled/ sia un symlink verso sites-available/.
 * Un file reale causa il bug silenzioso "nginx -t passa ma le modifiche
 * non hanno effetto a runtime".
 *
 * Deriva l'URL del probe dalla variabile NGINX_MONITOR_URL (es.
 * https://tc.biker-link.net/probe/nginx → https://tc.biker-link.net/probe/nginx-symlinks).
 * Richiede l'header X-Agent-Token (THINKCENTRE_AGENT_TOKEN).
 */
export async function probeNginxSymlinksInfra(): Promise<NginxSymlinksHealth> {
  const monitorUrl = process.env.NGINX_MONITOR_URL?.trim().replace(/\/$/, "");
  if (!monitorUrl) return { configured: false, ok: true, nonSymlinks: [] };

  // Ricava il base dell'agente strippando il suffisso /probe/nginx* se presente,
  // oppure usa la URL com'è e appende il path.
  const agentBase = monitorUrl.replace(/\/probe\/nginx.*$/, "");
  const symlinksUrl = `${agentBase}/probe/nginx-symlinks`;

  const agentToken = process.env.THINKCENTRE_AGENT_TOKEN ?? "";
  const headers: Record<string, string> = agentToken ? { "X-Agent-Token": agentToken } : {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(symlinksUrl, { method: "GET", headers, signal: controller.signal });

    // Parse the body regardless of HTTP status: the agent returns HTTP 503 when
    // ok=false but still includes { ok, nonSymlinks } in the JSON body. Bailing
    // out early on !res.ok would discard the list of offending vhost names,
    // which is the core data this probe exists to surface.
    const data = await res.json().catch(() => null) as {
      ok?: boolean;
      nonSymlinks?: string[];
      error?: string;
    } | null;

    if (data === null) {
      // Body was not parseable JSON — agent is unreachable or returned an error page.
      return { configured: true, ok: false, nonSymlinks: [], error: `HTTP ${res.status} (response unparseable)` };
    }

    const nonSymlinks: string[] = Array.isArray(data.nonSymlinks) ? data.nonSymlinks : [];
    // Trust data.ok when present (agent sets it explicitly); fall back to
    // deriving from nonSymlinks length if absent.
    const ok = typeof data.ok === "boolean" ? data.ok : nonSymlinks.length === 0;
    return { configured: true, ok, nonSymlinks, ...(data.error ? { error: data.error } : {}) };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    return { configured: true, ok: false, nonSymlinks: [], error: sanitizeError(raw) };
  } finally {
    clearTimeout(timer);
  }
}

// ── nginx ─────────────────────────────────────────────────────────────────────
export async function probeNginxInfra(): Promise<InfraServiceHealth> {
  const base = process.env.NGINX_MONITOR_URL?.trim().replace(/\/$/, "");
  if (!base) {
    return { configured: false, ok: false, latencyMs: null, url: null, history: getHistory("nginx"), probeLog: getProbeLog("nginx") };
  }
  const r = await httpProbe(`${base}/`, {}, (s) => s < 500);
  if (!r.ok) {
    const error = r.error ?? "HTTP error";
    console.error("[thinkcentre-probe] nginx KO", { error });
    recordError("nginx", error);
    recordProbeLog("nginx", { timestamp: Date.now(), ok: false, latencyMs: r.latencyMs, detail: error });
    return { configured: true, ok: false, latencyMs: r.latencyMs, url: maskUrl(base), error, history: getHistory("nginx"), probeLog: getProbeLog("nginx") };
  }
  recordProbeLog("nginx", { timestamp: Date.now(), ok: true, latencyMs: r.latencyMs, detail: "HTTP OK" });
  return { configured: true, ok: true, latencyMs: r.latencyMs, url: maskUrl(base), history: getHistory("nginx"), probeLog: getProbeLog("nginx") };
}

// ── Uptime Kuma ───────────────────────────────────────────────────────────────
export async function probeUptimeKuma(): Promise<InfraServiceHealth> {
  const base = process.env.UPTIME_KUMA_URL?.trim().replace(/\/$/, "");
  if (!base) {
    return { configured: false, ok: false, latencyMs: null, url: null, history: getHistory("uptimekuma"), probeLog: getProbeLog("uptimekuma") };
  }
  const r = await httpProbe(`${base}/`, {}, (s) => s < 500);
  if (!r.ok) {
    const error = r.error ?? "HTTP error";
    console.error("[thinkcentre-probe] uptimekuma KO", { error });
    recordError("uptimekuma", error);
    recordProbeLog("uptimekuma", { timestamp: Date.now(), ok: false, latencyMs: r.latencyMs, detail: error });
    return { configured: true, ok: false, latencyMs: r.latencyMs, url: maskUrl(base), error, history: getHistory("uptimekuma"), probeLog: getProbeLog("uptimekuma") };
  }
  recordProbeLog("uptimekuma", { timestamp: Date.now(), ok: true, latencyMs: r.latencyMs, detail: "HTTP OK" });
  return { configured: true, ok: true, latencyMs: r.latencyMs, url: maskUrl(base), history: getHistory("uptimekuma"), probeLog: getProbeLog("uptimekuma") };
}

// ── AI Hub ────────────────────────────────────────────────────────────────────
// Probe verso {AI_HUB_URL}/health usando hubGet() che include automaticamente
// X-Hub-Gate-Token + CF Access headers — consistente con ai-hub-collector.ts.
// Also fetches /vram to read agentMapSource (Task #549).
export async function probeAiHub(): Promise<InfraServiceHealth> {
  if (!isHubConfigured()) {
    return { configured: false, ok: false, latencyMs: null, url: null, history: getHistory("aihub"), probeLog: getProbeLog("aihub") };
  }
  const displayUrl = maskUrl(getHubBaseUrl());
  const t0 = Date.now();
  const [healthResult, vramResult] = await Promise.all([
    hubGet("/health", undefined, HUB_HEALTH_TIMEOUT_MS),
    hubGet<{ agentMapSource?: string }>("/vram", undefined, HUB_VRAM_TIMEOUT_MS),
  ]);
  const latencyMs = Date.now() - t0;
  const healthy = healthResult.ok && (healthResult.data as { ok?: boolean } | undefined)?.ok !== false;
  if (!healthy) {
    const error = healthResult.error ?? (healthResult.status ? `HTTP ${healthResult.status}` : "unreachable");
    console.error("[thinkcentre-probe] ai-hub KO", { error });
    recordError("aihub", error);
    recordProbeLog("aihub", { timestamp: Date.now(), ok: false, latencyMs, detail: error });
    return { configured: true, ok: false, latencyMs, url: displayUrl, error, history: getHistory("aihub"), probeLog: getProbeLog("aihub") };
  }
  const rawSource = vramResult.ok ? (vramResult.data?.agentMapSource ?? null) : null;
  const vramAgentMapSource: "default" | "pushed" | null =
    rawSource === "pushed" ? "pushed" : rawSource === "default" ? "default" : null;
  recordProbeLog("aihub", { timestamp: Date.now(), ok: true, latencyMs, detail: `health OK · agentMapSource=${vramAgentMapSource ?? "unknown"}` });
  return { configured: true, ok: true, latencyMs, url: displayUrl, history: getHistory("aihub"), probeLog: getProbeLog("aihub"), vramAgentMapSource };
}
