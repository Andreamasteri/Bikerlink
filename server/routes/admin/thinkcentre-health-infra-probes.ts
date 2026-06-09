/**
 * ThinkCentre — Infra probes
 *
 * Probe TCP per Redis e PostgreSQL, probe HTTP per pgAdmin, nginx e Uptime Kuma.
 * Importati da thinkcentre-health.ts.
 *
 * Env vars:
 *   REDIS_PROBE_HOST      hostname/IP Redis sul ThinkCentre (es. 192.168.1.35)
 *   REDIS_PROBE_PORT      porta Redis (default: 6379)
 *   POSTGRES_PROBE_HOST   hostname/IP PostgreSQL sul ThinkCentre
 *   POSTGRES_PROBE_PORT   porta PostgreSQL (default: 5432)
 *   PGADMIN_URL           URL pgAdmin (es. http://192.168.1.35:5050)
 *   NGINX_MONITOR_URL     URL nginx (es. http://192.168.1.35:80)
 *   UPTIME_KUMA_URL       URL Uptime Kuma (es. http://127.0.0.1:3001)
 */

import * as net from "net";
import {
  PROBE_TIMEOUT_MS,
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

// ── TCP probe helper ──────────────────────────────────────────────────────────
function tcpConnect(
  host: string,
  port: number,
): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, latencyMs: null, error: "timeout" });
    }, PROBE_TIMEOUT_MS);

    socket.on("connect", () => {
      clearTimeout(timeout);
      const latencyMs = Date.now() - t0;
      socket.destroy();
      resolve({ ok: true, latencyMs });
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, latencyMs: Date.now() - t0, error: sanitizeError(err.message) });
    });
  });
}

// ── Redis ─────────────────────────────────────────────────────────────────────
export async function probeRedisInfra(): Promise<InfraServiceHealth> {
  const host = process.env.REDIS_PROBE_HOST?.trim();
  const port = parseInt(process.env.REDIS_PROBE_PORT ?? "6379", 10);
  if (!host) {
    return { configured: false, ok: false, latencyMs: null, url: null, history: getHistory("redis"), probeLog: getProbeLog("redis") };
  }
  const displayUrl = `${host}:${port}`;
  const r = await tcpConnect(host, port);
  if (!r.ok) {
    const error = r.error ?? "connection refused";
    console.error("[thinkcentre-probe] redis KO", { error });
    recordError("redis", error);
    recordProbeLog("redis", { timestamp: Date.now(), ok: false, latencyMs: r.latencyMs, detail: error });
    return { configured: true, ok: false, latencyMs: r.latencyMs, url: displayUrl, error, history: getHistory("redis"), probeLog: getProbeLog("redis") };
  }
  recordProbeLog("redis", { timestamp: Date.now(), ok: true, latencyMs: r.latencyMs, detail: "TCP connect OK" });
  return { configured: true, ok: true, latencyMs: r.latencyMs, url: displayUrl, history: getHistory("redis"), probeLog: getProbeLog("redis") };
}

// ── PostgreSQL ────────────────────────────────────────────────────────────────
export async function probePostgresInfra(): Promise<InfraServiceHealth> {
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
