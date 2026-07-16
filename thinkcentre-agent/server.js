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
 *   PORT          — porta di ascolto (default: 9199)
 *                   NB: 9101 è occupata da Bacula Director sul ThinkCentre.
 *   AGENT_TOKEN   — se impostato, richiede header "X-Agent-Token: <token>"
 *   DISK_PATH     — path del disco da monitorare (default: /)
 */

const http = require("http");
const net  = require("net");
const os   = require("os");
const nodePath = require("path");
const { execSync, exec } = require("child_process");

const PORT        = parseInt(process.env.PORT || "9199", 10);
const AGENT_TOKEN = process.env.AGENT_TOKEN || "";
const DISK_PATH   = process.env.DISK_PATH   || "/";

// Reverse-proxy verso il Kalman filter service (localhost-only, vedi
// infra/self-host/kalman/). Nessuna ingress Cloudflare dedicata: le richieste
// entrano da tc.biker-link.net → questo agente → /kalman/* → servizio locale,
// riusando l'autenticazione già applicata qui (X-Agent-Token + CF Access edge).
const KALMAN_URL = (process.env.KALMAN_URL || "http://127.0.0.1:9210").replace(/\/$/, "");

// Reverse-proxy verso l'ai-hub (localhost-only, /home/andrea/ai-hub, pm2 :4405),
// hub AI condiviso BikerLink/BikerBlog. Le richieste entrano da
// tc.biker-link.net/ai-hub/* → questo agente → ai-hub. A differenza di Kalman,
// l'ai-hub verifica il PROPRIO gate token (X-Hub-Gate-Token) per ogni chiamata:
// perciò /ai-hub/* è ESENTE dal controllo X-Agent-Token dell'agente (l'auth resta
// garantita da CF Access all'edge + gate token dell'hub). Vedi BikerLink task #153.
const AI_HUB_URL = (process.env.AI_HUB_URL || "http://127.0.0.1:4405").replace(/\/$/, "");

// Daemon ufw-status (localhost-only, systemd bikerlink-ufw-status, :9099) che
// espone lo stato del firewall UFW come JSON. Le richieste entrano da
// tc.biker-link.net/ufw-status → questo agente → daemon :9099. Protetto da
// X-Agent-Token come il resto dell'agente (a differenza di /ai-hub).
//
// Architettura: il tunnel Cloudflare punta DIRETTAMENTE a questo agente (porta
// 9199); nginx NON è nel path per tc.biker-link.net. Non esiste né è necessario
// alcun location-block nginx per /ufw-status — il routing è interamente gestito
// qui. (Il file /etc/nginx/sites-available/bikerlink-ufw-status.conf, che
// riportava istruzioni di incolla-manuale obsolete, è stato rimosso dal TC.)
const UFW_STATUS_URL = (process.env.UFW_DAEMON_URL || "http://127.0.0.1:9099").replace(/\/$/, "");

const PROBE_TIMEOUT_MS = 3000;
const PROXY_TIMEOUT_MS = 5000;

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

/** HTTP GET locale con passthrough del body JSON — usato per il daemon ufw-status */
function localHttpGetJson(url) {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ ok: false, status: 504, body: JSON.stringify({ status: "error", detail: "ufw daemon timeout" }) }),
      PROBE_TIMEOUT_MS,
    );
    const req = http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        clearTimeout(timer);
        const status = res.statusCode || 502;
        resolve({ ok: status >= 200 && status < 300, status, body: data });
      });
    });
    req.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, status: 503, body: JSON.stringify({ status: "error", detail: err.message }) });
    });
  });
}

// ── Probe endpoints config ────────────────────────────────────────────────────

/**
 * Verifica che ogni voce di /etc/nginx/sites-enabled/ sia un symlink.
 * Un file reale (non symlink) causa il bug "nginx -t passa ma le modifiche a
 * sites-available/ non hanno effetto a runtime". Restituisce ok=false + la
 * lista dei file non-symlink se ne trova almeno uno.
 */
function checkNginxSymlinks() {
  const fs = require("fs");
  const dir = "/etc/nginx/sites-enabled";
  try {
    const entries = fs.readdirSync(dir);
    const nonSymlinks = entries.filter((entry) => {
      try {
        return !fs.lstatSync(`${dir}/${entry}`).isSymbolicLink();
      } catch {
        return false; // ignora voci non accessibili
      }
    });
    const ok = nonSymlinks.length === 0;
    return Promise.resolve({ ok, nonSymlinks, dir });
  } catch (err) {
    return Promise.resolve({ ok: false, nonSymlinks: [], dir, error: String(err) });
  }
}

const PROBE_ROUTES = {
  "/probe/nginx":          () => localHttpProbe("http://localhost:80/"),
  "/probe/nginx-symlinks": checkNginxSymlinks,
  "/probe/pgadmin":        () => localHttpProbe("http://localhost:5050/"),
  "/probe/uptime-kuma":    () => localHttpProbe("http://localhost:3001/"),
  "/probe/redis":          () => tcpProbe("localhost", 6379),
  "/probe/postgres":       () => tcpProbe("localhost", 5432),
};

// ── HTTP Server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url    = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method.toUpperCase();
  const path   = url.pathname.replace(/\/$/, "") || "/";

  // /ai-hub/* è esente dal token dell'agente: l'ai-hub applica il proprio gate
  // token (X-Hub-Gate-Token) e CF Access protegge già l'edge (task #153).
  const isAiHubPath = path === "/ai-hub" || path.startsWith("/ai-hub/");

  // Auth
  if (AGENT_TOKEN && !isAiHubPath) {
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

  // Stato firewall UFW — passthrough del daemon bikerlink-ufw-status (:9099).
  // Risponde con il JSON del daemon ({ status, ruleCount }) così il probe
  // server-side (UFW_STATUS_URL) può leggerlo direttamente. Auth: X-Agent-Token
  // (già verificato sopra).
  if (method === "GET" && path === "/ufw-status") {
    const r = await localHttpGetJson(`${UFW_STATUS_URL}/`);
    res.writeHead(r.ok ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(r.body || JSON.stringify({ status: "error", detail: "empty response" }));
    return;
  }

  // Self-update: git pull + pm2 restart (POST /self-update)
  if (method === "POST" && path === "/self-update") {
    const repoRoot = nodePath.resolve(__dirname, "..");
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    const startedAt = Date.now();
    exec(
      `git -C "${repoRoot}" pull origin main 2>&1 && pm2 restart bikerlink-agent 2>&1`,
      { timeout: 30000 },
      (err, stdout, stderr) => {
        const output = (stdout || "") + (stderr || "");
        const ok = !err;
        res.end(JSON.stringify({ ok, output: output.trim(), elapsedMs: Date.now() - startedAt }));
      }
    );
    return;
  }

  // Reverse-proxy Kalman filter service (localhost:9210 di default).
  // Inoltra qualunque metodo su /kalman/* → KALMAN_URL, strippando il prefisso.
  // L'auth è già stata verificata sopra (X-Agent-Token + CF Access all'edge),
  // quindi il servizio a valle bind solo su 127.0.0.1 senza auth propria.
  if (path === "/kalman" || path.startsWith("/kalman/")) {
    const targetPath = url.pathname.replace(/^\/kalman/, "") || "/";
    const target = new URL(KALMAN_URL + targetPath + url.search);
    const proxyReq = http.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        path: target.pathname + target.search,
        method,
        headers: { ...req.headers, host: target.host },
        timeout: PROXY_TIMEOUT_MS,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("timeout", () => {
      proxyReq.destroy(new Error("upstream timeout"));
    });
    proxyReq.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: `kalman service unreachable: ${err.message}` }));
      } else {
        res.destroy();
      }
    });
    req.pipe(proxyReq);
    return;
  }

  // Reverse-proxy ai-hub (localhost:4405). Inoltra qualunque metodo su /ai-hub/*
  // → AI_HUB_URL strippando il prefisso. Nessun controllo X-Agent-Token qui: la
  // richiesta porta il proprio X-Hub-Gate-Token che l'hub verifica (task #153).
  if (isAiHubPath) {
    const targetPath = url.pathname.replace(/^\/ai-hub/, "") || "/";
    const target = new URL(AI_HUB_URL + targetPath + url.search);
    const proxyReq = http.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        path: target.pathname + target.search,
        method,
        headers: { ...req.headers, host: target.host },
        timeout: PROXY_TIMEOUT_MS,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("timeout", () => {
      proxyReq.destroy(new Error("upstream timeout"));
    });
    proxyReq.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: `ai-hub unreachable: ${err.message}` }));
      } else {
        res.destroy();
      }
    });
    req.pipe(proxyReq);
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
  console.log(`[bikerlink-agent] /probe/nginx-symlinks → verifica che sites-enabled/ siano tutti symlink`);
  console.log(`[bikerlink-agent] /probe/pgadmin        → check pgAdmin localhost:5050`);
  console.log(`[bikerlink-agent] /probe/uptime-kuma    → check Uptime Kuma localhost:3001`);
  console.log(`[bikerlink-agent] /probe/redis          → check Redis TCP localhost:6379`);
  console.log(`[bikerlink-agent] /probe/postgres       → check PostgreSQL TCP localhost:5432`);
  console.log(`[bikerlink-agent] /ufw-status           → stato firewall UFW via daemon localhost:9099`);
  console.log(`[bikerlink-agent] POST /self-update     → git pull origin main + pm2 restart bikerlink-agent`);
});

server.on("error", (err) => {
  console.error("[bikerlink-agent] ERRORE:", err.message);
  process.exit(1);
});
