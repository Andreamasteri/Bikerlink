/**
 * ThinkCentre — Infra probes
 *
 * Probe TCP per DragonflyDB e PostgreSQL, probe HTTP per pgAdmin, nginx e Uptime Kuma.
 * Importati da thinkcentre-health.ts.
 *
 * Env vars:
 *   REDIS_PROBE_URL       URL HTTP del probe Redis via TC agent (es. https://tc.biker-link.net/probe/redis)
 *                         Se impostato ha precedenza su REDIS_PROBE_HOST (modalità TCP diretta).
 *   REDIS_PROBE_HOST      hostname/IP Redis (TCP diretto, fallback se REDIS_PROBE_URL non impostato)
 *   REDIS_PROBE_PORT      porta Redis (default: 6379, usato solo in modalità TCP)
 *   POSTGRES_PROBE_URL    URL HTTP del probe PostgreSQL via TC agent (es. https://tc.biker-link.net/probe/postgres)
 *                         Se impostato ha precedenza su POSTGRES_PROBE_HOST (modalità TCP diretta).
 *   POSTGRES_PROBE_HOST   hostname/IP PostgreSQL sul ThinkCentre (TCP diretto, fallback se POSTGRES_PROBE_URL non impostato)
 *   POSTGRES_PROBE_PORT   porta PostgreSQL (default: 5432, usato solo in modalità TCP)
 *   PGADMIN_URL           URL pgAdmin — punta al probe TC agent: https://tc.biker-link.net/probe/pgadmin
 *   NGINX_MONITOR_URL     URL nginx  — punta al probe TC agent: https://tc.biker-link.net/probe/nginx
 *   UPTIME_KUMA_URL       URL Uptime Kuma — punta al probe TC agent: https://tc.biker-link.net/probe/uptime-kuma
 */

import { tcpConnectDetailed } from "../../jobs/thinkcentre-monitor-probes";
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

// ── PostgreSQL ────────────────────────────────────────────────────────────────
export async function probePostgresInfra(): Promise<InfraServiceHealth> {
  // Modalità HTTP via TC agent (POSTGRES_PROBE_URL ha precedenza)
  const probeUrl = process.env.POSTGRES_PROBE_URL?.trim();
  if (probeUrl) {
    const agentToken = process.env.THINKCENTRE_AGENT_TOKEN ?? "";
    // Solo 2xx = up; 401/403 = auth (token TC mancante/errato), vedi Dragonfly sopra.
    const r = await httpProbe(probeUrl, agentToken ? { "X-Agent-Token": agentToken } : {}, (s) => s >= 200 && s < 300);
    if (!r.ok) {
      const error = classifyAgentAuthError(r.error, agentToken);
      recordError("postgres", error);
      recordProbeLog("postgres", { timestamp: Date.now(), ok: false, latencyMs: r.latencyMs, detail: error });
      return { configured: true, ok: false, latencyMs: r.latencyMs, url: probeUrl, error, history: getHistory("postgres"), probeLog: getProbeLog("postgres") };
    }
    recordProbeLog("postgres", { timestamp: Date.now(), ok: true, latencyMs: r.latencyMs, detail: "HTTP probe OK" });
    return { configured: true, ok: true, latencyMs: r.latencyMs, url: probeUrl, history: getHistory("postgres"), probeLog: getProbeLog("postgres") };
  }

  // Modalità TCP diretta (fallback)
  const host = process.env.POSTGRES_PROBE_HOST?.trim();
  const port = parseInt(process.env.POSTGRES_PROBE_PORT ?? "5432", 10);
  if (!host) {
    return { configured: false, ok: false, latencyMs: null, url: null, history: getHistory("postgres"), probeLog: getProbeLog("postgres") };
  }
  const displayUrl = `${host}:${port}`;
  const r = await tcpConnect(host, port);
  if (!r.ok) {
    const error = r.error ?? "connection refused";
    console.error("[thinkcentre-probe] postgres KO", { error });
    recordError("postgres", error);
    recordProbeLog("postgres", { timestamp: Date.now(), ok: false, latencyMs: r.latencyMs, detail: error });
    return { configured: true, ok: false, latencyMs: r.latencyMs, url: displayUrl, error, history: getHistory("postgres"), probeLog: getProbeLog("postgres") };
  }
  recordProbeLog("postgres", { timestamp: Date.now(), ok: true, latencyMs: r.latencyMs, detail: "TCP connect OK" });
  return { configured: true, ok: true, latencyMs: r.latencyMs, url: displayUrl, history: getHistory("postgres"), probeLog: getProbeLog("postgres") };
}

// ── pgAdmin ───────────────────────────────────────────────────────────────────
export async function probePgAdmin(): Promise<InfraServiceHealth> {
  const base = process.env.PGADMIN_URL?.trim().replace(/\/$/, "");
  if (!base) {
    return { configured: false, ok: false, latencyMs: null, url: null, history: getHistory("pgadmin"), probeLog: getProbeLog("pgadmin") };
  }
  const r = await httpProbe(`${base}/`, {}, (s) => s < 500);
  if (!r.ok) {
    const error = r.error ?? "HTTP error";
    console.error("[thinkcentre-probe] pgadmin KO", { error });
    recordError("pgadmin", error);
    recordProbeLog("pgadmin", { timestamp: Date.now(), ok: false, latencyMs: r.latencyMs, detail: error });
    return { configured: true, ok: false, latencyMs: r.latencyMs, url: maskUrl(base), error, history: getHistory("pgadmin"), probeLog: getProbeLog("pgadmin") };
  }
  recordProbeLog("pgadmin", { timestamp: Date.now(), ok: true, latencyMs: r.latencyMs, detail: "HTTP OK" });
  return { configured: true, ok: true, latencyMs: r.latencyMs, url: maskUrl(base), history: getHistory("pgadmin"), probeLog: getProbeLog("pgadmin") };
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
