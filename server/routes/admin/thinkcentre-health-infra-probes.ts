/**
 * ThinkCentre — Infra probes
 *
 * Probe TCP per Redis e PostgreSQL, probe HTTP per pgAdmin, nginx e Uptime Kuma.
 * Importati da thinkcentre-health.ts.
 *
 * Env vars:
 *   REDIS_PROBE_URL       URL HTTP del probe Redis via TC agent (es. https://tc.biker-link.net/probe/redis)
 *                         Se impostato ha precedenza su REDIS_PROBE_HOST (modalità TCP diretta).
 *   REDIS_PROBE_HOST      hostname/IP Redis (TCP diretto, fallback se REDIS_PROBE_URL non impostato)
 *   REDIS_PROBE_PORT      porta Redis (default: 6379, usato solo in modalità TCP)
 *   POSTGRES_PROBE_HOST   hostname/IP PostgreSQL sul ThinkCentre (TCP diretto)
 *   POSTGRES_PROBE_PORT   porta PostgreSQL (default: 5432)
 *   PGADMIN_URL           URL pgAdmin — punta al probe TC agent: https://tc.biker-link.net/probe/pgadmin
 *   NGINX_MONITOR_URL     URL nginx  — punta al probe TC agent: https://tc.biker-link.net/probe/nginx
 *   UPTIME_KUMA_URL       URL Uptime Kuma — punta al probe TC agent: https://tc.biker-link.net/probe/uptime-kuma
 */

import * as net from "net";
import { RUNNING_UNDER_TEST } from "../../jobs/thinkcentre-monitor-probes";
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
  // Test-mode guard (riusa il flag unico da thinkcentre-monitor-probes): sotto il
  // test runner non apriamo socket reali. Con i fake timers il setTimeout di abort
  // non scatta e il socket verso un host irraggiungibile non emette né `connect`
  // né `error`, quindi la promise non si risolverebbe e il test si bloccherebbe
  // ~15s. Risolviamo subito così le probe TCP admin restano isolate nei test.
  if (RUNNING_UNDER_TEST) {
    return Promise.resolve({ ok: false, latencyMs: null, error: "skipped (test mode)" });
  }
  const t0 = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({
        ok: false,
        latencyMs: null,
        error: `timeout (>${Math.round(PROBE_TIMEOUT_MS / 1000)} s) — TCP timeout`,
      });
    }, PROBE_TIMEOUT_MS);

    socket.on("connect", () => {
      clearTimeout(timeout);
      const latencyMs = Date.now() - t0;
      socket.destroy();
      resolve({ ok: true, latencyMs });
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      const raw = err.message;
      let classified: string;
      if (/ECONNREFUSED|ENOTFOUND/i.test(raw)) {
        classified = `network error — ${raw}`;
      } else {
        classified = raw;
      }
      resolve({ ok: false, latencyMs: Date.now() - t0, error: sanitizeError(classified) });
    });
  });
}

// ── Redis ─────────────────────────────────────────────────────────────────────
export async function probeRedisInfra(): Promise<InfraServiceHealth> {
  // Modalità HTTP via TC agent (REDIS_PROBE_URL ha precedenza)
  const probeUrl = process.env.REDIS_PROBE_URL?.trim();
  if (probeUrl) {
    const agentToken = process.env.THINKCENTRE_AGENT_TOKEN ?? "";
    const r = await httpProbe(probeUrl, agentToken ? { "X-Agent-Token": agentToken } : {}, (s) => s < 500);
    if (!r.ok) {
      const error = r.error ?? "HTTP error";
      recordError("redis", error);
      recordProbeLog("redis", { timestamp: Date.now(), ok: false, latencyMs: r.latencyMs, detail: error });
      return { configured: true, ok: false, latencyMs: r.latencyMs, url: probeUrl, error, history: getHistory("redis"), probeLog: getProbeLog("redis") };
    }
    recordProbeLog("redis", { timestamp: Date.now(), ok: true, latencyMs: r.latencyMs, detail: "HTTP probe OK" });
    return { configured: true, ok: true, latencyMs: r.latencyMs, url: probeUrl, history: getHistory("redis"), probeLog: getProbeLog("redis") };
  }

  // Modalità TCP diretta (fallback)
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
