#!/usr/bin/env node
/**
 * BikerLink — ThinkCentre Agent
 *
 * Agente leggero che espone le metriche hardware del server di casa
 * al pannello admin di BikerLink via GET /sys-metrics.
 * Espone anche /probe/* per check interni LAN (nginx, Redis, pgAdmin, Uptime Kuma).
 *
 * Zero dipendenze npm — solo moduli Node.js built-in.
 *
 * Avvio rapido:
 *   node server.js
 *
 * Con token di autenticazione:
 *   AGENT_TOKEN=segreto node server.js
 *
 * Con pm2 (avvio automatico al boot):
 *   pm2 start server.js --name bikerlink-agent
 *   pm2 save
 *   pm2 startup
 *
 * Variabili d'ambiente:
 *   PORT          — porta di ascolto (default: 9101)
 *   AGENT_TOKEN   — se impostato, richiede header "X-Agent-Token: <token>"
 *   DISK_PATH     — path del disco da monitorare (default: /)
 */

const http = require("http");
const net  = require("net");
const os   = require("os");
const { execSync } = require("child_process");

const PORT        = parseInt(process.env.PORT || "9101", 10);
const AGENT_TOKEN = process.env.AGENT_TOKEN || "";
const DISK_PATH   = process.env.DISK_PATH   || "/";

const PROBE_TIMEOUT_MS = 3000;

// ── Helpers metriche ─────────────────────────────────────────────────────────

function getCpuMetrics() {
  const load  = os.loadavg();
  const cores = os.cpus().length;
  return {
    loadAvg1:  parseFloat(load[0].toFixed(2)),
    loadAvg5:  parseFloat(load[1].toFixed(2)),
    loadAvg15: parseFloat(load[2].toFixed(2)),
    cores,
  };
}

function getMemoryMetrics() {
  const totalBytes = os.totalmem();
  const freeBytes  = os.freemem();
  const usedBytes  = totalBytes - freeBytes;
  const totalMb    = Math.round(totalBytes / 1024 / 1024);
  const usedMb     = Math.round(usedBytes  / 1024 / 1024);
  const freeMb     = Math.round(freeBytes  / 1024 / 1024);
  const usedPercent = Math.round((usedBytes / totalBytes) * 100);
  return { totalMb, usedMb, freeMb, usedPercent };
}

function getDiskMetrics(path) {
  try {
    const out = execSync(`df -B1 "${path}" 2>/dev/null`, { timeout: 3000 })
      .toString().trim().split("\n");
    if (out.length < 2) return null;
    const cols = out[1].split(/\s+/);
    const totalBytes = parseInt(cols[1], 10);
    const usedBytes  = parseInt(cols[2], 10);
    const freeBytes  = parseInt(cols[3], 10);
    if (isNaN(totalBytes) || totalBytes === 0) return null;
    return {
      totalGb:    parseFloat((totalBytes / 1e9).toFixed(1)),
      usedGb:     parseFloat((usedBytes  / 1e9).toFixed(1)),
      freeGb:     parseFloat((freeBytes  / 1e9).toFixed(1)),
      usedPercent: Math.round((usedBytes / totalBytes) * 100),
    };
  } catch {
    return null;
  }
}

function getUptimeSec() {
  return Math.floor(os.uptime());
}

function buildMetrics() {
  return {
    cpu:      getCpuMetrics(),
    memory:   getMemoryMetrics(),
    disk:     getDiskMetrics(DISK_PATH),
    uptimeSec: getUptimeSec(),
    checkedAt: Date.now(),
  };
}

// ── Probe helpers (check servizi LAN dal localhost) ───────────────────────────

/** TCP connect probe — usato per Redis */
function tcpProbe(host, port) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, latencyMs: null, detail: "timeout" });
    }, PROBE_TIMEOUT_MS);
    socket.on("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ ok: true, latencyMs: Date.now() - t0, detail: "TCP connect OK" });
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, latencyMs: Date.now() - t0, detail: err.message });
    });
  });
}

/** HTTP GET probe locale — usato per nginx, pgAdmin, Uptime Kuma */
function localHttpProbe(url) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, latencyMs: null, httpStatus: null, detail: "timeout" }), PROBE_TIMEOUT_MS);
    const req = http.get(url, (res) => {
      clearTimeout(timer);
      res.resume();
      const latencyMs = Date.now() - t0;
      const ok = res.statusCode < 500;
      resolve({ ok, latencyMs, httpStatus: res.statusCode, detail: `HTTP ${res.statusCode}` });
    });
    req.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, latencyMs: Date.now() - t0, httpStatus: null, detail: err.message });
    });
  });
}

// ── Probe endpoints config ────────────────────────────────────────────────────

const PROBE_ROUTES = {
  "/probe/nginx":        () => localHttpProbe("http://localhost:80/"),
  "/probe/pgadmin":      () => localHttpProbe("http://localhost:5050/"),
  "/probe/uptime-kuma":  () => localHttpProbe("http://localhost:3001/"),
  "/probe/redis":        () => tcpProbe("localhost", 6379),
  "/probe/postgres":     () => tcpProbe("localhost", 5432),
};

// ── HTTP Server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url    = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method.toUpperCase();
  const path   = url.pathname.replace(/\/$/, "") || "/";

  // Auth
  if (AGENT_TOKEN) {
    const tok = req.headers["x-agent-token"] || url.searchParams.get("token") || "";
    if (tok !== AGENT_TOKEN) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  // Health ping
  if (method === "GET" && path === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, agent: "bikerlink-thinkcentre" }));
    return;
  }

  // Metriche hardware
  if (method === "GET" && path === "/sys-metrics") {
    try {
      const data = buildMetrics();
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  // Probe servizi LAN
  if (method === "GET" && PROBE_ROUTES[path]) {
    try {
      const result = await PROBE_ROUTES[path]();
      const status = result.ok ? 200 : 503;
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ...result, checkedAt: Date.now() }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, detail: String(err) }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  const tokenInfo = AGENT_TOKEN ? "auth ON (X-Agent-Token)" : "auth OFF (nessun token)";
  console.log(`[bikerlink-agent] In ascolto su http://0.0.0.0:${PORT} — ${tokenInfo}`);
  console.log(`[bikerlink-agent] /sys-metrics         → CPU + RAM + disco (${DISK_PATH}) + uptime`);
  console.log(`[bikerlink-agent] /probe/nginx          → check nginx localhost:80`);
  console.log(`[bikerlink-agent] /probe/pgadmin        → check pgAdmin localhost:5050`);
  console.log(`[bikerlink-agent] /probe/uptime-kuma    → check Uptime Kuma localhost:3001`);
  console.log(`[bikerlink-agent] /probe/redis          → check Redis TCP localhost:6379`);
  console.log(`[bikerlink-agent] /probe/postgres       → check PostgreSQL TCP localhost:5432`);
});

server.on("error", (err) => {
  console.error("[bikerlink-agent] ERRORE:", err.message);
  process.exit(1);
});
